import { Injectable, Logger } from "@nestjs/common";
import { loadConfig } from "../config";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";
import { forbidden, isUniqueViolation, notFound } from "../common/errors";
import type { TenantContext } from "../common/context";
import { EmailService } from "../notifications/email.service";
import { emailHtml } from "../i18n/email-layout";
import { tenantLocale, type Locale } from "../i18n/locale";

const DAY = 86_400_000;
/** Annulations d'une récompense par le même caissier pour le même client, sur cette durée, qui font une anomalie. */
const REPEAT_WINDOW_DAYS = 30;
const REPEAT_THRESHOLD = 2;

const TEXT: Record<Locale, { subject: string; body: (p: { cashier: string; customer: string; count: number }) => string; button: string; footer: string }> = {
  fr: {
    subject: "Point à vérifier : annulations répétées d'une récompense",
    body: (p) => `${p.cashier} a annulé ${p.count} fois en 30 jours l'utilisation d'une récompense pour le même client (${p.customer}). Si ce n'est pas une erreur de caisse, la récompense a pu être donnée sans que la carte soit débitée.`,
    button: "Voir les annulations",
    footer: "Vous recevez cet email en tant que propriétaire du commerce sur FOVE.",
  },
  en: {
    subject: "To check: repeated reward cancellations",
    body: (p) => `${p.cashier} cancelled a reward use ${p.count} times in 30 days for the same customer (${p.customer}). If it isn't a till mistake, the reward may have been given without the card being charged.`,
    button: "See cancellations",
    footer: "You are receiving this email as the owner of the business on FOVE.",
  },
  ar: {
    subject: "نقطة للتحقق: إلغاءات متكررة لمكافأة",
    body: (p) => `ألغى ${p.cashier} استخدام مكافأة ${p.count} مرات خلال 30 يومًا للعميل نفسه (${p.customer}). إن لم يكن ذلك خطأ صندوق، فقد تكون المكافأة قُدّمت دون خصمها من البطاقة.`,
    button: "عرض الإلغاءات",
    footer: "تتلقى هذا البريد بصفتك مالك النشاط على FOVE.",
  },
  es: {
    subject: "Punto a revisar: cancelaciones repetidas de una recompensa",
    body: (p) => `${p.cashier} anuló ${p.count} veces en 30 días el uso de una recompensa para el mismo cliente (${p.customer}). Si no es un error de caja, la recompensa pudo darse sin descontarse de la tarjeta.`,
    button: "Ver las cancelaciones",
    footer: "Recibes este correo como propietario del negocio en FOVE.",
  },
};

/**
 * Points à vérifier signalés au commerçant (docs/chantier-code-caisse.md) : annulations répétées d'une
 * récompense par le même caissier pour le même client, et nombre d'annulations de la semaine.
 */
@Injectable()
export class AlertsService {
  private readonly logger = new Logger("Alerts");

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
  ) {}

  /** Après l'annulation d'une utilisation de récompense : anomalie si c'est la deuxième en 30 jours. */
  async afterRewardCancel(ctx: TenantContext, customerId: string, now = new Date()) {
    if (ctx.actor.type !== "user") return;
    const actorId = ctx.actor.userId;
    const since = new Date(now.getTime() - REPEAT_WINDOW_DAYS * DAY);
    const count = await this.prisma.client.rewardRedemption.count({
      where: { tenantId: ctx.tenantId, status: "CANCELLED", cancelledById: actorId, cancelledAt: { gte: since }, account: { customerId } },
    });
    if (count < REPEAT_THRESHOLD) return;
    // Une seule alerte par couple caissier-client sur 30 jours.
    const recent = await this.prisma.client.tenantAlert.count({
      where: { tenantId: ctx.tenantId, kind: "REPEATED_REWARD_CANCEL", createdAt: { gte: since }, key: { startsWith: `REPEATED_REWARD_CANCEL:${actorId}:${customerId}:` } },
    });
    if (recent > 0) return;
    const [cashier, customer, tenant] = await Promise.all([
      this.prisma.client.user.findUnique({ where: { id: actorId }, select: { name: true } }),
      this.prisma.client.customer.findUnique({ where: { id: customerId }, select: { firstName: true, lastName: true } }),
      this.prisma.client.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId }, include: { settings: true } }),
    ]);
    const details = { cashierId: actorId, cashier: cashier?.name ?? "—", customerId, customer: `${customer?.firstName ?? ""} ${customer?.lastName ?? ""}`.trim(), count };
    try {
      await this.prisma.client.tenantAlert.create({ data: { tenantId: ctx.tenantId, kind: "REPEATED_REWARD_CANCEL", key: `REPEATED_REWARD_CANCEL:${actorId}:${customerId}:${now.toISOString()}`, details, createdAt: now } });
    } catch (error) {
      if (isUniqueViolation(error)) return;
      throw error;
    }
    await this.audit.log({ tenantId: ctx.tenantId, action: "alert.repeated_reward_cancel", metadata: details });
    await this.notifyOwners(ctx.tenantId, tenantLocale(tenant.settings), details);
  }

  private async notifyOwners(tenantId: string, locale: Locale, d: { cashier: string; customer: string; count: number }) {
    const owners = await this.prisma.client.tenantMembership.findMany({ where: { tenantId, status: "ACTIVE", role: { key: "OWNER" } }, include: { user: { select: { email: true } } } });
    const t = TEXT[locale];
    const url = `${loadConfig().APP_URL}/app/transactions?kind=CANCELLATIONS`;
    for (const owner of owners) {
      try {
        await this.email.send({
          to: owner.user.email,
          locale,
          subject: t.subject,
          text: `${t.body(d)}\n\n${t.button} : ${url}`,
          html: emailHtml(locale, { title: t.subject, heading: t.subject, paragraphs: [t.body(d)], button: { label: t.button, url }, footer: t.footer }),
        });
      } catch (error) {
        this.logger.warn(`Alerte non envoyée (${tenantId}) : ${(error as Error).message}`);
      }
    }
  }

  /** Tableau de bord : points à vérifier non traités et annulations des 7 derniers jours. */
  async summary(ctx: TenantContext, now = new Date()) {
    this.assertManager(ctx);
    const [alerts, cancellations] = await Promise.all([
      this.prisma.client.tenantAlert.findMany({ where: { tenantId: ctx.tenantId, resolvedAt: null }, orderBy: { createdAt: "desc" }, take: 20 }),
      this.prisma.client.loyaltyTransaction.count({ where: { tenantId: ctx.tenantId, kind: { in: ["REVERSAL", "REDEMPTION_REVERSAL"] }, createdAt: { gte: new Date(now.getTime() - 7 * DAY) } } }),
    ]);
    return { alerts: alerts.map((a) => ({ id: a.id, kind: a.kind, details: a.details, createdAt: a.createdAt })), cancellationsThisWeek: cancellations };
  }

  async resolve(ctx: TenantContext, id: string) {
    this.assertManager(ctx);
    const { count } = await this.prisma.client.tenantAlert.updateMany({
      where: { id, tenantId: ctx.tenantId, resolvedAt: null },
      data: { resolvedAt: new Date(), resolvedByUserId: ctx.actor.type === "user" ? ctx.actor.userId : null },
    });
    if (count === 0) throw notFound("Point à vérifier");
    await this.audit.forTenant(ctx, "alert.resolved", { type: "alert", id });
  }

  private assertManager(ctx: TenantContext) {
    if (ctx.actor.type !== "user" || (ctx.actor.role !== "OWNER" && ctx.actor.role !== "MANAGER")) throw forbidden();
  }
}
