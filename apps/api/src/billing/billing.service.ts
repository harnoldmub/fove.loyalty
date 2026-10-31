import { Injectable, Logger } from "@nestjs/common";
import Stripe from "stripe";
import type { BillingInterval, SubscriptionStatus } from "@fove/database";
import { loadConfig } from "../config";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";
import { badRequest, notFound } from "../common/errors";
import type { TenantContext } from "../common/context";
import { PlanService } from "./plan.service";

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
    const [subscription, plans, usage, limits] = await Promise.all([
      this.prisma.client.subscription.findUnique({ where: { tenantId: ctx.tenantId }, include: { plan: true } }),
      this.listPlans(),
      this.plans.usage(ctx.tenantId),
      this.plans.limits(ctx.tenantId),
    ]);
    return { mode: this.mode, subscription, plans, usage, limits };
  }

  private async plan(code: string) {
    const plan = await this.prisma.client.subscriptionPlan.findFirst({ where: { code, active: true } });
    if (!plan) throw notFound("Offre");
    return plan;
  }

  async checkout(ctx: TenantContext, planCode: string, interval: BillingInterval) {
    if (interval !== "YEAR") throw badRequest("annual_only", "Les nouvelles souscriptions sont annuelles.");
    const plan = await this.plan(planCode);
    const appUrl = loadConfig().APP_URL;
    const current = await this.prisma.client.subscription.findUnique({ where: { tenantId: ctx.tenantId } });

    if (!this.stripe) {
      if (loadConfig().isProd) throw badRequest("stripe_disabled", "Le paiement n’est pas encore disponible. Contactez FOVE.");
      await this.prisma.client.subscription.upsert({
        where: { tenantId: ctx.tenantId },
        update: { planId: plan.id, status: "ACTIVE", interval, provider: "MOCK", cancelAtPeriodEnd: false, currentPeriodEnd: periodEnd(interval) },
        create: { tenantId: ctx.tenantId, planId: plan.id, status: "ACTIVE", interval, provider: "MOCK", currentPeriodEnd: periodEnd(interval) },
      });
      await this.audit.forTenant(ctx, "billing.mock_checkout", undefined, { plan: plan.code, interval });
      return { url: `${appUrl}/app/billing?checkout=mock`, mode: "mock" as const };
    }

    // Abonnement Stripe déjà actif : changement d'offre direct (avec prorata).
    if (current?.stripeSubscriptionId && current.status !== "CANCELED") {
      return this.changePlan(ctx, planCode, interval);
    }

    const price = interval === "YEAR" ? plan.stripePriceYearlyId : plan.stripePriceMonthlyId;
    if (!price) throw badRequest("price_missing", "Tarif Stripe non configuré pour cette offre");
    const tenant = await this.prisma.client.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId }, include: { settings: true } });
    const buyer = ctx.actor.type === "user" ? await this.prisma.client.user.findUnique({ where: { id: ctx.actor.userId }, select: { email: true } }) : null;
    const customerId = current?.stripeCustomerId ?? (await this.stripe.customers.create({
      name: tenant.name,
      email: tenant.settings?.contactEmail ?? buyer?.email,
      metadata: { tenantId: tenant.id },
    })).id;

    // Les jours d'essai restants sont conservés : le premier prélèvement a lieu
    // à la fin de l'essai (Stripe exige une échéance à plus de 48 h).
    const trialEnd =
      current?.status === "TRIALING" && current.trialEndsAt && current.trialEndsAt.getTime() > Date.now() + 48 * 3600 * 1000
        ? Math.floor(current.trialEndsAt.getTime() / 1000)
        : undefined;

    const session = await this.stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
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
    await this.prisma.client.subscription.upsert({
      where: { tenantId: tenant.id },
      update: { stripeCustomerId: customerId },
      create: { tenantId: tenant.id, planId: plan.id, status: "INCOMPLETE", interval, provider: "STRIPE", stripeCustomerId: customerId },
    });
    return { url: session.url!, mode: "stripe" as const };
  }

  async changePlan(ctx: TenantContext, planCode: string, interval: BillingInterval) {
    if (interval !== "YEAR") throw badRequest("annual_only", "Les nouvelles souscriptions sont annuelles.");
    const plan = await this.plan(planCode);
    const sub = await this.prisma.client.subscription.findUnique({ where: { tenantId: ctx.tenantId } });
    if (!sub) throw notFound("Abonnement");
    if (this.stripe && sub.stripeSubscriptionId) {
      const price = interval === "YEAR" ? plan.stripePriceYearlyId : plan.stripePriceMonthlyId;
      if (!price) throw badRequest("price_missing", "Tarif Stripe non configuré pour cette offre");
      const remote = await this.stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
      await this.stripe.subscriptions.update(sub.stripeSubscriptionId, {
        items: [{ id: remote.items.data[0]!.id, price }],
        proration_behavior: "create_prorations",
        cancel_at_period_end: false,
      });
      // L'état local est mis à jour par le webhook customer.subscription.updated.
    } else {
      await this.prisma.client.subscription.update({ where: { id: sub.id }, data: { planId: plan.id, interval, cancelAtPeriodEnd: false } });
    }
    await this.audit.forTenant(ctx, "billing.plan_changed", undefined, { plan: plan.code, interval });
    return { url: `${loadConfig().APP_URL}/app/billing?checkout=updated`, mode: this.mode };
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

  async cancel(ctx: TenantContext) {
    const sub = await this.prisma.client.subscription.findUnique({ where: { tenantId: ctx.tenantId } });
    if (!sub) throw notFound("Abonnement");
    if (this.stripe && sub.stripeSubscriptionId) {
      await this.stripe.subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: true });
    }
    await this.prisma.client.subscription.update({ where: { id: sub.id }, data: { cancelAtPeriodEnd: true } });
    await this.audit.forTenant(ctx, "billing.cancel_requested");
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
          await this.prisma.client.subscription.updateMany({ where: { stripeCustomerId: invoice.customer }, data: { status: "PAST_DUE" } });
          this.logger.warn(`Paiement échoué pour ${invoice.customer}`);
        }
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice & { customer: string | null };
        if (typeof invoice.customer === "string") {
          await this.prisma.client.subscription.updateMany({
            where: { stripeCustomerId: invoice.customer, status: "PAST_DUE" },
            data: { status: "ACTIVE" },
          });
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
    if (local?.stripeSubscriptionId && local.stripeSubscriptionId !== remote.id && local.status !== "CANCELED") {
      // Événement d'un ancien abonnement : il ne doit pas écraser l'abonnement en cours.
      this.logger.warn(`Abonnement ${remote.id} ignoré : ${tenantId} est lié à ${local.stripeSubscriptionId}`);
      return;
    }
    const status = mapStatus(remote.status);
    const periodEndUnix = (item as unknown as { current_period_end?: number })?.current_period_end;
    const data = {
      planId: plan.id,
      status,
      provider: "STRIPE" as const,
      interval: item?.price.recurring?.interval === "year" ? ("YEAR" as const) : ("MONTH" as const),
      stripeSubscriptionId: remote.id,
      stripeCustomerId: customerId,
      cancelAtPeriodEnd: remote.cancel_at_period_end,
      trialEndsAt: remote.trial_end ? new Date(remote.trial_end * 1000) : null,
      currentPeriodEnd: periodEndUnix ? new Date(periodEndUnix * 1000) : null,
    };
    await this.prisma.client.subscription.upsert({ where: { tenantId }, update: data, create: { tenantId, ...data } });
    await this.audit.log({ tenantId, action: "billing.subscription_synced", metadata: { status, plan: plan.code } });
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

function periodEnd(interval: BillingInterval): Date {
  const d = new Date();
  if (interval === "YEAR") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

export { mapStatus };
