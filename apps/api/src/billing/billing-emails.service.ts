import { Injectable, Logger } from "@nestjs/common";
import { PAST_DUE_GRACE_DAYS } from "@fove/shared";
import { loadConfig } from "../config";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";
import { EmailService } from "../notifications/email.service";
import { billingMessage } from "../i18n/lifecycle-emails";
import { tenantLocale, type Locale } from "../i18n/locale";
import { formatDay } from "../i18n/format";

const DAY = 86_400_000;

/** Rappels avant la fin d'un abonnement qui ne se renouvelle pas seul (virement, espèces). */
export const RENEWAL_REMINDER_DAYS = [30, 7] as const;
/** Rappel avant la fin d'un accès provisoire (virement attendu). */
export const PROVISIONAL_REMINDER_DAYS = 2;

/**
 * Emails de la vie de l'abonnement envoyés au commerçant (docs/fonctionnalites.md) : activation,
 * changement d'offre, résiliation, paiement refusé, fin d'offre, rappels d'échéance. Chaque envoi
 * planifié est tracé dans le journal d'audit pour n'être envoyé qu'une fois. Un échec d'envoi
 * n'interrompt jamais l'action en cours.
 */
@Injectable()
export class BillingEmailService {
  private readonly logger = new Logger("BillingEmails");

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
  ) {}

  /** Destinataire : email de contact du commerce, sinon le premier propriétaire. */
  async recipient(tenantId: string): Promise<{ to: string | null; locale: Locale }> {
    const tenant = await this.prisma.client.tenant.findUnique({ where: { id: tenantId }, include: { settings: true } });
    let to = tenant?.settings?.contactEmail ?? null;
    if (!to) {
      const owner = await this.prisma.client.tenantMembership.findFirst({
        where: { tenantId, status: "ACTIVE", role: { key: "OWNER" } },
        include: { user: { select: { email: true } } },
        orderBy: { createdAt: "asc" },
      });
      to = owner?.user.email ?? null;
    }
    return { to, locale: tenantLocale(tenant?.settings) };
  }

  private async send<K extends Parameters<typeof billingMessage>[1]>(tenantId: string, key: K, params: (locale: Locale) => Parameters<typeof billingMessage<K>>[2]) {
    try {
      const { to, locale } = await this.recipient(tenantId);
      if (!to) return;
      await this.email.send({ to, ...billingMessage(locale, key, params(locale), `${loadConfig().APP_URL}/app/billing`) });
    } catch (error) {
      this.logger.warn(`Email « ${key} » non envoyé (${tenantId}) : ${(error as Error).message}`);
    }
  }

  /** Vrai si cet email planifié a déjà été envoyé (clé unique dans le journal d'audit). */
  private async alreadySent(tenantId: string, action: string, key: string): Promise<boolean> {
    return (await this.prisma.client.auditLog.count({ where: { tenantId, action, metadata: { path: ["key"], equals: key } } })) > 0;
  }

  private async sendOnce<K extends Parameters<typeof billingMessage>[1]>(tenantId: string, dedupKey: string, key: K, params: (locale: Locale) => Parameters<typeof billingMessage<K>>[2]): Promise<boolean> {
    const action = `billing.email_${key}`;
    if (await this.alreadySent(tenantId, action, dedupKey)) return false;
    await this.audit.log({ tenantId, action, metadata: { key: dedupKey } });
    await this.send(tenantId, key, params);
    return true;
  }

  // --- Événements -----------------------------------------------------------------------------

  activated(tenantId: string, plan: string, until: Date | null) {
    return this.send(tenantId, "activated", (locale) => ({ plan, until: until ? formatDay(until, locale) : "—" }));
  }

  upgraded(tenantId: string, from: string, to: string) {
    return this.send(tenantId, "upgraded", () => ({ from, to }));
  }

  downgradeScheduled(tenantId: string, from: string, to: string, date: Date | null) {
    return this.send(tenantId, "downgradeScheduled", (locale) => ({ from, to, date: date ? formatDay(date, locale) : "—" }));
  }

  cancelRequested(tenantId: string, plan: string, date: Date | null) {
    return this.send(tenantId, "cancelRequested", (locale) => ({ plan, date: date ? formatDay(date, locale) : "—" }));
  }

  /** Carte refusée : l'offre reste active pendant le délai de grâce. */
  paymentFailed(tenantId: string, plan: string, pastDueSince: Date) {
    const graceEnd = new Date(pastDueSince.getTime() + PAST_DUE_GRACE_DAYS * DAY);
    return this.send(tenantId, "paymentFailed", (locale) => ({ plan, date: formatDay(graceEnd, locale) }));
  }

  /** Offre payante terminée, retour au Gratuit ; `key` évite un second email pour la même fin. */
  ended(tenantId: string, plan: string, unpaid: boolean, key: string) {
    return this.sendOnce(tenantId, key, "ended", () => ({ plan, unpaid }));
  }

  // --- Tâches planifiées ----------------------------------------------------------------------

  /**
   * Rappels J-30 et J-7 des abonnements payants qui ne se renouvellent pas seuls (réglés par
   * virement ou espèces). Les contrats sur mesure sont suivis par l'équipe (récapitulatif quotidien).
   */
  async remindRenewals(now = new Date()): Promise<number> {
    const horizon = new Date(now.getTime() + RENEWAL_REMINDER_DAYS[0] * DAY);
    const subs = await this.prisma.client.subscription.findMany({
      where: {
        provider: { in: ["OFFLINE", "MANUAL"] },
        status: "ACTIVE",
        provisionalUntil: null,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: { gt: now, lte: horizon },
        plan: { kind: "PAID" },
      },
      include: { plan: true },
    });
    let sent = 0;
    for (const sub of subs) {
      const end = sub.currentPeriodEnd!;
      const days = Math.ceil((end.getTime() - now.getTime()) / DAY);
      // Le rappel le plus proche atteint : J-7 si on y est, sinon J-30.
      const stage = [...RENEWAL_REMINDER_DAYS].reverse().find((d) => days <= d);
      if (!stage) continue;
      const done = await this.sendOnce(sub.tenantId, `${sub.id}:${end.toISOString()}:${stage}`, "renewal", (locale) => ({ plan: sub.plan.name, date: formatDay(end, locale), days }));
      if (done) sent += 1;
    }
    return sent;
  }

  /** Rappel deux jours avant la fin d'un accès provisoire, avec la référence de paiement. */
  async remindProvisional(now = new Date()): Promise<number> {
    const subs = await this.prisma.client.subscription.findMany({
      where: { provider: "OFFLINE", status: { not: "CANCELED" }, provisionalUntil: { gt: now, lte: new Date(now.getTime() + PROVISIONAL_REMINDER_DAYS * DAY) } },
      include: { plan: true },
    });
    let sent = 0;
    for (const sub of subs) {
      const invoice = await this.prisma.client.invoice.findFirst({
        where: { tenantId: sub.tenantId, status: "OPEN", paymentReference: { not: null } },
        orderBy: { createdAt: "desc" },
      });
      if (!invoice?.paymentReference) continue;
      const until = sub.provisionalUntil!;
      const done = await this.sendOnce(sub.tenantId, `${sub.id}:${until.toISOString()}`, "provisional", (locale) => ({ plan: sub.plan.name, date: formatDay(until, locale), reference: invoice.paymentReference! }));
      if (done) sent += 1;
    }
    return sent;
  }

  /** Fin du délai de grâce d'un impayé par carte : le commerce est passé au Gratuit. */
  async notifyGraceEnded(now = new Date()): Promise<number> {
    const subs = await this.prisma.client.subscription.findMany({
      where: { provider: "STRIPE", status: "PAST_DUE", pastDueSince: { lt: new Date(now.getTime() - PAST_DUE_GRACE_DAYS * DAY) }, plan: { kind: { not: "FREE" } } },
      include: { plan: true },
    });
    let sent = 0;
    for (const sub of subs) {
      if (await this.ended(sub.tenantId, sub.plan.name, true, unpaidKey(sub.id, sub.pastDueSince!))) sent += 1;
    }
    return sent;
  }
}

/** Clé de l'email de fin pour un impayé : la même pour la fin de grâce et la résiliation par Stripe qui suit. */
export const unpaidKey = (subscriptionId: string, pastDueSince: Date) => `${subscriptionId}:unpaid:${pastDueSince.toISOString()}`;
