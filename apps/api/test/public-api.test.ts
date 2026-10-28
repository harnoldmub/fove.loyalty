import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { createCustomerWithCard, createPointsProgram, db, ownerWithTenant, resetDatabase, startApp, type Client } from "./helpers";

let app: NestExpressApplication;
let owner: Client;
let programId: string;
let accountId: string;
let secret: string;
const http = () => request(app.getHttpServer());

async function key(body: object) {
  const res = await owner.post("/api/app/integrations/keys", body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.key as string;
}

beforeAll(async () => {
  await resetDatabase();
  app = await startApp();
  const o = await ownerWithTenant(app);
  owner = o.client;
  await db.user.update({ where: { email: o.email }, data: { emailVerifiedAt: new Date() } });
  programId = (await createPointsProgram(owner)).id;
  accountId = (await createCustomerWithCard(owner, programId)).accountId;
  secret = await key({ name: "Caisse", kind: "SECRET", scopes: ["customers:read", "loyalty:read", "loyalty:write", "programs:read"] });
});
afterAll(() => app.close());

describe("API publique v1", () => {
  it("exige une clé secrète valide", async () => {
    expect((await http().get("/api/v1/programs")).status).toBe(401);
    expect((await http().get("/api/v1/programs").set("Authorization", "Bearer fove_sk_test_faux")).status).toBe(401);
    expect((await http().get("/api/v1/programs").set("Authorization", `Bearer ${secret}`)).status).toBe(200);
  });

  it("respecte les scopes de la clé", async () => {
    const readOnly = await key({ name: "Lecture", kind: "SECRET", scopes: ["customers:read"] });
    const res = await http().post("/api/v1/loyalty/transactions").set("Authorization", `Bearer ${readOnly}`).set("Idempotency-Key", "scope-test-1").send({ accountId, amount: "1000" });
    expect(res.status).toBe(403);
  });

  it("exige Idempotency-Key et rejoue la réponse d'origine", async () => {
    const auth = { Authorization: `Bearer ${secret}` };
    expect((await http().post("/api/v1/loyalty/transactions").set(auth).send({ accountId, amount: "5000" })).status).toBe(400);
    const first = await http().post("/api/v1/loyalty/transactions").set(auth).set("Idempotency-Key", "idem-api-0001").send({ accountId, amount: "5000" });
    const second = await http().post("/api/v1/loyalty/transactions").set(auth).set("Idempotency-Key", "idem-api-0001").send({ accountId, amount: "5000" });
    expect(first.status).toBe(201);
    expect(second.headers["idempotent-replayed"]).toBe("true");
    expect(second.body.transaction.id).toBe(first.body.transaction.id);
    const other = await http().post("/api/v1/loyalty/transactions").set(auth).set("Idempotency-Key", "idem-api-0001").send({ accountId, amount: "9000" });
    expect(other.status).toBe(422);
    expect((await db.loyaltyAccount.findUniqueOrThrow({ where: { id: accountId } })).balance).toBe(5);
  });

  it("une clé révoquée cesse de fonctionner", async () => {
    const k = await key({ name: "Temporaire", kind: "SECRET", scopes: ["programs:read"] });
    const id = (await owner.get("/api/app/integrations/keys")).body.find((c: { name: string }) => c.name === "Temporaire").id;
    await owner.delete(`/api/app/integrations/keys/${id}`);
    expect((await http().get("/api/v1/programs").set("Authorization", `Bearer ${k}`)).status).toBe(401);
  });

  it("une clé publique de widget ne peut jamais créditer", async () => {
    const pk = await key({ name: "Widget", kind: "PUBLISHABLE", allowedOrigins: ["https://boutique.example"] });
    const res = await http().post("/api/v1/loyalty/transactions").set("Authorization", `Bearer ${pk}`).set("Idempotency-Key", "pk-credit-01").send({ accountId, amount: "1000" });
    expect(res.status).toBe(401);
    expect((await key({ name: "Widget scopé", kind: "PUBLISHABLE", scopes: ["loyalty:write"] }).catch(() => "refusé"))).toBe("refusé");
  });

  it("le widget ne répond qu'aux domaines autorisés", async () => {
    const pk = await key({ name: "Widget site", kind: "PUBLISHABLE", environment: "LIVE", allowedOrigins: ["https://boutique.example"] });
    expect((await http().get(`/api/widget/config?key=${pk}`).set("Origin", "https://pirate.example")).status).toBe(403);
    const ok = await http().get(`/api/widget/config?key=${pk}`).set("Origin", "https://boutique.example");
    expect(ok.status).toBe(200);
    expect(ok.headers["access-control-allow-origin"]).toBe("https://boutique.example");
    expect(ok.body.programs[0].joinUrl).toMatch(/\/join\//);
    expect(JSON.stringify(ok.body)).not.toMatch(/fove_sk|tenantId/);
  });

  it("l'API n'est pas incluse dans l'offre Starter", async () => {
    const tenant = await db.subscription.findFirstOrThrow({ where: { tenant: { memberships: { some: {} } } } });
    const starter = await db.subscriptionPlan.findUniqueOrThrow({ where: { code: "starter" } });
    const business = await db.subscriptionPlan.findUniqueOrThrow({ where: { code: "business" } });
    await db.subscription.update({ where: { id: tenant.id }, data: { planId: starter.id } });
    expect((await http().get("/api/v1/programs").set("Authorization", `Bearer ${secret}`)).status).toBe(402);
    await db.subscription.update({ where: { id: tenant.id }, data: { planId: business.id } });
  });

  it("publie la documentation OpenAPI", async () => {
    const res = await http().get("/api/openapi.json");
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.paths)).toContain("/api/v1/loyalty/transactions");
  });
});
