import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { agent, db, ownerWithTenant, resetDatabase, startApp } from "./helpers";
import { hashPassword } from "../src/common/crypto";
import { BillingService } from "../src/billing/billing.service";
import { ReferralService } from "../src/referrals/referral.service";

/** Prix dans plusieurs monnaies (docs/chantier-multi-devises.md), en mode simulé. */
let app: NestExpressApplication;

beforeAll(async () => {
  await resetDatabase();
  app = await startApp({ STRIPE_SECRET_KEY: undefined });
});
afterAll(async () => {
  await app.close();
});

async function merchant(country: string) {
  const o = await ownerWithTenant(app, { plan: "free" });
  await db.tenantSettings.update({ where: { tenantId: o.tenantId }, data: { country } });
  return o;
}

async function superAdmin() {
  const email = `admin${Date.now()}${Math.random().toString(36).slice(2, 6)}@fove.test`;
  await db.user.create({ data: { email, name: "Admin", passwordHash: await hashPassword("motdepasse123"), isSuperAdmin: true, emailVerifiedAt: new Date() } });
  const c = agent(app);
  await c.post("/api/auth/login", { email, password: "motdepasse123" });
  return c;
}

const price = async (code: string, currency: string) => (await db.planPrice.findFirstOrThrow({ where: { plan: { code }, currency } })).yearlyCents;

describe("prix par monnaie", () => {
  it("publie le prix de chaque offre dans chaque monnaie", async () => {
    const res = await request(app.getHttpServer()).get("/api/plans");
    expect(res.status).toBe(200);
    const starter = res.body.find((p: { code: string }) => p.code === "starter");
    expect(starter.prices).toEqual({ USD: 12900, EUR: 11900, MAD: 129000 });
  });

  it("facture un commerce français en euros", async () => {
    const o = await merchant("FR");
    const overview = (await o.client.get("/api/app/billing")).body;
    expect(overview.currency).toEqual({ billing: "EUR", online: "EUR", subscription: null });

    expect((await o.client.post("/api/app/billing/checkout", { planCode: "starter", interval: "YEAR" })).status).toBe(201);
    const sub = await db.subscription.findUniqueOrThrow({ where: { tenantId: o.tenantId } });
    expect(sub.currency).toBe("EUR");
    const payment = await db.payment.findFirstOrThrow({ where: { tenantId: o.tenantId } });
    expect(payment).toMatchObject({ currency: "EUR", amountCents: await price("starter", "EUR") });
  });

  it("affiche les prix en dirhams mais encaisse en euros en ligne", async () => {
    const o = await merchant("MA");
    expect((await o.client.get("/api/app/billing")).body.currency).toMatchObject({ billing: "MAD", online: "EUR" });
    await o.client.post("/api/app/billing/checkout", { planCode: "starter", interval: "YEAR" });
    const payment = await db.payment.findFirstOrThrow({ where: { tenantId: o.tenantId } });
    expect(payment).toMatchObject({ currency: "EUR", amountCents: await price("starter", "EUR") });
  });

  it("facture la RDC en dollars", async () => {
    const o = await merchant("CD");
    expect((await o.client.get("/api/app/billing")).body.currency).toMatchObject({ billing: "USD", online: "USD" });
  });

  it("change la monnaie tout de suite sans abonnement payant, au renouvellement sinon", async () => {
    const o = await merchant("FR");
    expect((await o.client.post("/api/app/billing/currency", { currency: "GBP" })).status).toBe(400);
    expect((await o.client.post("/api/app/billing/currency", { currency: "USD" })).body).toEqual({ currency: "USD", effective: "now" });
    await o.client.post("/api/app/billing/checkout", { planCode: "starter", interval: "YEAR" });
    expect((await db.subscription.findUniqueOrThrow({ where: { tenantId: o.tenantId } })).currency).toBe("USD");

    // Abonnement en cours : la monnaie de l'abonnement ne bouge pas, ni pour un changement d'offre.
    expect((await o.client.post("/api/app/billing/currency", { currency: "EUR" })).body).toEqual({ currency: "EUR", effective: "renewal" });
    expect((await o.client.get("/api/app/billing")).body.currency).toEqual({ billing: "EUR", online: "EUR", subscription: "USD" });
    await o.client.post("/api/app/billing/checkout", { planCode: "business", interval: "YEAR" });
    expect((await db.subscription.findUniqueOrThrow({ where: { tenantId: o.tenantId } })).currency).toBe("USD");

    // Renouvellement : la nouvelle monnaie s'applique.
    await db.subscription.update({ where: { tenantId: o.tenantId }, data: { currentPeriodEnd: new Date(Date.now() - 1000) } });
    await app.get(BillingService).closeExpired();
    expect((await db.subscription.findUniqueOrThrow({ where: { tenantId: o.tenantId } })).currency).toBe("EUR");
    const renewal = await db.payment.findFirstOrThrow({ where: { tenantId: o.tenantId }, orderBy: { createdAt: "desc" } });
    expect(renewal).toMatchObject({ currency: "EUR", amountCents: await price("business", "EUR") });
  });

  it("refuse une offre sans prix dans la monnaie du paiement", async () => {
    const o = await merchant("FR");
    await db.planPrice.deleteMany({ where: { plan: { code: "premium" }, currency: "EUR" } });
    const res = await o.client.post("/api/app/billing/checkout", { planCode: "premium", interval: "YEAR" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("price_missing");
    await db.planPrice.create({ data: { plan: { connect: { code: "premium" } }, currency: "EUR", yearlyCents: 45900 } });
  });
});

describe("parrainage dans la monnaie du commerce", () => {
  it("remise du filleul et plafond du parrain en euros", async () => {
    const parrain = await merchant("FR");
    await parrain.client.post("/api/app/billing/checkout", { planCode: "business", interval: "YEAR" });
    const slug = (await db.tenant.findUniqueOrThrow({ where: { id: parrain.tenantId } })).slug;
    const filleul = await merchant("BE");
    await db.referralReward.create({ data: { referrerTenantId: parrain.tenantId, referredTenantId: filleul.tenantId } });

    expect((await filleul.client.get("/api/app/referrals")).body.asReferee).toMatchObject({ discountCents: 2000, currency: "EUR" });
    await filleul.client.post("/api/app/billing/checkout", { planCode: "starter", interval: "YEAR" });
    const payment = await db.payment.findFirstOrThrow({ where: { tenantId: filleul.tenantId } });
    expect(payment).toMatchObject({ currency: "EUR", amountCents: (await price("starter", "EUR")) - 2000 });

    const summary = (await parrain.client.get("/api/app/referrals")).body;
    expect(summary).toMatchObject({ currency: "EUR", rewardCents: 2000, year: { capCents: 20000 } });
    expect(slug).toBeTruthy();
  });

  it("récompense un parrain marocain en dirhams, plafonnée au prix de son offre", async () => {
    const parrain = await merchant("MA");
    // Contrat hors ligne en dirhams (comme un encaissement validé par FOVE).
    const admin = await superAdmin();
    await admin.post(`/api/admin/tenants/${parrain.tenantId}/subscription`, {
      planCode: "starter",
      status: "ACTIVE",
      currentPeriodEnd: new Date(Date.now() + 365 * 86_400_000).toISOString(),
      contractPriceYearlyCents: 129000,
    });
    const sub = await db.subscription.findUniqueOrThrow({ where: { tenantId: parrain.tenantId } });
    expect(sub.currency).toBe("MAD");
    const referrals = app.get(ReferralService);
    expect(await referrals.yearlyCap(parrain.tenantId)).toEqual({ cap: 129000, currency: "MAD" });
    expect((await parrain.client.get("/api/app/referrals")).body).toMatchObject({ currency: "MAD", rewardCents: 20000 });
  });
});

describe("taux comptables et consolidation", () => {
  it("lit et modifie les taux, réservés à l'administration", async () => {
    const o = await merchant("FR");
    expect((await o.client.get("/api/admin/finance/exchange-rates")).status).toBe(403);
    const admin = await superAdmin();
    const put = await admin.put("/api/admin/finance/exchange-rates", { rates: [{ currency: "USD", unitsPerEur: 1.1 }, { currency: "MAD", unitsPerEur: 11 }] });
    expect(put.status).toBe(200);
    expect(put.body).toEqual(expect.arrayContaining([expect.objectContaining({ currency: "USD", unitsPerEur: 1.1 }), expect.objectContaining({ currency: "MAD", unitsPerEur: 11 })]));
    expect((await admin.put("/api/admin/finance/exchange-rates", { rates: [{ currency: "EUR", unitsPerEur: 2 }] })).status).toBe(400);
    expect((await admin.put("/api/admin/finance/exchange-rates", { rates: [{ currency: "USD", unitsPerEur: 0 }] })).status).toBe(400);
  });

  it("consolide le MRR en euros au taux comptable", async () => {
    const admin = await superAdmin();
    await admin.put("/api/admin/finance/exchange-rates", { rates: [{ currency: "MAD", unitsPerEur: 10 }] });
    const before = (await admin.get("/api/admin/stats")).body;
    const o = await merchant("MA");
    await admin.post(`/api/admin/tenants/${o.tenantId}/subscription`, {
      planCode: "custom",
      status: "ACTIVE",
      currentPeriodEnd: new Date(Date.now() + 365 * 86_400_000).toISOString(),
      contractPriceYearlyCents: 120_000,
      currency: "MAD",
    });
    const after = (await admin.get("/api/admin/stats")).body;
    expect(after.mrrCurrency).toBe("EUR");
    expect(after.mrrByCurrency.MAD - (before.mrrByCurrency.MAD ?? 0)).toBe(10_000);
    expect(after.mrrCents - before.mrrCents).toBe(1_000);
  });
});
