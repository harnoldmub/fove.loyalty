import { Injectable, Logger } from "@nestjs/common";
import { randomInt } from "node:crypto";
import type { CustomerReferralSettings, Prisma } from "@fove/database";
import { safeTimeZone, zonedParts, localMidnightUtc } from "@fove/shared";
import { loadConfig } from "../config";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";
import { isUniqueViolation, notFound } from "../common/errors";
import type { TenantContext } from "../common/context";
import { PlanService } from "../billing/plan.service";
import { CardsService } from "../cards/cards.service";
import { LedgerService } from "../loyalty/ledger.service";
import { tenantLocale, type Locale } from "../i18n/locale";
import { formatUnits } from "../i18n/automation-texts";

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const systemCtx = (tenantId: string): TenantContext => ({ tenantId, readOnly: false, actor: { type: "system", label: "scheduler" } });

export interface ReferralSettingsInput {
  enabled: boolean;
  referrerStamps: number;
  referrerPoints: number;
  refereeStamps: number;
  refereePoints: number;
  monthlyCap: number;
}

const DEFAULTS: Omit<CustomerReferralSettings, "tenantId" | "updatedAt"> = { enabled: false, referrerStamps: 2, referrerPoints: 50, refereeStamps: 1, refereePoints: 0, monthlyCap: 5 };

const REWARD_TEXT: Record<Locale, (p: { friend: string; gain: string; tenant: string }) => { title: string; body: string }> = {
  fr: (p) => ({ title: `${p.friend} est venu grâce à vous !`, body: `+${p.gain} sur votre carte ${p.tenant}. Merci pour le parrainage !` }),
  en: (p) => ({ title: `${p.friend} came thanks to you!`, body: `+${p.gain} on your ${p.tenant} card. Thanks for the referral!` }),
  ar: (p) => ({ title: `جاء ${p.friend} بفضلك!`, body: `+${p.gain} على بطاقتك لدى ${p.tenant}. شكرًا على الإحالة!` }),
  es: (p) => ({ title: `¡${p.friend} vino gracias a ti!`, body: `+${p.gain} en tu tarjeta de ${p.tenant}. ¡Gracias por recomendarnos!` }),
};

/**
 * Parrainage entre clients d'un commerce (docs/chantier-parrainage-clients.md) : lien par carte, filleul
 * enregistré à l'inscription (nouveau client seulement), bienvenue du filleul, récompense du parrain au
 * premier passage en caisse du filleul, plafond mensuel. Offres payantes, activé par le commerce.
 */
@Injectable()
export class CustomerReferralService {
  private readonly logger = new Logger("CustomerReferral");

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly plans: PlanService,
    private readonly cards: CardsService,
    private readonly ledger: LedgerService,
  ) {}

  // --- Réglages ---------------------------------------------------------------------------------

  async settings(tenantId: string) {
    const [row, features] = await Promise.all([
      this.prisma.client.customerReferralSettings.findUnique({ where: { tenantId } }),
      this.plans.features(tenantId),
    ]);
    return { ...DEFAULTS, ...(row ?? {}), tenantId, available: features.walletCampaigns };
  }

  async updateSettings(ctx: TenantContext, input: ReferralSettingsInput) {
    if (input.enabled) await this.plans.assertFeature(ctx.tenantId, "walletCampaigns");
    await this.prisma.client.customerReferralSettings.upsert({ where: { tenantId: ctx.tenantId }, create: { tenantId: ctx.tenantId, ...input }, update: input });
    await this.audit.forTenant(ctx, "customer_referral.settings_updated", undefined, { ...input });
    return this.settings(ctx.tenantId);
  }

  /** Programme actif pour ce commerce : activé et offre payante. */
  async active(tenantId: string): Promise<CustomerReferralSettings | null> {
    const row = await this.prisma.client.customerReferralSettings.findUnique({ where: { tenantId } });
    if (!row?.enabled) return null;
    return (await this.plans.features(tenantId)).walletCampaigns ? row : null;
  }

  // --- Lien du parrain --------------------------------------------------------------------------

  /** Lien « Parrainer un ami » d'une carte (code créé à la première demande). */
  async shareLink(accountId: string): Promise<{ url: string; code: string } | null> {
    const account = await this.prisma.client.loyaltyAccount.findUnique({ where: { id: accountId }, include: { tenant: { select: { slug: true } } } });
    if (!account || account.status !== "ACTIVE" || !(await this.active(account.tenantId))) return null;
    let code = account.referralCode;
    for (let attempt = 0; !code && attempt < 5; attempt++) {
      const candidate = Array.from({ length: 7 }, () => CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)]).join("");
      try {
        await this.prisma.client.loyaltyAccount.updateMany({ where: { id: account.id, referralCode: null }, data: { referralCode: candidate } });
        code = (await this.prisma.client.loyaltyAccount.findUniqueOrThrow({ where: { id: account.id }, select: { referralCode: true } })).referralCode;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    if (!code) return null;
    // Lien d'inscription du programme de la carte (sinon l'adresse publique du commerce).
    const link = await this.prisma.client.enrollmentLink.findFirst({
      where: { tenantId: account.tenantId, programId: account.programId, active: true },
      orderBy: [{ establishmentId: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
      select: { token: true },
    });
    return { code, url: `${loadConfig().APP_URL}/join/${link?.token ?? account.tenant.slug}?parrain=${code}` };
  }

  // --- Inscription du filleul -------------------------------------------------------------------

  /**
   * Nouveau client inscrit avec un lien de parrainage : parrainage enregistré (une fois par filleul) et
   * bienvenue créditée. Sans effet si le code est inconnu, d'un autre commerce, ou le même compte FOVE.
   */
  async onSignup(
    tx: Prisma.TransactionClient,
    p: { tenantId: string; code: string | undefined; refereeCustomerId: string; refereeAccountId: string; refereeClientAccountId: string | null },
  ) {
    if (!p.code) return;
    const settings = await this.active(p.tenantId);
    if (!settings) return;
    const referrer = await tx.loyaltyAccount.findFirst({
      where: { referralCode: p.code.trim().toUpperCase(), tenantId: p.tenantId, status: "ACTIVE", customer: { anonymizedAt: null } },
      include: { customer: { select: { id: true, clientAccountId: true } } },
    });
    if (!referrer || referrer.customerId === p.refereeCustomerId) return;
    if (p.refereeClientAccountId && referrer.customer.clientAccountId === p.refereeClientAccountId) return;
    const referee = await tx.loyaltyAccount.findUniqueOrThrow({ where: { id: p.refereeAccountId }, include: { program: true } });
    const welcome = referee.program.mode === "STAMPS" ? Math.min(settings.refereeStamps, referee.program.stampsTarget) : settings.refereePoints;
    try {
      await tx.customerReferral.create({
        data: { tenantId: p.tenantId, referrerAccountId: referrer.id, referrerCustomerId: referrer.customerId, refereeCustomerId: p.refereeCustomerId, refereeAccountId: p.refereeAccountId, welcomeDelta: welcome > 0 ? welcome : null },
      });
    } catch (error) {
      if (isUniqueViolation(error)) return;
      throw error;
    }
    if (welcome > 0) {
      await this.ledger.post(systemCtx(p.tenantId), { accountId: p.refereeAccountId, kind: "ADJUSTMENT", delta: welcome, idempotencyKey: `referral-welcome:${p.refereeCustomerId}`, source: "DASHBOARD", reason: "Parrainage : bienvenue" }, tx);
    }
  }

  // --- Premier passage du filleul ---------------------------------------------------------------

  /** Après un passage en caisse : si c'est le premier d'un filleul, le parrain est récompensé (plafond mensuel). */
  async onVisit(tenantId: string, customerId: string, now = new Date()) {
    const referral = await this.prisma.client.customerReferral.findFirst({ where: { tenantId, refereeCustomerId: customerId, status: "SIGNED_UP" } });
    if (!referral) return;
    const settings = await this.active(tenantId);
    if (!settings) return;
    const tenant = await this.prisma.client.tenant.findUniqueOrThrow({ where: { id: tenantId }, include: { settings: true } });
    const tz = safeTimeZone(tenant.settings?.timezone);
    const today = zonedParts(now, tz);
    const monthStart = localMidnightUtc({ year: today.year, month: today.month, day: 1 }, tz);
    const rewardedThisMonth = await this.prisma.client.customerReferral.count({ where: { tenantId, referrerCustomerId: referral.referrerCustomerId, status: "REWARDED", rewardedAt: { gte: monthStart } } });
    if (rewardedThisMonth >= settings.monthlyCap) {
      await this.prisma.client.customerReferral.updateMany({ where: { id: referral.id, status: "SIGNED_UP" }, data: { status: "CAPPED", rewardedAt: now } });
      return;
    }
    const account = await this.prisma.client.loyaltyAccount.findUnique({ where: { id: referral.referrerAccountId }, include: { program: true } });
    if (!account || account.status !== "ACTIVE") return;
    const mode = account.program.mode as "STAMPS" | "POINTS";
    const delta = mode === "STAMPS" ? Math.max(0, Math.min(settings.referrerStamps, account.program.stampsTarget - account.balance)) : settings.referrerPoints;
    // Une seule récompense par filleul, même si deux passages arrivent en même temps.
    const claimed = await this.prisma.client.customerReferral.updateMany({ where: { id: referral.id, status: "SIGNED_UP" }, data: { status: "REWARDED", rewardedAt: now, rewardDelta: delta } });
    if (claimed.count !== 1) return;
    const friend = await this.prisma.client.customer.findUnique({ where: { id: customerId }, select: { firstName: true } });
    if (delta > 0) {
      await this.prisma.client.$transaction((tx) =>
        this.ledger.post(systemCtx(tenantId), { accountId: account.id, kind: "ADJUSTMENT", delta, idempotencyKey: `referral-reward:${referral.id}`, source: "DASHBOARD", reason: `Parrainage : ${friend?.firstName ?? ""}`.trim() }, tx),
      );
      const locale = tenantLocale(tenant.settings);
      await this.cards.pushCardMessage(account.id, REWARD_TEXT[locale]({ friend: friend?.firstName ?? "", gain: formatUnits(locale, delta, mode), tenant: tenant.name })).catch((error) => {
        this.logger.warn(`Notification de parrainage non envoyée (${account.id}) : ${(error as Error).message}`);
      });
    }
    await this.audit.log({ tenantId, action: "customer_referral.rewarded", targetType: "customer", targetId: referral.referrerCustomerId, metadata: { referee: customerId, delta } });
  }

  // --- Suivi ------------------------------------------------------------------------------------

  async stats(tenantId: string) {
    const db = this.prisma.client;
    const [byStatus, top] = await Promise.all([
      db.customerReferral.groupBy({ by: ["status"], where: { tenantId }, _count: { _all: true } }),
      db.customerReferral.groupBy({ by: ["referrerCustomerId"], where: { tenantId, status: "REWARDED" }, _count: { _all: true }, orderBy: { _count: { referrerCustomerId: "desc" } }, take: 5 }),
    ]);
    const names = await db.customer.findMany({ where: { id: { in: top.map((t) => t.referrerCustomerId) } }, select: { id: true, firstName: true, lastName: true } });
    const count = (s: string) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
    return {
      signedUp: count("SIGNED_UP") + count("REWARDED") + count("CAPPED"),
      came: count("REWARDED") + count("CAPPED"),
      rewarded: count("REWARDED"),
      top: top.map((t) => {
        const c = names.find((n) => n.id === t.referrerCustomerId);
        return { customerId: t.referrerCustomerId, name: c ? `${c.firstName} ${c.lastName}`.trim() : "—", rewarded: t._count._all };
      }),
    };
  }

  /** Lien de la carte d'un client (fiche client, pour le donner en caisse). */
  async linkForAccount(ctx: TenantContext, accountId: string) {
    const account = await this.prisma.client.loyaltyAccount.findFirst({ where: { id: accountId, tenantId: ctx.tenantId } });
    if (!account) throw notFound("Carte");
    return this.shareLink(account.id);
  }
}
