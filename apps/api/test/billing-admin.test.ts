import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import Stripe from "stripe";
import { agent, createPointsProgram, db, ownerWithTenant, randomPhone, resetDatabase, startApp } from "./helpers";
import { hashPassword } from "../src/common/crypto";

describe("facturation en mode simulé et quotas", () => {
  let app: NestExpressApplication;
  beforeAll(async () => {
    await resetDatabase();
    app = await startApp();
  });
  afterAll(() => app.close());

  it("démarre l'essai gratuit à la création de l'entreprise", async () => {
    const { client } = await ownerWithTenant(app);
    const billing = await client.get("/api/app/billing");
    expect(billing.body.mode).toBe("mock");
    expect(billing.body.subscription.status).toBe("TRIALING");
    expect(billing.body.subscription.plan.code).toBe("business");
  });

  it("le paiement exige un email vérifié, puis change l'offre sans paiement réel", async () => {
    const o = await ownerWithTenant(app);
    expect((await o.client.post("/api/app/billing/checkout", { planCode: "premium", interval: "YEAR" })).status).toBe(403);
    await db.user.update({ where: { email: o.email }, data: { emailVerifiedAt: new Date() } });
    const res = await o.client.post("/api/app/billing/checkout", { planCode: "premium", interval: "YEAR" });
    expect(res.body.mode).toBe("mock");
    const sub = await db.subscription.findUniqueOrThrow({ where: { tenantId: o.tenantId }, include: { plan: true } });
    expect(sub.plan.code).toBe("premium");
    expect(sub.provider).toBe("MOCK");
    expect(sub.interval).toBe("YEAR");
  });

  it("refuse une souscription mensuelle sans modifier l’abonnement", async () => {
    const o = await ownerWithTenant(app);
    await db.user.update({ where: { email: o.email }, data: { emailVerifiedAt: new Date() } });
    const before = await db.subscription.findUniqueOrThrow({ where: { tenantId: o.tenantId } });
    const res = await o.client.post("/api/app/billing/checkout", { planCode: "premium", interval: "MONTH" });
    expect(res.status).toBe(400);
    const after = await db.subscription.findUniqueOrThrow({ where: { tenantId: o.tenantId } });
    expect(after.planId).toBe(before.planId);
    expect(after.status).toBe("TRIALING");
  });

  it("un passage à une offre inférieure bloque les créations, jamais les cartes existantes", async () => {
    const o = await ownerWithTenant(app);
    const program = await createPointsProgram(o.client);
    const created: string[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await o.client.post("/api/app/customers", { firstName: `C${i}`, phone: randomPhone(), programId: program.id });
      created.push(r.body.customer.id);
    }
    const starter = await db.subscriptionPlan.findUniqueOrThrow({ where: { code: "starter" } });
    await db.subscription.update({ where: { tenantId: o.tenantId }, data: { planId: starter.id, status: "ACTIVE" } });
    const blocked = await o.client.post("/api/app/customers", { firstName: "Trop", phone: randomPhone() });
    expect(blocked.status).toBe(402);
    expect(blocked.body.error.code).toBe("quota_exceeded");
    const account = (await o.client.get(`/api/app/customers/${created[0]}`)).body.accounts[0];
    const earn = await o.client.post("/api/app/transactions/earn", { accountId: account.id, amount: "3000", idempotencyKey: "quota-earn-1" });
    expect(earn.status).toBe(201);
  });

  it("un essai expiré retombe sur les droits Starter", async () => {
    const o = await ownerWithTenant(app);
    await db.subscription.update({ where: { tenantId: o.tenantId }, data: { trialEndsAt: new Date(Date.now() - 1000) } });
    const tenant = await o.client.get("/api/app/tenant");
    expect(tenant.body.features.api).toBe(false);
    expect(tenant.body.limits.customers).toBe(500);
  });
});

describe("webhooks Stripe signés", () => {
  let app: NestExpressApplication;
  const whsec = "whsec_test_fove";
  beforeAll(async () => {
    await resetDatabase();
    app = await startApp({ STRIPE_SECRET_KEY: "sk_test_fove_fake", STRIPE_WEBHOOK_SECRET: whsec });
  });
  afterAll(async () => {
    await app.close();
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  it("rejette une signature invalide et applique un événement signé une seule fois", async () => {
    const o = await ownerWithTenant(app);
    const event = {
      id: "evt_test_1",
      object: "event",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_123",
          object: "subscription",
          status: "past_due",
          customer: "cus_123",
          cancel_at_period_end: false,
          trial_end: null,
          metadata: { tenantId: o.tenantId },
          items: { data: [{ id: "si_1", current_period_end: Math.floor(Date.now() / 1000) + 86400, price: { id: "price_business_m", recurring: { interval: "month" } } }] },
        },
      },
    };
    const payload = JSON.stringify(event);
    const http = () => request(app.getHttpServer()).post("/api/billing/stripe/webhook").set("Content-Type", "application/json");
    expect((await http().set("stripe-signature", "t=1,v1=faux").send(payload)).status).toBe(400);
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: whsec });
    expect((await http().set("stripe-signature", header).send(payload)).status).toBe(200);
    const sub = await db.subscription.findUniqueOrThrow({ where: { tenantId: o.tenantId } });
    expect(sub.status).toBe("PAST_DUE");
    expect(sub.stripeSubscriptionId).toBe("sub_123");
    const replay = await http().set("stripe-signature", header).send(payload);
    expect(replay.body.duplicate).toBe(true);
  });
});

describe("Super Admin FOVE", () => {
  let app: NestExpressApplication;
  beforeAll(async () => {
    await resetDatabase();
    app = await startApp();
  });
  afterAll(() => app.close());

  async function superAdmin() {
    const email = `admin${Date.now()}@fove.test`;
    await db.user.create({ data: { email, name: "Admin", passwordHash: await hashPassword("motdepasse123"), isSuperAdmin: true, emailVerifiedAt: new Date() } });
    const c = agent(app);
    await c.post("/api/auth/login", { email, password: "motdepasse123" });
    return c;
  }

  it("suspend une entreprise : ses équipes perdent l'accès, ses données restent", async () => {
    const admin = await superAdmin();
    const o = await ownerWithTenant(app);
    const list = await admin.get("/api/admin/tenants");
    expect(list.body.some((t: { id: string }) => t.id === o.tenantId)).toBe(true);
    expect((await admin.post(`/api/admin/tenants/${o.tenantId}/status`, { status: "SUSPENDED", reason: "Impayé" })).status).toBe(204);
    expect((await o.client.get("/api/app/customers")).status).toBe(403);
    await admin.post(`/api/admin/tenants/${o.tenantId}/status`, { status: "ACTIVE", reason: "Régularisé" });
    expect((await o.client.get("/api/app/customers")).status).toBe(200);
    const audit = await db.auditLog.findMany({ where: { tenantId: o.tenantId, action: { startsWith: "admin." } } });
    expect(audit).toHaveLength(2);
  });

  it("l'accès support est en lecture seule, motivé et audité", async () => {
    const admin = await superAdmin();
    const o = await ownerWithTenant(app);
    expect((await admin.post(`/api/admin/tenants/${o.tenantId}/support`, { reason: "court" })).status).toBe(400);
    expect((await admin.post(`/api/admin/tenants/${o.tenantId}/support`, { reason: "Ticket #42 : solde incohérent", minutes: 15 })).status).toBe(201);
    expect((await admin.get("/api/app/customers")).status).toBe(200);
    expect((await admin.post("/api/app/customers", { firstName: "X", phone: randomPhone() })).status).toBe(403);
    expect((await admin.get("/api/app/team")).status).toBe(403);
    expect((await admin.post("/api/admin/support/end")).status).toBe(204);
    expect((await admin.get("/api/app/customers")).status).toBe(403);
  });

  it("les statistiques SaaS ne comptent pas l'essai simulé comme du revenu", async () => {
    const admin = await superAdmin();
    const stats = await admin.get("/api/admin/stats");
    expect(stats.status).toBe(200);
    expect(stats.body.mrrCents).toBe(0);
    expect(stats.body.tenants).toBeGreaterThan(0);
  });

  it("modifie le prix d'une offre sans toucher au code", async () => {
    const admin = await superAdmin();
    const plan = await db.subscriptionPlan.findUniqueOrThrow({ where: { code: "starter" } });
    expect((await admin.patch(`/api/admin/plans/${plan.id}`, { priceMonthlyCents: 1490 })).status).toBe(200);
    expect((await request(app.getHttpServer()).get("/api/plans")).body.find((p: { code: string }) => p.code === "starter").priceMonthlyCents).toBe(1490);
  });
});
