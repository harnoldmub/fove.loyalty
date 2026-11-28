import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { agent, db, ownerWithTenant, resetDatabase, startApp, uniq, signIn } from "./helpers";
import { PartnersService } from "../src/partners/partners.service";

/** Revue de sécurité du 28 novembre 2026 (docs/securite.md) : corrections du lot S1. */
let app: NestExpressApplication;
const http = () => request(app.getHttpServer());

beforeAll(async () => {
  await resetDatabase();
  app = await startApp({ STRIPE_SECRET_KEY: undefined });
});
afterAll(async () => {
  await app.close();
});

describe("espace partenaire réservé aux partenaires validés", () => {
  async function partnerAccount(status: string) {
    const email = `${uniq("agent")}@test.fove`;
    const user = await db.user.create({ data: { email, name: "Agent", emailVerifiedAt: new Date(), isPartner: true } });
    await db.partner.create({ data: { name: "Agent", email, code: uniq("AG").toUpperCase(), status: status as never, userId: user.id, country: "FR" } });
    const client = agent(app);
    await signIn(client, email);
    return client;
  }

  it("suspendu : plus d'accès à l'espace ni aux coordonnées, et plus d'espace partenaire à la connexion", async () => {
    const client = await partnerAccount("SUSPENDED");
    const me = await client.get("/api/partner/me");
    expect(me.status).toBe(403);
    expect(me.body.error.code).toBe("partner_suspended");
    expect((await client.patch("/api/partner/profile", { payoutInfo: { method: "BANK_TRANSFER", accountHolder: "X", iban: "FR76" } })).status).toBe(403);
    expect((await client.get("/api/partner/clients")).status).toBe(403);
    expect((await client.get("/api/auth/me")).body.spaces.partner).toBe(false);
  });

  it("candidature en cours : l'espace l'indique, sans donner accès aux données", async () => {
    const client = await partnerAccount("PENDING");
    const me = await client.get("/api/partner/me");
    expect(me.status).toBe(403);
    expect(me.body.error.code).toBe("partner_pending");
    expect((await client.get("/api/auth/me")).body.spaces.partner).toBe(true);
  });

  it("validé : accès normal", async () => {
    const client = await partnerAccount("ACTIVE");
    expect((await client.get("/api/partner/me")).status).toBe(200);
  });
});

describe("limites d'envoi", () => {
  it("candidatures partenaires : 10 par adresse IP et par jour", async () => {
    const partners = app.get(PartnersService);
    const apply = (i: number) =>
      partners.apply(
        { name: "Candidat", email: `${uniq(`c${i}`)}@test.fove`, phone: "+33600000000", company: "", country: "FR", city: "Lyon", partnerType: "SALES_FREELANCE", websiteUrl: "", promotionStrategy: "Je présente FOVE aux commerces de mon quartier.", networkSizeEstimate: "", acceptTerms: true },
        "203.0.113.9",
      );
    for (let i = 0; i < 10; i++) await apply(i);
    await expect(apply(10)).rejects.toMatchObject({ code: "too_many_applications" });
  });

  it("codes de connexion : 20 par email et par jour", async () => {
    const email = `${uniq("victime")}@test.fove`;
    const old = new Date(Date.now() - 2 * 3_600_000);
    await db.userLoginCode.createMany({ data: Array.from({ length: 20 }, () => ({ email, codeHash: "x", expiresAt: old, createdAt: old })) });
    const res = await http().post("/api/auth/code").set("x-fove-csrf", "1").send({ email });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("too_many_codes_today");
  });
});

describe("adresses web et exposition de l'API", () => {
  it("refuse javascript: et data: dans les adresses saisies", async () => {
    const { client } = await ownerWithTenant(app);
    expect((await client.patch("/api/app/tenant", { privacyPolicyUrl: "javascript:alert(1)" })).status).toBe(400);
    expect((await client.patch("/api/app/tenant", { logoUrl: "data:image/png;base64,AAAA" })).status).toBe(400);
    expect((await client.patch("/api/app/tenant", { privacyPolicyUrl: "https://exemple.fr/confidentialite" })).status).toBeLessThan(300);
  });

  it("CORS : origine exacte seulement, aucun sous-domaine", async () => {
    const allowed = await http().get("/api/health").set("Origin", "http://localhost:5290");
    expect(allowed.headers["access-control-allow-origin"]).toBe("http://localhost:5290");
    const sub = await http().get("/api/health").set("Origin", "http://evil.localhost:5290");
    expect(sub.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("la documentation publique ne liste que l'API publique et le widget", async () => {
    const paths = Object.keys((await http().get("/api/openapi.json")).body.paths);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.every((p) => p.startsWith("/api/v1/") || p.startsWith("/api/widget/"))).toBe(true);
  });
});
