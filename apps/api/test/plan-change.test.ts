import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import Stripe from "stripe";
import { agent, db, ownerWithTenant, resetDatabase, startApp } from "./helpers";
import { hashPassword } from "../src/common/crypto";
import { BillingService } from "../src/billing/billing.service";

const subOf = (tenantId: string) => db.subscription.findUniqueOrThrow({ where: { tenantId } });
const planId = async (code: string) => (await db.subscriptionPlan.findUniqueOrThrow({ where: { code } })).id;

describe("changement d'offre en mode simulé", () => {
  let app: NestExpressApplication;
  const runJobs = () => request(app.getHttpServer()).post("/api/jobs/run").set("x-cron-secret", process.env.CRON_SECRET!);
  beforeAll(async () => {
    await resetDatabase();
    app = await startApp();
  });
  afterAll(() => app.close());

  async function subscribed(code: string) {
    const o = await ownerWithTenant(app, { plan: "free" });
    expect((await o.client.post("/api/app/billing/checkout", { planCode: code, interval: "YEAR" })).status).toBe(201);
    return o;
  }

  it("une offre supérieure s'applique tout de suite, sans nouvelle période", async () => {
    const o = await subscribed("starter");
    const before = (await subOf(o.tenantId)).currentPeriodEnd;
    const res = await o.client.post("/api/app/billing/checkout", { planCode: "business", interval: "YEAR" });
    expect(res.status).toBe(201);
    expect(res.body.effective).toBe("now");
    const sub = await subOf(o.tenantId);
    expect(sub.planId).toBe(await planId("business"));
    expect(sub.currentPeriodEnd).toEqual(before);
    expect((await o.client.get("/api/app/tenant")).body.features.api).toBe(true);
  });

  it("une offre inférieure est programmée au renouvellement, l'offre payée reste jusque-là", async () => {
    const o = await subscribed("business");
    const res = await o.client.post("/api/app/billing/checkout", { planCode: "starter", interval: "YEAR" });
    expect(res.status).toBe(201);
    expect(res.body.effective).toBe("renewal");
    const billing = (await o.client.get("/api/app/billing")).body;
    expect(billing.currentPlan.code).toBe("business");
    expect(billing.subscription.scheduledPlan.code).toBe("starter");
    expect((await o.client.get("/api/app/tenant")).body.features.api).toBe(true);

    // Renouvellement : la nouvelle période démarre sur l'offre programmée.
    await db.subscription.update({ where: { tenantId: o.tenantId }, data: { currentPeriodEnd: new Date(Date.now() - 1000) } });
    await runJobs();
    const sub = await subOf(o.tenantId);
    expect(sub.planId).toBe(await planId("starter"));
    expect(sub.scheduledPlanId).toBeNull();
    expect(sub.status).toBe("ACTIVE");
    expect((await o.client.get("/api/app/tenant")).body.features.api).toBe(false);
  });

  it("le changement programmé s'annule, et la résiliation le remplace", async () => {
    const o = await subscribed("business");
    await o.client.post("/api/app/billing/checkout", { planCode: "starter", interval: "YEAR" });
    expect((await o.client.post("/api/app/billing/scheduled-change/cancel")).status).toBe(204);
    expect((await subOf(o.tenantId)).scheduledPlanId).toBeNull();
    const again = await o.client.post("/api/app/billing/scheduled-change/cancel");
    expect(again.body.error.code).toBe("nothing_scheduled");

    // Reprendre son offre actuelle annule aussi le changement ; sans changement programmé, c'est refusé.
    await o.client.post("/api/app/billing/checkout", { planCode: "starter", interval: "YEAR" });
    expect((await o.client.post("/api/app/billing/checkout", { planCode: "business", interval: "YEAR" })).status).toBe(201);
    expect((await subOf(o.tenantId)).scheduledPlanId).toBeNull();
    expect((await o.client.post("/api/app/billing/checkout", { planCode: "business", interval: "YEAR" })).body.error.code).toBe("same_plan");

    await o.client.post("/api/app/billing/checkout", { planCode: "starter", interval: "YEAR" });
    expect((await o.client.post("/api/app/billing/cancel")).status).toBe(204);
    const sub = await subOf(o.tenantId);
    expect(sub.cancelAtPeriodEnd).toBe(true);
    expect(sub.scheduledPlanId).toBeNull();
  });
});

describe("changement d'offre avec Stripe", () => {
  let app: NestExpressApplication;
  let stripe: Stripe;
  const whsec = "whsec_test_fove";
  beforeAll(async () => {
    await resetDatabase();
    app = await startApp({ STRIPE_SECRET_KEY: "sk_test_fove_fake", STRIPE_WEBHOOK_SECRET: whsec });
    stripe = (app.get(BillingService) as unknown as { stripe: Stripe }).stripe;
    await db.subscriptionPlan.update({ where: { code: "starter" }, data: { stripePriceYearlyId: "price_starter_y" } });
    await db.subscriptionPlan.update({ where: { code: "business" }, data: { stripePriceYearlyId: "price_business_y" } });
    await db.subscriptionPlan.update({ where: { code: "premium" }, data: { stripePriceYearlyId: "price_premium_y" } });
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await app.close();
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  /** Abonné Stripe à Business ; les appels à Stripe sont simulés. */
  async function stripeSubscriber(ref: string, schedule: string | null = null) {
    const o = await ownerWithTenant(app);
    await db.subscription.update({
      where: { tenantId: o.tenantId },
      data: { provider: "STRIPE", status: "ACTIVE", stripeCustomerId: `cus_${ref}`, stripeSubscriptionId: `sub_${ref}`, currentPeriodEnd: new Date(Date.now() + 200 * 86_400_000) },
    });
    vi.restoreAllMocks();
    const calls = {
      retrieve: vi.spyOn(stripe.subscriptions, "retrieve").mockResolvedValue({ id: `sub_${ref}`, schedule, cancel_at_period_end: false, items: { data: [{ id: `si_${ref}` }] } } as never),
      update: vi.spyOn(stripe.subscriptions, "update").mockResolvedValue({} as never),
      cancel: vi.spyOn(stripe.subscriptions, "cancel").mockResolvedValue({} as never),
      createSchedule: vi.spyOn(stripe.subscriptionSchedules, "create").mockResolvedValue({
        id: `sub_sched_${ref}`,
        phases: [{ start_date: 1_000, end_date: 2_000, trial_end: null, discounts: [], items: [{ price: "price_business_y", quantity: 1 }] }],
      } as never),
      updateSchedule: vi.spyOn(stripe.subscriptionSchedules, "update").mockResolvedValue({} as never),
      release: vi.spyOn(stripe.subscriptionSchedules, "release").mockResolvedValue({} as never),
    };
    return { ...o, calls };
  }

  async function send(id: string, type: string, object: object) {
    const payload = JSON.stringify({ id, object: "event", type, data: { object } });
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: whsec });
    const res = await request(app.getHttpServer()).post("/api/billing/stripe/webhook").set("Content-Type", "application/json").set("stripe-signature", header).send(payload);
    expect(res.status).toBe(200);
  }
  const remoteSub = (ref: string, tenantId: string, price: string, extra: object = {}) => ({
    id: `sub_${ref}`,
    object: "subscription",
    status: "active",
    customer: `cus_${ref}`,
    cancel_at_period_end: false,
    trial_end: null,
    metadata: { tenantId },
    items: { data: [{ id: `si_${ref}`, current_period_end: Math.floor(Date.now() / 1000) + 200 * 86400, price: { id: price, recurring: { interval: "year" } } }] },
    ...extra,
  });

  it("programme une offre inférieure au renouvellement, sans prorata", async () => {
    const o = await stripeSubscriber("down");
    const res = await o.client.post("/api/app/billing/checkout", { planCode: "starter", interval: "YEAR" });
    expect(res.status).toBe(201);
    expect(res.body.effective).toBe("renewal");
    expect(o.calls.update).not.toHaveBeenCalled();
    expect(o.calls.createSchedule).toHaveBeenCalledWith({ from_subscription: "sub_down" });
    const params = o.calls.updateSchedule.mock.calls[0]![1]!;
    expect(params.end_behavior).toBe("release");
    expect(params.phases![0]).toMatchObject({ start_date: 1_000, end_date: 2_000, items: [{ price: "price_business_y", quantity: 1 }] });
    expect(params.phases![1]).toMatchObject({ items: [{ price: "price_starter_y", quantity: 1 }], proration_behavior: "none" });
    expect((await subOf(o.tenantId)).scheduledPlanId).toBe(await planId("starter"));
    expect((await o.client.get("/api/app/tenant")).body.features.api).toBe(true);

    // Stripe passe à la phase suivante au renouvellement : l'offre change, le changement programmé disparaît.
    await send("evt_down_1", "customer.subscription.updated", remoteSub("down", o.tenantId, "price_business_y", { schedule: "sub_sched_down" }));
    expect((await subOf(o.tenantId)).scheduledPlanId).toBe(await planId("starter"));
    await send("evt_down_2", "customer.subscription.updated", remoteSub("down", o.tenantId, "price_starter_y", { schedule: "sub_sched_down" }));
    const sub = await subOf(o.tenantId);
    expect(sub.planId).toBe(await planId("starter"));
    expect(sub.scheduledPlanId).toBeNull();
  });

  it("une offre supérieure abandonne le changement programmé et facture le prorata tout de suite", async () => {
    const o = await stripeSubscriber("up", "sub_sched_up");
    await db.subscription.update({ where: { tenantId: o.tenantId }, data: { scheduledPlanId: await planId("starter") } });
    const res = await o.client.post("/api/app/billing/checkout", { planCode: "premium", interval: "YEAR" });
    expect(res.status).toBe(201);
    expect(res.body.effective).toBe("now");
    expect(o.calls.release).toHaveBeenCalledWith("sub_sched_up");
    expect(o.calls.update).toHaveBeenCalledWith("sub_up", {
      items: [{ id: "si_up", price: "price_premium_y" }],
      proration_behavior: "always_invoice",
      payment_behavior: "pending_if_incomplete",
      cancel_at_period_end: false,
    });
    expect((await subOf(o.tenantId)).scheduledPlanId).toBeNull();
  });

  it("annuler le changement programmé ou résilier libère le calendrier Stripe", async () => {
    const o = await stripeSubscriber("undo", "sub_sched_undo");
    await db.subscription.update({ where: { tenantId: o.tenantId }, data: { scheduledPlanId: await planId("starter") } });
    expect((await o.client.post("/api/app/billing/scheduled-change/cancel")).status).toBe(204);
    expect(o.calls.release).toHaveBeenCalledWith("sub_sched_undo");
    expect((await subOf(o.tenantId)).scheduledPlanId).toBeNull();

    o.calls.release.mockClear();
    expect((await o.client.post("/api/app/billing/cancel")).status).toBe(204);
    expect(o.calls.release).toHaveBeenCalledWith("sub_sched_undo");
    expect(o.calls.update).toHaveBeenCalledWith("sub_undo", { cancel_at_period_end: true });
  });

  it("un contrat attribué par l'admin arrête l'abonnement Stripe, que Stripe ne peut plus écraser", async () => {
    const o = await stripeSubscriber("contract");
    const email = `admin${Date.now()}@fove.test`;
    await db.user.create({ data: { email, name: "Admin", passwordHash: await hashPassword("motdepasse123"), isSuperAdmin: true, emailVerifiedAt: new Date() } });
    const admin = agent(app);
    await admin.post("/api/auth/login", { email, password: "motdepasse123" });

    const res = await admin.post(`/api/admin/tenants/${o.tenantId}/subscription`, { planCode: "custom", status: "ACTIVE", limitsOverride: { customers: 50 } });
    expect(res.status).toBe(204);
    expect(o.calls.cancel).toHaveBeenCalledWith("sub_contract");
    let sub = await subOf(o.tenantId);
    expect(sub.provider).toBe("MANUAL");
    expect(sub.stripeSubscriptionId).toBeNull();

    // Les événements qui suivent l'arrêt de l'abonnement Stripe ne touchent pas au contrat.
    await send("evt_contract_1", "customer.subscription.deleted", remoteSub("contract", o.tenantId, "price_business_y", { status: "canceled" }));
    await send("evt_contract_2", "invoice.payment_failed", { id: "in_contract", object: "invoice", customer: "cus_contract" });
    sub = await subOf(o.tenantId);
    expect(sub.planId).toBe(await planId("custom"));
    expect(sub.status).toBe("ACTIVE");
    expect((await o.client.get("/api/app/tenant")).body.limits.customers).toBe(50);
  });
});
