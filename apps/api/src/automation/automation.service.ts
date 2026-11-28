import { Injectable, Logger } from "@nestjs/common";
import { createHmac } from "node:crypto";
import type { AutomationRule, AutomationRuleKind, AutomationScenario, MessageChannel, Prisma } from "@fove/database";
import { addLocalDays, birthdayOffset, computeCustomerSegment, isLocalHourBetween, localDateKey, localMidnightUtc, safeTimeZone, zonedParts } from "@fove/shared";
import { loadConfig } from "../config";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";
import { badRequest, isUniqueViolation, notFound } from "../common/errors";
import type { TenantContext } from "../common/context";
import { PlanService } from "../billing/plan.service";
import { CardsService } from "../cards/cards.service";
import { LedgerService } from "../loyalty/ledger.service";
import { EmailService } from "../notifications/email.service";
import { emailHtml } from "../i18n/email-layout";
import { formatDay } from "../i18n/format";
import { tenantLocale, type Locale } from "../i18n/locale";
import { defaultAutomationText, fillTemplate, formatUnits, type MessageText } from "../i18n/automation-texts";

const DAY = 86_400_000;
/** Plage d'envoi, à l'heure du commerce. */
export const SEND_FROM_HOUR = 10;
export const SEND_TO_HOUR = 19;
/** Au plus une relance par client sur cette durée (l'anniversaire n'est pas compté). */
export const RELAUNCH_CAP_DAYS = 14;
/** Messages par commerce et par passage (la tâche tourne toutes les 5 minutes). */
const MAX_PER_RUN = 200;
/** Au-delà, un client parti n'est plus relancé (fichiers anciens). */
const DORMANT_MAX_DAYS = 365;

export const RELAUNCH_KINDS = ["REWARD_WAITING", "NEAR_REWARD", "DORMANT", "AT_RISK"] as const satisfies readonly AutomationRuleKind[];
const RELAUNCH_SCENARIOS: AutomationScenario[] = ["NEAR_REWARD", "REWARD_WAITING", "AT_RISK", "DORMANT"];

export interface RuleInput {
  enabled: boolean;
  title?: string | null;
  body?: string | null;
  bonus?: number | null;
  giftLabel?: string | null;
  daysBefore?: number;
  daysAfter?: number;
  dayTitle?: string | null;
  dayBody?: string | null;
}

interface TenantInfo {
  id: string;
  name: string;
  locale: Locale;
  timeZone: string;
  color: string | null;
}

interface Candidate {
  customerId: string;
  /** Carte qui reçoit le message (null : client sans carte active, email seulement). */
  accountId: string | null;
  firstName: string;
  email: string | null;
  emailConsent: boolean;
  scenario: AutomationScenario;
  key: string;
  values: Record<string, string>;
  bonus?: { delta: number; mode: "STAMPS" | "POINTS" };
}

/** Désinscription des emails marketing d'un commerce : signature du lien. */
export function unsubscribeSignature(customerId: string): string {
  return createHmac("sha256", loadConfig().APP_ENCRYPTION_KEY).update(`unsubscribe:${customerId}`).digest("base64url").slice(0, 24);
}

/**
 * Relances automatiques et anniversaire (docs/chantier-relances-anniversaire.md). Une fois par jour et par
 * commerce, dans la plage 10 h – 19 h à son heure locale : choix des clients par scénario, message sur la
 * carte Wallet et, avec consentement, par email ; plafond d'une relance tous les 14 jours ; journal unique.
 * Offres payantes seulement (fonction `walletCampaigns`).
 */
@Injectable()
export class AutomationService {
  private readonly logger = new Logger("Automation");

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly plans: PlanService,
    private readonly cards: CardsService,
    private readonly ledger: LedgerService,
    private readonly email: EmailService,
  ) {}

  // --- Réglages ---------------------------------------------------------------------------------

  async rules(tenantId: string) {
    const [rows, tenant, features] = await Promise.all([
      this.prisma.client.automationRule.findMany({ where: { tenantId } }),
      this.tenantInfo(tenantId),
      this.plans.features(tenantId),
    ]);
    const kinds: AutomationRuleKind[] = ["NEAR_REWARD", "REWARD_WAITING", "AT_RISK", "DORMANT", "BIRTHDAY"];
    return {
      available: features.walletCampaigns,
      rules: kinds.map((kind) => {
        const row = rows.find((r) => r.kind === kind);
        const defaults = kind === "BIRTHDAY" ? defaultAutomationText(tenant.locale, "BIRTHDAY_SOON") : defaultAutomationText(tenant.locale, kind);
        const day = defaultAutomationText(tenant.locale, "BIRTHDAY_DAY");
        return {
          kind,
          enabled: row?.enabled ?? false,
          title: row?.title ?? null,
          body: row?.body ?? null,
          bonus: row?.bonus ?? null,
          giftLabel: row?.giftLabel ?? null,
          daysBefore: row?.daysBefore ?? 3,
          daysAfter: row?.daysAfter ?? 7,
          dayTitle: row?.dayTitle ?? null,
          dayBody: row?.dayBody ?? null,
          defaults: kind === "BIRTHDAY" ? { ...defaults, dayTitle: day.title, dayBody: day.body } : defaults,
        };
      }),
    };
  }

  async updateRule(ctx: TenantContext, kind: AutomationRuleKind, input: RuleInput) {
    if (input.enabled) await this.plans.assertFeature(ctx.tenantId, "walletCampaigns");
    if (kind === "BIRTHDAY" && input.enabled && !input.giftLabel?.trim()) throw badRequest("gift_required", "Indiquez le cadeau d'anniversaire");
    const clean = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() || null);
    const data = {
      enabled: input.enabled,
      title: clean(input.title),
      body: clean(input.body),
      bonus: kind === "DORMANT" ? (input.bonus && input.bonus > 0 ? input.bonus : null) : null,
      giftLabel: kind === "BIRTHDAY" ? clean(input.giftLabel) : null,
      daysBefore: input.daysBefore,
      daysAfter: input.daysAfter,
      dayTitle: kind === "BIRTHDAY" ? clean(input.dayTitle) : null,
      dayBody: kind === "BIRTHDAY" ? clean(input.dayBody) : null,
    };
    await this.prisma.client.automationRule.upsert({ where: { tenantId_kind: { tenantId: ctx.tenantId, kind } }, create: { tenantId: ctx.tenantId, kind, ...data }, update: data });
    await this.audit.forTenant(ctx, "automation.rule_updated", undefined, { kind, enabled: input.enabled });
    return this.rules(ctx.tenantId);
  }

  // --- Tâche planifiée --------------------------------------------------------------------------

  /** Passage de la tâche planifiée : chaque commerce payant à règle active, une fois par jour local. */
  async runDue(now = new Date()): Promise<{ tenants: number; sent: number }> {
    const tenantIds = (await this.prisma.client.automationRule.findMany({ where: { enabled: true }, select: { tenantId: true }, distinct: ["tenantId"] })).map((r) => r.tenantId);
    let tenants = 0;
    let sent = 0;
    for (const tenantId of tenantIds) {
      try {
        const done = await this.runTenant(tenantId, now);
        if (done !== null) {
          tenants += 1;
          sent += done;
        }
      } catch (error) {
        this.logger.error(`Relances non envoyées (${tenantId}) : ${(error as Error).message}`);
      }
    }
    return { tenants, sent };
  }

  /** Un commerce : null si ce n'est pas le moment (heure locale, déjà fait aujourd'hui, offre). */
  async runTenant(tenantId: string, now = new Date()): Promise<number | null> {
    const tenant = await this.tenantInfo(tenantId);
    if (!isLocalHourBetween(now, tenant.timeZone, SEND_FROM_HOUR, SEND_TO_HOUR)) return null;
    if (!(await this.plans.features(tenantId)).walletCampaigns) return null;
    const day = localDateKey(now, tenant.timeZone);
    const runKey = `${tenantId}:${day}`;
    if (await this.prisma.client.auditLog.count({ where: { tenantId, action: "automation.run", metadata: { path: ["key"], equals: runKey } } })) return null;
    await this.audit.log({ tenantId, action: "automation.run", metadata: { key: runKey } });

    const rules = await this.prisma.client.automationRule.findMany({ where: { tenantId, enabled: true } });
    let sent = 0;
    // Anniversaires d'abord : ils passent avant les relances et ne comptent pas dans le plafond.
    const birthdayRule = rules.find((r) => r.kind === "BIRTHDAY" && r.giftLabel);
    const celebrated = new Set<string>();
    if (birthdayRule) {
      for (const candidate of await this.birthdayCandidates(tenant, birthdayRule, now)) {
        celebrated.add(candidate.customerId);
        if (await this.send(tenant, candidate, this.text(tenant.locale, birthdayRule, candidate.scenario), now)) sent += 1;
      }
    }
    const candidates = (await this.relaunchCandidates(tenant, rules, now)).filter((c) => !celebrated.has(c.customerId));
    for (const candidate of candidates.slice(0, MAX_PER_RUN)) {
      const rule = rules.find((r) => r.kind === candidate.scenario)!;
      if (await this.send(tenant, candidate, this.text(tenant.locale, rule, candidate.scenario), now)) sent += 1;
    }
    return sent;
  }

  /** Texte du message : celui du commerçant, sinon le texte par défaut dans la langue du commerce. */
  private text(locale: Locale, rule: AutomationRule, scenario: AutomationScenario): MessageText {
    if (scenario === "BIRTHDAY_DAY") {
      const d = defaultAutomationText(locale, "BIRTHDAY_DAY");
      return { title: rule.dayTitle || d.title, body: rule.dayBody || d.body };
    }
    const d = defaultAutomationText(locale, scenario === "BIRTHDAY_SOON" ? "BIRTHDAY_SOON" : (scenario as Exclude<AutomationRuleKind, "BIRTHDAY">));
    return { title: rule.title || d.title, body: rule.body || d.body };
  }

  // --- Choix des clients ------------------------------------------------------------------------

  /** Clients à relancer, un scénario par client (le plus utile d'abord), hors plafond de 14 jours. */
  async relaunchCandidates(tenant: TenantInfo, rules: AutomationRule[], now: Date): Promise<Candidate[]> {
    const enabled = new Set(rules.map((r) => r.kind));
    if (!RELAUNCH_KINDS.some((k) => enabled.has(k))) return [];
    const db = this.prisma.client;
    const capped = new Set(
      (await db.customerMessage.findMany({
        where: { tenantId: tenant.id, scenario: { in: RELAUNCH_SCENARIOS }, sentAt: { gt: new Date(now.getTime() - RELAUNCH_CAP_DAYS * DAY) } },
        select: { customerId: true },
      })).map((m) => m.customerId),
    );
    const accounts = await db.loyaltyAccount.findMany({
      where: { tenantId: tenant.id, status: "ACTIVE", customer: { anonymizedAt: null } },
      select: {
        id: true,
        balance: true,
        lastActivityAt: true,
        program: { select: { id: true, mode: true, stampsTarget: true, active: true, rewards: { where: { active: true, archivedAt: null }, select: { name: true, cost: true }, orderBy: { cost: "asc" } } } },
        customer: { select: { id: true, firstName: true, email: true, marketingEmailConsent: true, lastVisitAt: true, totalVisits: true, totalSpend: true, createdAt: true } },
      },
      orderBy: { lastActivityAt: "desc" },
    });

    const out: Candidate[] = [];
    const seen = new Set<string>();
    for (const a of accounts) {
      const c = a.customer;
      if (!a.program.active || capped.has(c.id) || seen.has(c.id)) continue;
      const mode = a.program.mode as "STAMPS" | "POINTS";
      const rewards = a.program.rewards;
      const target = mode === "STAMPS" ? a.program.stampsTarget : null;
      const next = mode === "STAMPS" ? (rewards[0] ?? null) : (rewards.find((r) => r.cost > a.balance) ?? null);
      const nextCost = mode === "STAMPS" ? target! : (next?.cost ?? null);
      const affordable = mode === "STAMPS" ? (a.balance >= target! ? rewards[0] ?? null : null) : ([...rewards].reverse().find((r) => r.cost <= a.balance) ?? null);
      const remaining = nextCost !== null ? Math.max(0, nextCost - a.balance) : null;
      const sinceActivity = now.getTime() - a.lastActivityAt.getTime();
      const rewardName = (affordable ?? next)?.name ?? (mode === "STAMPS" ? tenant.name : "");
      const values = {
        prénom: c.firstName,
        commerce: tenant.name,
        solde: formatUnits(tenant.locale, a.balance, mode),
        récompense: rewardName,
        reste: remaining !== null ? formatUnits(tenant.locale, remaining, mode) : "",
      };
      const base = { customerId: c.id, accountId: a.id, firstName: c.firstName, email: c.email, emailConsent: c.marketingEmailConsent, values };
      const segment = computeCustomerSegment({ totalVisits: c.totalVisits, totalSpend: c.totalSpend.toString(), lastVisitAt: c.lastVisitAt, createdAt: c.createdAt, now }).segment;
      const episode = a.lastActivityAt.toISOString();

      let pick: Candidate | null = null;
      if (enabled.has("REWARD_WAITING") && affordable && sinceActivity >= 7 * DAY) {
        pick = { ...base, scenario: "REWARD_WAITING", key: `REWARD_WAITING:${a.id}:${episode}` };
      } else if (enabled.has("NEAR_REWARD") && remaining !== null && remaining > 0 && nextCost && sinceActivity >= 2 * DAY && (mode === "STAMPS" ? remaining === 1 : remaining <= Math.ceil(nextCost * 0.2))) {
        pick = { ...base, scenario: "NEAR_REWARD", key: `NEAR_REWARD:${a.id}:${episode}` };
      } else if (enabled.has("DORMANT") && segment === "DORMANT" && (!c.lastVisitAt || now.getTime() - c.lastVisitAt.getTime() <= DORMANT_MAX_DAYS * DAY)) {
        const rule = rules.find((r) => r.kind === "DORMANT");
        const bonus = rule?.bonus && rule.bonus > 0 ? Math.min(rule.bonus, mode === "STAMPS" ? Math.max(0, target! - a.balance) : rule.bonus) : 0;
        pick = { ...base, scenario: "DORMANT", key: `DORMANT:${c.id}:${c.lastVisitAt?.toISOString() ?? "never"}`, ...(bonus > 0 ? { bonus: { delta: bonus, mode } } : {}) };
      } else if (enabled.has("AT_RISK") && segment === "AT_RISK" && remaining !== null && remaining > 0) {
        pick = { ...base, scenario: "AT_RISK", key: `AT_RISK:${c.id}:${c.lastVisitAt?.toISOString() ?? "never"}` };
      }
      if (pick) {
        out.push(pick);
        seen.add(c.id);
      }
    }
    return out;
  }

  // --- Anniversaire ----------------------------------------------------------------------------

  /**
   * Clients dont l'anniversaire tombe dans la période du cadeau (J-avant à J+après, à l'heure du commerce) :
   * cadeau créé une fois par an, message d'annonce avant le jour J, message du jour J s'il n'est pas utilisé.
   */
  async birthdayCandidates(tenant: TenantInfo, rule: AutomationRule, now: Date): Promise<Candidate[]> {
    const today = zonedParts(now, tenant.timeZone);
    const months = [addLocalDays(today, -rule.daysAfter).month, today.month, addLocalDays(today, rule.daysBefore).month];
    const customers = await this.prisma.client.customer.findMany({
      where: { tenantId: tenant.id, anonymizedAt: null, birthDay: { not: null }, birthMonth: { in: [...new Set(months)] } },
      select: {
        id: true,
        firstName: true,
        email: true,
        marketingEmailConsent: true,
        birthDay: true,
        birthMonth: true,
        accounts: { where: { status: "ACTIVE" }, orderBy: { lastActivityAt: "desc" }, take: 1, select: { id: true } },
      },
    });
    const out: Candidate[] = [];
    for (const c of customers) {
      const offset = birthdayOffset(today, c.birthDay!, c.birthMonth!);
      if (offset < -rule.daysBefore || offset > rule.daysAfter) continue;
      const occurrence = addLocalDays(today, -offset);
      const lastDay = addLocalDays(occurrence, rule.daysAfter);
      const gift = await this.ensureGift(tenant, c.id, occurrence, rule, now);
      if (gift.usedAt) continue;
      const values = {
        prénom: c.firstName,
        commerce: tenant.name,
        cadeau: gift.label,
        date: formatDay(new Date(Date.UTC(lastDay.year, lastDay.month - 1, lastDay.day, 12)), tenant.locale),
      };
      const base = { customerId: c.id, accountId: c.accounts[0]?.id ?? null, firstName: c.firstName, email: c.email, emailConsent: c.marketingEmailConsent, values };
      // Annonce avant le jour J ; le jour J (ou le lendemain si la tâche n'a pas tourné), « Joyeux anniversaire ».
      if (offset < 0) out.push({ ...base, scenario: "BIRTHDAY_SOON", key: `BIRTHDAY_SOON:${c.id}:${occurrence.year}` });
      else if (offset <= 1) out.push({ ...base, scenario: "BIRTHDAY_DAY", key: `BIRTHDAY_DAY:${c.id}:${occurrence.year}` });
    }
    return out;
  }

  /** Cadeau de l'année, créé une seule fois (période fixée à sa création). */
  private async ensureGift(tenant: TenantInfo, customerId: string, occurrence: { year: number; month: number; day: number }, rule: AutomationRule, now: Date) {
    const existing = await this.prisma.client.birthdayGift.findUnique({ where: { customerId_year: { customerId, year: occurrence.year } } });
    if (existing) return existing;
    try {
      return await this.prisma.client.birthdayGift.create({
        data: {
          tenantId: tenant.id,
          customerId,
          year: occurrence.year,
          label: rule.giftLabel!,
          validFrom: localMidnightUtc(addLocalDays(occurrence, -rule.daysBefore), tenant.timeZone),
          validUntil: localMidnightUtc(addLocalDays(occurrence, rule.daysAfter + 1), tenant.timeZone),
          createdAt: now,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) return this.prisma.client.birthdayGift.findUniqueOrThrow({ where: { customerId_year: { customerId, year: occurrence.year } } });
      throw error;
    }
  }

  /** Cadeau d'anniversaire utilisable aujourd'hui pour ce client (affiché au scanner). */
  activeGift(tenantId: string, customerId: string, now = new Date()) {
    return this.prisma.client.birthdayGift.findFirst({
      where: { tenantId, customerId, usedAt: null, validFrom: { lte: now }, validUntil: { gt: now } },
      select: { id: true, label: true, validUntil: true },
    });
  }

  /** Utilisation en caisse : une seule fois, tracée. */
  async useGift(ctx: TenantContext, accountId: string, now = new Date()) {
    const account = await this.prisma.client.loyaltyAccount.findFirst({ where: { id: accountId, tenantId: ctx.tenantId }, select: { customerId: true } });
    if (!account) throw notFound("Carte");
    const gift = await this.activeGift(ctx.tenantId, account.customerId, now);
    if (!gift) throw badRequest("no_birthday_gift", "Aucun cadeau d'anniversaire disponible pour ce client");
    const used = await this.prisma.client.birthdayGift.updateMany({
      where: { id: gift.id, usedAt: null },
      data: { usedAt: now, usedByUserId: ctx.actor.type === "user" ? ctx.actor.userId : null },
    });
    if (used.count !== 1) throw badRequest("no_birthday_gift", "Aucun cadeau d'anniversaire disponible pour ce client");
    await this.audit.forTenant(ctx, "birthday_gift.used", { type: "customer", id: account.customerId }, { label: gift.label });
    return { used: true, label: gift.label };
  }

  // --- Envoi ------------------------------------------------------------------------------------

  /** Envoie un message (carte Wallet, et email avec consentement si aucun iPhone n'est prévenu) ; journal unique par clé. */
  async send(tenant: TenantInfo, c: Candidate, template: MessageText, now = new Date()): Promise<boolean> {
    // Ni carte ni email autorisé : rien à envoyer (le cadeau reste disponible en caisse).
    if (!c.accountId && !(c.emailConsent && c.email)) return false;
    const message = { title: fillTemplate(template.title, c.values).slice(0, 60), body: fillTemplate(template.body, c.values).slice(0, 180) };
    let logId: string;
    try {
      const log = await this.prisma.client.customerMessage.create({
        data: { tenantId: tenant.id, customerId: c.customerId, accountId: c.accountId, scenario: c.scenario, channel: "WALLET", key: c.key, title: message.title, body: message.body, bonus: c.bonus?.delta ?? null, sentAt: now },
      });
      logId = log.id;
    } catch (error) {
      if (isUniqueViolation(error)) return false;
      throw error;
    }
    if (c.bonus && c.accountId) await this.creditBonus(tenant.id, c.accountId, c.bonus.delta, c.key);
    const { apple } = c.accountId ? await this.cards.pushCardMessage(c.accountId, message) : { apple: false };
    let channel: MessageChannel = "WALLET";
    if (!apple && c.emailConsent && c.email) {
      await this.sendEmail(tenant, c, message);
      channel = "EMAIL";
    }
    if (channel !== "WALLET") await this.prisma.client.customerMessage.update({ where: { id: logId }, data: { channel } });
    return true;
  }

  /** Bonus de retour (dormants) : opération tracée, une seule fois par clé de message. */
  private async creditBonus(tenantId: string, accountId: string, delta: number, key: string) {
    const ctx: TenantContext = { tenantId, readOnly: false, actor: { type: "system", label: "scheduler" } };
    await this.prisma.client.$transaction((tx: Prisma.TransactionClient) =>
      this.ledger.post(ctx, { accountId, kind: "ADJUSTMENT", delta, idempotencyKey: `automation:${key}`, source: "DASHBOARD", reason: "Bonus de retour (relance automatique)" }, tx),
    );
  }

  private async sendEmail(tenant: TenantInfo, c: Candidate, message: MessageText) {
    const url = `${loadConfig().APP_URL}/api/public/unsubscribe/${c.customerId}/${unsubscribeSignature(c.customerId)}`;
    const footer = UNSUBSCRIBE[tenant.locale](tenant.name);
    try {
      await this.email.send({
        to: c.email!,
        locale: tenant.locale,
        subject: `${message.title} · ${tenant.name}`,
        text: `${message.body}\n\n${footer}\n${url}`,
        html: emailHtml(tenant.locale, { title: message.title, heading: message.title, paragraphs: [message.body], footer: `${footer} ${url}`, color: tenant.color ?? undefined }),
      });
    } catch (error) {
      this.logger.warn(`Email de relance non envoyé (${c.customerId}) : ${(error as Error).message}`);
    }
  }

  async tenantInfo(tenantId: string): Promise<TenantInfo> {
    const tenant = await this.prisma.client.tenant.findUniqueOrThrow({ where: { id: tenantId }, include: { settings: true } });
    return { id: tenant.id, name: tenant.name, locale: tenantLocale(tenant.settings), timeZone: safeTimeZone(tenant.settings?.timezone), color: tenant.settings?.primaryColor ?? null };
  }
}

const UNSUBSCRIBE: Record<Locale, (tenant: string) => string> = {
  fr: (t) => `Vous recevez cet email car vous avez accepté les offres de ${t}. Pour ne plus en recevoir :`,
  en: (t) => `You are receiving this email because you agreed to receive offers from ${t}. To stop receiving them:`,
  ar: (t) => `تتلقى هذا البريد لأنك وافقت على تلقي عروض ${t}. لإيقاف تلقيها:`,
  es: (t) => `Recibes este correo porque aceptaste las ofertas de ${t}. Para dejar de recibirlas:`,
};
