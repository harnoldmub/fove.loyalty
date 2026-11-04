import { Injectable, Logger } from "@nestjs/common";
import Stripe from "stripe";
import { Prisma, type BillingInterval, type Subscription, type SubscriptionPlan, type SubscriptionStatus } from "@fove/database";
import { loadConfig } from "../config";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";
import { badRequest, notFound } from "../common/errors";
import type { TenantContext } from "../common/context";
import { PlanService } from "./plan.service";

/** Un abonnement payé remplace un éventuel contrat sur-mesure et ses dérogations. */
const NO_CONTRACT = { limitsOverride: Prisma.DbNull, featuresOverride: Prisma.DbNull, contractPriceYearlyCents: null };

type SubscriptionWithPlan = Subscription & { plan: SubscriptionPlan };

/**
 * Facturation. Sans STRIPE_SECRET_KEY, le fournisseur simulé (MOCK) applique
 * les changements immédiatement, sans aucun paiement : utile en développement
 * et en staging. Les clés `sk_live` sont refusées sans STRIPE_ALLOW_LIVE=true.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger("Billing");
  private readonly stripe: Stripe | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlanService,
    private readonly audit: AuditService,
  ) {
    const key = loadConfig().STRIPE_SECRET_KEY;
    this.stripe = key ? new Stripe(key) : null;
  }

  get mode(): "stripe" | "mock" | "unavailable" {
    return this.stripe ? "stripe" : loadConfig().isProd ? "unavailable" : "mock";
  }

  listPlans() {
    return this.prisma.client.subscriptionPlan.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  }

  async overview(ctx: TenantContext) {
    const [subscription, plans, usage, limits, current] = await Promise.all([
      this.prisma.client.subscription.findUnique({ where: { tenantId: ctx.tenantId }, include: { plan: true, scheduledPlan: { select: { code: true, name: true } } } }),
      this.listPlans(),
      this.plans.usage(ctx.tenantId),
      this.plans.limits(ctx.tenantId),
      this.plans.currentPlan(ctx.tenantId),
    ]);
    const currentPlan = { code: current.code, name: current.name, kind: current.kind };
    return { mode: this.mode, subscription, currentPlan, plans, usage, limits };
  }

  /** Offre achetable en ligne : le Gratuit s'obtient en résiliant, le Sur-mesure sur devis. */
  private async plan(code: string) {
    const plan = await this.prisma.client.subscriptionPlan.findFirst({ where: { code, active: true } });
    if (!plan) throw notFound("Offre");
    if (plan.kind !== "PAID") throw badRequest("plan_not_purchasable", "Cette offre ne s'achète pas en ligne");
    return plan;
  }

  async checkout(ctx: TenantContext, planCode: string, interval: BillingInterval) {
    if (interval !== "YEAR") throw badRequest("annual_only", "Les nouvelles souscriptions sont annuelles.");
    const plan = await this.plan(planCode);
    const appUrl = loadConfig().APP_URL;
    const current = await this.prisma.client.subscription.findUnique({ where: { tenantId: ctx.tenantId }, include: { plan: true } });

    // Abonnement payant en cours : changement d'offre, sans nouvelle période.
    if (current && this.isRunningPaid(current)) return this.changePlan(ctx, current, plan);

    if (!this.stripe) {
      if (loadConfig().isProd) throw badRequest("stripe_disabled", "Le paiement n’est pas encore disponible. Contactez FOVE.");
      const data = { planId: plan.id, status: "ACTIVE" as const, interval, provider: "MOCK" as const, cancelAtPeriodEnd: false, scheduledPlanId: null, currentPeriodEnd: periodEnd(interval) };
      await this.prisma.client.subscription.upsert({
        where: { tenantId: ctx.tenantId },
        update: { ...data, ...NO_CONTRACT },
        create: { tenantId: ctx.tenantId, ...data },
      });
      await this.audit.forTenant(ctx, "billing.mock_checkout", undefined, { plan: plan.code, interval });
      return { url: `${appUrl}/app/billing?checkout=mock`, mode: "mock" as const };
    }

    const price = interval === "YEAR" ? plan.stripePriceYearlyId : plan.stripePriceMonthlyId;
    if (!price) throw badRequest("price_missing", "Tarif Stripe non configuré pour cette offre");
    const tenant = await this.prisma.client.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } });
    const buyer = ctx.actor.type === "user"
      ? await this.prisma.client.user.findUnique({ where: { id: ctx.actor.userId }, select: { email: true, emailVerifiedAt: true } })
      : null;
    // Le paiement est ouvert avant la confirmation de l'email (pour ne pas perdre la vente) :
    // sans adresse confirmée, c'est Stripe qui la demande, pour que factures et reçus
    // arrivent à une adresse saisie au moment de payer. Le client Stripe est créé par
    // Checkout et rattaché à l'entreprise par le webhook (metadata.tenantId).
    const customerId = current?.stripeCustomerId ?? null;
    const customerEmail = !customerId && buyer?.emailVerifiedAt ? buyer.email : undefined;

    // Les jours d'essai restants sont conservés : le premier prélèvement a lieu
    // à la fin de l'essai (Stripe exige une échéance à plus de 48 h).
    const trialEnd =
      current?.status === "TRIALING" && current.trialEndsAt && current.trialEndsAt.getTime() > Date.now() + 48 * 3600 * 1000
        ? Math.floor(current.trialEndsAt.getTime() / 1000)
        : undefined;

    const session = await this.stripe.checkout.sessions.create({
      mode: "subscription",
      ...(customerId ? { customer: customerId } : customerEmail ? { customer_email: customerEmail } : {}),
      client_reference_id: tenant.id,
      line_items: [{ price, quantity: 1 }],
      subscription_data: {
        billing_mode: { type: "flexible" },
        metadata: { tenantId: tenant.id },
        ...(trialEnd ? { trial_end: trialEnd } : {}),
      },
      success_url: `${appUrl}/app/billing?checkout=success`,
      cancel_url: `${appUrl}/app/billing?checkout=cancelled`,
      allow_promotion_codes: true,
    });
    // L'offre en cours (le Gratuit en général) reste active jusqu'au webhook de Stripe.
    await this.prisma.client.subscription.upsert({
      where: { tenantId: tenant.id },
      update: {},
      create: { tenantId: tenant.id, planId: plan.id, status: "INCOMPLETE", interval, provider: "STRIPE", stripeCustomerId: customerId },
    });
    return { url: session.url!, mode: "stripe" as const };
  }

  /** Abonnement payé en cours : un nouveau choix d'offre le modifie au lieu d'ouvrir une nouvelle période. */
  private isRunningPaid(sub: SubscriptionWithPlan) {
    if (sub.plan.kind !== "PAID" || sub.status === "CANCELED" || sub.status === "INCOMPLETE") return false;
    if (sub.provider === "STRIPE") return Boolean(this.stripe && sub.stripeSubscriptionId);
    return sub.provider === "MOCK" && !this.stripe && (!sub.currentPeriodEnd || sub.currentPeriodEnd > new Date());
  }

  /**
   * Offre supérieure : immédiate, la différence au prorata est facturée tout de suite
   * (si ce paiement échoue, l'offre ne change pas). Offre inférieure : programmée au
   * renouvellement, sans avoir ; l'offre payée reste jusqu'à la fin de la période.
   * Un nouveau choix remplace un changement déjà programmé ; reprendre l'offre
   * actuelle l'annule.
   */
  private async changePlan(ctx: TenantContext, sub: SubscriptionWithPlan, plan: SubscriptionPlan) {
    const appUrl = loadConfig().APP_URL;
    if (plan.id === sub.plan.id) {
      if (!sub.scheduledPlanId) throw badRequest("same_plan", "Vous êtes déjà sur cette offre");
      await this.cancelScheduledChange(ctx);
      return { url: `${appUrl}/app/billing?checkout=updated`, mode: this.mode, effective: "now" as const };
    }
    const upgrade = plan.priceYearlyCents > sub.plan.priceYearlyCents;
    if (this.stripe && sub.stripeSubscriptionId) {
      const price = plan.stripePriceYearlyId;
      if (!price) throw badRequest("price_missing", "Tarif Stripe non configuré pour cette offre");
      const remote = await this.releaseSchedule(sub.stripeSubscriptionId);
      if (upgrade) {
        await this.stripe.subscriptions.update(sub.stripeSubscriptionId, {
          items: [{ id: remote.items.data[0]!.id, price }],
          proration_behavior: "always_invoice",
          payment_behavior: "pending_if_incomplete",
          cancel_at_period_end: false,
        });
        // L'offre locale change à réception du webhook customer.subscription.updated.
      } else {
        // Stripe refuse de programmer un changement sur un abonnement en cours de résiliation.
        if (remote.cancel_at_period_end) await this.stripe.subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: false });
        const schedule = await this.stripe.subscriptionSchedules.create({ from_subscription: sub.stripeSubscriptionId });
        const phase = schedule.phases[0]!;
        await this.stripe.subscriptionSchedules.update(schedule.id, {
          end_behavior: "release",
          proration_behavior: "none",
          phases: [
            {
              start_date: phase.start_date,
              end_date: phase.end_date,
              items: phase.items.map((i) => ({ price: idOf(i.price), quantity: i.quantity ?? 1 })),
              ...(phase.trial_end ? { trial_end: phase.trial_end } : {}),
              ...(phase.discounts?.length ? { discounts: phase.discounts.map((d) => (d.discount ? { discount: idOf(d.discount) } : { coupon: d.coupon ? idOf(d.coupon) : undefined })) } : {}),
            },
            { items: [{ price, quantity: 1 }], duration: { interval: "year", interval_count: 1 }, proration_behavior: "none" },
          ],
        });
      }
    }
    const data = upgrade
      ? { scheduledPlanId: null, cancelAtPeriodEnd: false, ...(sub.provider === "MOCK" ? { planId: plan.id } : {}) }
      : { scheduledPlanId: plan.id, cancelAtPeriodEnd: false };
    await this.prisma.client.subscription.update({ where: { id: sub.id }, data });
    const effective = upgrade ? ("now" as const) : ("renewal" as const);
    await this.audit.forTenant(ctx, "billing.plan_changed", undefined, { plan: plan.code, from: sub.plan.code, effective });
    return { url: `${appUrl}/app/billing?checkout=${upgrade ? "updated" : "scheduled"}`, mode: this.mode, effective };
  }

  /** Annule le passage à une offre inférieure programmé au renouvellement. */
  async cancelScheduledChange(ctx: TenantContext) {
    const sub = await this.prisma.client.subscription.findUnique({ where: { tenantId: ctx.tenantId } });
    if (!sub?.scheduledPlanId) throw badRequest("nothing_scheduled", "Aucun changement d’offre programmé");
    if (this.stripe && sub.stripeSubscriptionId) await this.releaseSchedule(sub.stripeSubscriptionId);
    await this.prisma.client.subscription.update({ where: { id: sub.id }, data: { scheduledPlanId: null } });
    await this.audit.forTenant(ctx, "billing.plan_change_cancelled");
  }

  /** Détache l'abonnement de son calendrier Stripe : le changement programmé est abandonné, l'offre actuelle continue. */
  private async releaseSchedule(stripeSubscriptionId: string) {
    const remote = await this.stripe!.subscriptions.retrieve(stripeSubscriptionId);
    if (remote.schedule) await this.stripe!.subscriptionSchedules.release(idOf(remote.schedule));
    return remote;
  }

  /**
   * Passage à un contrat attribué par l'admin : l'abonnement Stripe est arrêté tout de
   * suite, sinon Stripe continuerait de prélever et son prochain événement remplacerait
   * le contrat. Aucun remboursement automatique (à faire depuis Stripe si besoin).
   */
  async endStripeSubscription(sub: Subscription) {
    if (sub.provider !== "STRIPE" || !sub.stripeSubscriptionId || sub.status === "CANCELED") return false;
    if (this.stripe) {
      await this.releaseSchedule(sub.stripeSubscriptionId);
      await this.stripe.subscriptions.cancel(sub.stripeSubscriptionId);
    }
    return true;
  }

  async portal(ctx: TenantContext) {
    const sub = await this.prisma.client.subscription.findUnique({ where: { tenantId: ctx.tenantId } });
    if (!this.stripe || !sub?.stripeCustomerId) throw badRequest("portal_unavailable", "Portail de facturation indisponible en mode simulé");
    const session = await this.stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${loadConfig().APP_URL}/app/billing`,
    });
    return { url: session.url };
  }

  /** Résiliation en fin de période payée : les droits restent jusque-là, puis l'offre Gratuite s'applique. */
  async cancel(ctx: TenantContext) {
    const sub = await this.prisma.client.subscription.findUnique({ where: { tenantId: ctx.tenantId }, include: { plan: true } });
    if (!sub) throw notFound("Abonnement");
    assertCancellable(sub);
    if (sub.cancelAtPeriodEnd) return;
    if (this.stripe && sub.stripeSubscriptionId) {
      // La résiliation l'emporte sur un changement d'offre programmé.
      await this.releaseSchedule(sub.stripeSubscriptionId);
      await this.stripe.subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: true });
    }
    await this.prisma.client.subscription.update({ where: { id: sub.id }, data: { cancelAtPeriodEnd: true, scheduledPlanId: null } });
    await this.audit.forTenant(ctx, "billing.cancel_requested");
  }

  /** Annule une résiliation demandée, tant que la période payée n'est pas terminée. */
  async resume(ctx: TenantContext) {
    const sub = await this.prisma.client.subscription.findUnique({ where: { tenantId: ctx.tenantId } });
    const ended = sub?.currentPeriodEnd ? sub.currentPeriodEnd < new Date() : false;
    if (!sub || !sub.cancelAtPeriodEnd || sub.status === "CANCELED" || ended) {
      throw badRequest("nothing_to_resume", "Aucune résiliation en cours à annuler");
    }
    if (this.stripe && sub.stripeSubscriptionId) {
      await this.stripe.subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: false });
    }
    await this.prisma.client.subscription.update({ where: { id: sub.id }, data: { cancelAtPeriodEnd: false } });
    await this.audit.forTenant(ctx, "billing.cancel_reverted");
  }

  /**
   * Tâche planifiée : fin de période des abonnements gérés par FOVE (Stripe
   * prévient lui-même par webhook). Un contrat attribué par l'admin ou une
   * résiliation arrivés à échéance passent à « résilié » (droits du Gratuit) ;
   * un abonnement simulé non résilié est renouvelé, comme le ferait Stripe, sur
   * l'offre programmée s'il y en a une.
   */
  async closeExpired(now = new Date()) {
    const db = this.prisma.client;
    const due = await db.subscription.findMany({
      where: { provider: { in: ["MANUAL", "MOCK"] }, status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] }, currentPeriodEnd: { lt: now } },
    });
    let ended = 0;
    let renewed = 0;
    for (const sub of due) {
      if (sub.provider === "MOCK" && !sub.cancelAtPeriodEnd) {
        const next = sub.scheduledPlanId ? { planId: sub.scheduledPlanId, scheduledPlanId: null } : {};
        await db.subscription.update({ where: { id: sub.id }, data: { currentPeriodEnd: periodEnd(sub.interval), ...next } });
        renewed += 1;
        continue;
      }
      await db.subscription.update({ where: { id: sub.id }, data: { status: "CANCELED", cancelAtPeriodEnd: false, scheduledPlanId: null } });
      await this.audit.log({ tenantId: sub.tenantId, action: "billing.subscription_ended", metadata: { provider: sub.provider } });
      ended += 1;
    }
    return { ended, renewed };
  }

  // --- Webhooks Stripe -------------------------------------------------------

  async handleWebhook(rawBody: Buffer | undefined, signature: string | undefined) {
    const secret = loadConfig().STRIPE_WEBHOOK_SECRET;
    if (!this.stripe || !secret) throw badRequest("stripe_disabled", "Stripe non configuré");
    if (!rawBody || !signature) throw badRequest("invalid_signature", "Signature manquante");
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch {
      throw badRequest("invalid_signature", "Signature invalide");
    }
    const already = await this.prisma.client.billingEvent.findUnique({ where: { id: event.id } });
    if (already) return { received: true, duplicate: true };

    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await this.syncSubscription(event.data.object);
        break;
      case "checkout.session.completed": {
        const session = event.data.object;
        if (typeof session.subscription === "string") {
          await this.syncSubscription(await this.stripe.subscriptions.retrieve(session.subscription));
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice & { customer: string | null };
        if (typeof invoice.customer === "string") {
          // provider STRIPE : une facture d'un ancien abonnement ne touche pas un contrat attribué par l'admin.
          await this.prisma.client.subscription.updateMany({
            where: { stripeCustomerId: invoice.customer, provider: "STRIPE", status: { in: ["ACTIVE", "TRIALING"] } },
            data: { status: "PAST_DUE", pastDueSince: new Date() },
          });
          this.logger.warn(`Paiement échoué pour ${invoice.customer}`);
          try {
            await this.recordStripeInvoice(invoice, false);
          } catch (e) {
            this.logger.error("Erreur enregistrement facture échouée", e);
          }
        }
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice & { customer: string | null };
        if (typeof invoice.customer === "string") {
          await this.prisma.client.subscription.updateMany({
            where: { stripeCustomerId: invoice.customer, provider: "STRIPE", status: "PAST_DUE" },
            data: { status: "ACTIVE", pastDueSince: null },
          });
          try {
            await this.recordStripeInvoice(invoice, true);
          } catch (e) {
            this.logger.error("Erreur enregistrement facture payée", e);
          }
        }
        break;
      }
      default:
        break;
    }
    await this.prisma.client.billingEvent.create({ data: { id: event.id, type: event.type } });
    return { received: true };
  }

  private async syncSubscription(remote: Stripe.Subscription) {
    const customerId = typeof remote.customer === "string" ? remote.customer : remote.customer.id;
    const item = remote.items.data[0];
    const priceId = item?.price.id;
    const plan = priceId
      ? await this.prisma.client.subscriptionPlan.findFirst({ where: { OR: [{ stripePriceMonthlyId: priceId }, { stripePriceYearlyId: priceId }] } })
      : null;
    // Abonnement créé depuis le tableau de bord Stripe : pas de métadonnée,
    // on retrouve l'entreprise par son client Stripe.
    const tenantId =
      remote.metadata?.tenantId ??
      (await this.prisma.client.subscription.findFirst({ where: { stripeCustomerId: customerId }, select: { tenantId: true } }))?.tenantId;
    if (!tenantId || !plan) {
      this.logger.error(`Abonnement ${remote.id} : tenant ou offre introuvable (price ${priceId})`);
      return;
    }
    const local = await this.prisma.client.subscription.findUnique({ where: { tenantId } });
    const status = mapStatus(remote.status);
    // Événement d'un autre abonnement que celui en cours (ancien abonnement, ou abonnement
    // arrêté lors du passage à un contrat) : il ne doit pas écraser l'abonnement en cours.
    if (local && local.stripeSubscriptionId !== remote.id && (status === "CANCELED" || (local.stripeSubscriptionId && local.status !== "CANCELED"))) {
      this.logger.warn(`Abonnement ${remote.id} ignoré : ${tenantId} est lié à ${local.stripeSubscriptionId ?? "un contrat FOVE"}`);
      return;
    }
    // Le délai de grâce court depuis le premier impayé, pas depuis le dernier événement reçu.
    const pastDueSince = status === "PAST_DUE" ? (local?.status === "PAST_DUE" && local.pastDueSince ? local.pastDueSince : new Date()) : null;
    const periodEndUnix = (item as unknown as { current_period_end?: number })?.current_period_end;
    const data = {
      planId: plan.id,
      status,
      provider: "STRIPE" as const,
      interval: item?.price.recurring?.interval === "year" ? ("YEAR" as const) : ("MONTH" as const),
      stripeSubscriptionId: remote.id,
      stripeCustomerId: customerId,
      cancelAtPeriodEnd: remote.cancel_at_period_end,
      // Le changement programmé disparaît une fois appliqué ou si le calendrier Stripe est abandonné.
      scheduledPlanId: remote.schedule && local?.scheduledPlanId !== plan.id ? (local?.scheduledPlanId ?? null) : null,
      pastDueSince,
      trialEndsAt: remote.trial_end ? new Date(remote.trial_end * 1000) : null,
      currentPeriodEnd: periodEndUnix ? new Date(periodEndUnix * 1000) : null,
      ...NO_CONTRACT,
    };
    await this.prisma.client.subscription.upsert({ where: { tenantId }, update: data, create: { tenantId, ...data } });
    await this.audit.log({ tenantId, action: "billing.subscription_synced", metadata: { status, plan: plan.code } });
  }

  private async recordStripeInvoice(invoice: Stripe.Invoice, isPaid: boolean) {
    if (!invoice.customer || typeof invoice.customer !== "string") return;
    const sub = await this.prisma.client.subscription.findFirst({
      where: { stripeCustomerId: invoice.customer },
      select: { id: true, tenantId: true },
    });
    if (!sub) return;

    const currency = (invoice.currency || "USD").toUpperCase();
    const amountTotal = invoice.total ?? 0;
    const amountSubtotal = invoice.subtotal ?? amountTotal;
    const amountTax = (invoice as any).tax ?? 0;
    const amountPaid = isPaid ? (invoice.amount_paid ?? amountTotal) : 0;
    const amountDue = isPaid ? 0 : (invoice.amount_due ?? amountTotal);

    const invNumber = invoice.number || `INV-STRIPE-${invoice.id.slice(-8)}`;

    const inv = await this.prisma.client.invoice.upsert({
      where: { stripeInvoiceId: invoice.id },
      create: {
        number: invNumber,
        tenantId: sub.tenantId,
        subscriptionId: sub.id,
        status: isPaid ? "PAID" : "OPEN",
        currency,
        amountSubtotalCents: amountSubtotal,
        amountTaxCents: amountTax,
        amountDiscountCents: 0,
        amountTotalCents: amountTotal,
        amountPaidCents: amountPaid,
        amountDueCents: amountDue,
        paidAt: isPaid ? new Date() : null,
        dueDate: invoice.due_date ? new Date(invoice.due_date * 1000) : null,
        periodStart: invoice.period_start ? new Date(invoice.period_start * 1000) : null,
        periodEnd: invoice.period_end ? new Date(invoice.period_end * 1000) : null,
        stripeInvoiceId: invoice.id,
        pdfUrl: invoice.invoice_pdf || null,
        hostedInvoiceUrl: invoice.hosted_invoice_url || null,
      },
      update: {
        status: isPaid ? "PAID" : "OPEN",
        amountPaidCents: amountPaid,
        amountDueCents: amountDue,
        paidAt: isPaid ? new Date() : null,
        pdfUrl: invoice.invoice_pdf || null,
        hostedInvoiceUrl: invoice.hosted_invoice_url || null,
      },
    });

    if (isPaid && amountPaid > 0) {
      const pi = (invoice as any).payment_intent;
      const paymentIntentId =
        typeof pi === "string" ? pi : pi?.id;
      const ref = paymentIntentId ? `PAY-${paymentIntentId.slice(-10)}` : `PAY-${invoice.id.slice(-10)}`;
      const feeCents = Math.round(amountPaid * 0.029 + 30);
      const netCents = Math.max(0, amountPaid - feeCents);

      const existingPayment = paymentIntentId
        ? await this.prisma.client.payment.findFirst({ where: { providerPaymentId: paymentIntentId } })
        : null;

      if (!existingPayment) {
        await this.prisma.client.payment.create({
          data: {
            reference: ref,
            tenantId: sub.tenantId,
            invoiceId: inv.id,
            provider: "STRIPE",
            providerPaymentId: paymentIntentId ?? invoice.id,
            amountCents: amountPaid,
            feeCents,
            netCents,
            currency,
            status: "SUCCEEDED",
            method: "card",
            confirmedAt: new Date(),
          },
        });
      }
    }
  }
}

function mapStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case "trialing":
      return "TRIALING";
    case "active":
      return "ACTIVE";
    case "past_due":
    case "unpaid":
      return "PAST_DUE";
    case "canceled":
    case "incomplete_expired":
      return "CANCELED";
    default:
      return "INCOMPLETE";
  }
}

function assertCancellable(sub: Subscription & { plan: SubscriptionPlan }) {
  if (sub.plan.kind === "FREE" || sub.status === "CANCELED" || sub.status === "TRIALING") {
    throw badRequest("nothing_to_cancel", "Aucun abonnement payant à résilier");
  }
  if (sub.plan.kind === "CUSTOM" || sub.provider === "MANUAL") {
    throw badRequest("contract_managed", "Votre abonnement est géré par l’équipe FOVE : contactez-nous pour le modifier.");
  }
}

function idOf(ref: string | { id: string }): string {
  return typeof ref === "string" ? ref : ref.id;
}

function periodEnd(interval: BillingInterval): Date {

  const d = new Date();
  if (interval === "YEAR") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

export { mapStatus };
