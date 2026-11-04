import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { agent, createPointsProgram, db, ownerWithTenant, randomPhone, resetDatabase, setPlan, startApp, type Client } from "./helpers";
import { hashPassword } from "../src/common/crypto";
import { PlanService } from "../src/billing/plan.service";

let app: NestExpressApplication;
const http = () => request(app.getHttpServer());

beforeAll(async () => {
  await resetDatabase();
  app = await startApp();
});
afterAll(() => app.close());

async function verifiedOwner(plan: string) {
  const o = await ownerWithTenant(app, { plan });
  await db.user.update({ where: { email: o.email }, data: { emailVerifiedAt: new Date() } });
  return o;
}

async function secretKey(owner: Client) {
  const res = await owner.post("/api/app/integrations/keys", { name: "Serveur", kind: "SECRET", scopes: ["customers:read", "customers:write", "integrations:write", "loyalty:read"] });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.key as string;
}

async function superAdmin() {
  const email = `admin${Date.now()}@fove.test`;
  await db.user.create({ data: { email, name: "Admin", passwordHash: await hashPassword("motdepasse123"), isSuperAdmin: true, emailVerifiedAt: new Date() } });
  const c = agent(app);
  await c.post("/api/auth/login", { email, password: "motdepasse123" });
  return c;
}

/** Quota du Gratuit en test : 3 clients, 1 établissement, 1 collaborateur, 1 programme. */
describe("offre Gratuite : quotas sur chaque chemin de création de client", () => {
  it("depuis le tableau de bord, le client de trop est refusé", async () => {
    const { client } = await verifiedOwner("free");
    for (let i = 0; i < 3; i++) expect((await client.post("/api/app/customers", { firstName: `C${i}`, phone: randomPhone() })).status).toBe(201);
    const over = await client.post("/api/app/customers", { firstName: "Trop", phone: randomPhone() });
    expect(over.status).toBe(402);
    expect(over.body.error.code).toBe("quota_exceeded");
  });

  it("à l'import, les lignes au-delà du quota sont écartées", async () => {
    const { client } = await verifiedOwner("free");
    const rows = Array.from({ length: 5 }, (_, i) => ({ prenom: `I${i}`, telephone: randomPhone() }));
    const res = await client.post("/api/app/customers/import", { rows });
    expect(res.status).toBe(201);
    expect(res.body.summary).toMatchObject({ created: 3, overQuota: 2 });
  });

  it("par le QR d'inscription, le client de trop est refusé", async () => {
    const { client } = await verifiedOwner("free");
    const program = await createPointsProgram(client);
    const token = ((await client.get("/api/app/enrollment-links")).body as { token: string; programId: string }[]).find((l) => l.programId === program.id)!.token;
    for (let i = 0; i < 3; i++) {
      expect((await http().post(`/api/public/join/${token}`).send({ firstName: `Q${i}`, phone: randomPhone(), acceptTerms: true })).status).toBe(201);
    }
    const over = await http().post(`/api/public/join/${token}`).send({ firstName: "Trop", phone: randomPhone(), acceptTerms: true });
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe("enrollment_closed");
    // Le client ne voit jamais l'offre ni la limite du commerçant.
    expect(JSON.stringify(over.body)).not.toMatch(/offre|limite|\b3\b/i);
  });

  it("deux créations simultanées ne dépassent jamais le quota", async () => {
    const { client, tenantId } = await verifiedOwner("free");
    for (let i = 0; i < 2; i++) await client.post("/api/app/customers", { firstName: `C${i}`, phone: randomPhone() });
    const plans = app.get(PlanService);
    // A prend la dernière place mais tarde à valider ; B arrive pendant ce temps.
    let counted!: () => void;
    const aCounted = new Promise<void>((resolve) => (counted = resolve));
    const a = db.$transaction(async (tx) => {
      await plans.assertCustomerQuotaInTx(tx, tenantId);
      counted();
      await new Promise((resolve) => setTimeout(resolve, 300));
      await tx.customer.create({ data: { tenantId, firstName: "A" } });
    });
    await aCounted;
    const b = db.$transaction(async (tx) => {
      await plans.assertCustomerQuotaInTx(tx, tenantId);
      await tx.customer.create({ data: { tenantId, firstName: "B" } });
    });
    const [ra, rb] = await Promise.allSettled([a, b]);
    expect(ra.status).toBe("fulfilled");
    expect(rb.status).toBe("rejected");
    expect(await db.customer.count({ where: { tenantId } })).toBe(3);
  });

  it("prévient le commerçant une fois, à la dernière place puis au premier refus", async () => {
    const { client, tenantId } = await verifiedOwner("free");
    const contact = (await db.tenantSettings.findUniqueOrThrow({ where: { tenantId } })).contactEmail!;
    const program = await createPointsProgram(client);
    const token = ((await client.get("/api/app/enrollment-links")).body as { token: string; programId: string }[]).find((l) => l.programId === program.id)!.token;
    // Le contact du commerce est aussi l'adresse du propriétaire (email de vérification) : on ne garde que les alertes.
    const alerts = async () => (await db.emailOutbox.findMany({ where: { to: contact }, orderBy: { createdAt: "asc" } })).filter((m) => /atteint|rejoindre/.test(m.subject));
    const join = () => http().post(`/api/public/join/${token}`).send({ firstName: "Q", phone: randomPhone(), acceptTerms: true });
    for (let i = 0; i < 3; i++) await join();
    expect((await alerts()).map((m) => m.subject)).toEqual([expect.stringMatching(/a atteint 3 clients/)]);
    await join();
    await join();
    const all = await alerts();
    expect(all).toHaveLength(2);
    expect(all[1]!.subject).toMatch(/n'a pas pu rejoindre/);
  });

  it("par l'API et le connecteur boutique, le quota négocié s'applique aussi", async () => {
    const o = await verifiedOwner("business");
    await setPlan(o.tenantId, "business", { limitsOverride: { customers: 1 } });
    const program = await createPointsProgram(o.client);
    const auth = { Authorization: `Bearer ${await secretKey(o.client)}` };
    expect((await http().post("/api/v1/customers").set(auth).set("Idempotency-Key", "fm-api-1").send({ firstName: "Api", phone: randomPhone() })).status).toBe(201);
    expect((await http().post("/api/v1/customers").set(auth).set("Idempotency-Key", "fm-api-2").send({ firstName: "Trop", phone: randomPhone() })).status).toBe(402);
    const order = await http()
      .post("/api/v1/integrations/commerce/orders/paid")
      .set(auth)
      .set("Idempotency-Key", "fm-order-1")
      .send({ programId: program.id, externalOrderId: "ord-fm-1", amount: "5000", currency: "CDF", paidAt: new Date().toISOString(), customer: { externalId: "u-fm-1", email: "nouveau@test.fove" } });
    expect(order.status).toBe(402);
  });
});

describe("offre Gratuite : fonctions réservées aux offres payantes", () => {
  let owner: Client;
  let tenantId: string;
  let programId: string;
  beforeAll(async () => {
    const o = await verifiedOwner("free");
    owner = o.client;
    tenantId = o.tenantId;
    programId = (await createPointsProgram(owner)).id;
  });

  it("limite à 1 programme et au seul propriétaire", async () => {
    expect((await createPointsProgram(owner).catch((e: Error) => e.message)).toString()).toMatch(/^program 402/);
    const invite = await owner.post("/api/app/team/invitations", { email: "caisse@test.fove", role: "CASHIER" });
    expect(invite.status).toBe(402);
  });

  it("refuse l'API, les webhooks et les campagnes Wallet", async () => {
    expect((await owner.post("/api/app/integrations/keys", { name: "Serveur", kind: "SECRET", scopes: ["customers:read"] })).status).toBe(402);
    expect((await owner.post("/api/app/integrations/webhooks", { url: "https://hook.example/fove", events: ["customer.created"] })).status).toBe(402);
    const broadcast = await owner.post(`/api/app/programs/${programId}/wallet-broadcast`, { title: "Promo", body: "-20 % ce week-end" });
    expect(broadcast.status).toBe(402);
  });

  it("garde le widget et l'export RGPD, avec la mention FOVE", async () => {
    const pk = await owner.post("/api/app/integrations/keys", { name: "Widget", kind: "PUBLISHABLE", allowedOrigins: ["https://boutique.example"] });
    expect(pk.status).toBe(201);
    const widget = await http().get(`/api/widget/config?key=${pk.body.key}`).set("Origin", "https://boutique.example");
    expect(widget.status).toBe(200);
    expect(widget.body.poweredBy).toBe(true);
    const created = await owner.post("/api/app/customers", { firstName: "Rgpd", phone: randomPhone(), programId });
    expect((await owner.get(`/api/app/customers/${created.body.customer.id}/export`)).status).toBe(200);
    const card = await http().get(`/api/public/cards/${created.body.cardUrl.split("/card/")[1]}`);
    expect(card.body.poweredBy).toBe(true);
    await setPlan(tenantId, "starter");
    expect((await http().get(`/api/public/cards/${created.body.cardUrl.split("/card/")[1]}`)).body.poweredBy).toBe(false);
    await setPlan(tenantId, "free");
  });

  it("n'envoie plus de webhooks après un passage à une offre sans API", async () => {
    const o = await verifiedOwner("business");
    const hook = await o.client.post("/api/app/integrations/webhooks", { url: "https://hook.example/fove", events: ["customer.created"] });
    expect(hook.status).toBe(201);
    await o.client.post("/api/app/customers", { firstName: "Avant", phone: randomPhone() });
    expect(await db.webhookDelivery.count({ where: { tenantId: o.tenantId } })).toBe(1);
    await setPlan(o.tenantId, "free");
    await o.client.post("/api/app/customers", { firstName: "Après", phone: randomPhone() });
    expect(await db.webhookDelivery.count({ where: { tenantId: o.tenantId } })).toBe(1);
  });
});

describe("offre Sur-mesure attribuée par l'admin", () => {
  it("applique les quotas et fonctions du contrat, et compte son prix dans les statistiques", async () => {
    const o = await verifiedOwner("free");
    const admin = await superAdmin();
    const before = (await admin.get("/api/admin/stats")).body.mrrCents as number;
    const res = await admin.post(`/api/admin/tenants/${o.tenantId}/subscription`, {
      planCode: "custom",
      status: "ACTIVE",
      currentPeriodEnd: new Date(Date.now() + 365 * 86_400_000).toISOString(),
      limitsOverride: { customers: 2, establishments: 8 },
      featuresOverride: { api: false },
      contractPriceYearlyCents: 120_000,
    });
    expect(res.status).toBe(204);
    const tenant = (await o.client.get("/api/app/tenant")).body;
    expect(tenant.limits).toEqual({ customers: 2, establishments: 8, staff: null, programs: null });
    expect(tenant.features).toMatchObject({ api: false, integrations: true, walletCampaigns: true, removeBranding: true });
    expect((await admin.get("/api/admin/stats")).body.mrrCents).toBe(before + 10_000);
  });

  it("un nouvel appel de l'admin redéfinit tout le contrat", async () => {
    const o = await verifiedOwner("free");
    const admin = await superAdmin();
    await admin.post(`/api/admin/tenants/${o.tenantId}/subscription`, { planCode: "custom", status: "ACTIVE", limitsOverride: { customers: 2 } });
    await admin.post(`/api/admin/tenants/${o.tenantId}/subscription`, { planCode: "custom", status: "ACTIVE" });
    const sub = await db.subscription.findUniqueOrThrow({ where: { tenantId: o.tenantId } });
    expect(sub.limitsOverride).toBeNull();
    expect((await o.client.get("/api/app/tenant")).body.limits.customers).toBeNull();
  });
});
