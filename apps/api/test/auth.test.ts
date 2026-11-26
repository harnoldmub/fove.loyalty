import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { agent, db, lastEmail, ownerWithTenant, resetDatabase, signIn, startApp, uniq } from "./helpers";

/** Connexion sans mot de passe : code à 6 chiffres par email (docs/chantier-connexion-otp.md). */
let app: NestExpressApplication;
beforeAll(async () => {
  await resetDatabase();
  app = await startApp();
});
afterAll(() => app.close());

const codeOf = async (email: string) => /\b(\d{6})\b/.exec((await lastEmail(email))!.text)![1]!;

describe("connexion par code", () => {
  it("inscription : code, puis nom et CGU ; l'email est confirmé", async () => {
    const c = agent(app);
    const email = `${uniq("u")}@test.fove`;
    expect((await c.post("/api/auth/code", { email })).status).toBe(204);
    const code = await codeOf(email);

    // Email inconnu : le code juste demande le profil sans être consommé.
    expect((await c.post("/api/auth/code/verify", { email, code })).body).toEqual({ status: "profile_required" });
    expect((await c.post("/api/auth/code/verify", { email, code, name: "Amy" })).body).toEqual({ status: "profile_required" });
    const res = await c.post("/api/auth/code/verify", { email, code, name: "Amy", acceptTerms: true });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "signed_in", created: true });

    const me = await c.get("/api/auth/me");
    expect(me.body.user).toMatchObject({ email, name: "Amy" });
    expect(me.body.user.emailVerifiedAt).not.toBeNull();
    // Code à usage unique.
    expect((await agent(app).post("/api/auth/code/verify", { email, code })).body.error.code).toBe("code_expired");
    expect((await c.post("/api/auth/logout")).status).toBe(204);
    expect((await c.get("/api/auth/me")).status).toBe(401);
  });

  it("connexion d'un compte existant, même réponse pour un email inconnu", async () => {
    const email = `${uniq("u")}@test.fove`;
    await signIn(agent(app), email, "Amy");
    const c = agent(app);
    expect((await c.post("/api/auth/code", { email })).status).toBe(204);
    expect((await c.post("/api/auth/code", { email: `${uniq("inconnu")}@test.fove` })).status).toBe(204);
    const res = await c.post("/api/auth/code/verify", { email, code: await codeOf(email) });
    expect(res.body).toMatchObject({ status: "signed_in", created: false });
    expect((await c.get("/api/auth/me")).body.user.email).toBe(email);
  });

  it("limite les essais et les demandes de code", async () => {
    const email = `${uniq("u")}@test.fove`;
    const c = agent(app);
    await c.post("/api/auth/code", { email });
    const code = await codeOf(email);
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) expect((await c.post("/api/auth/code/verify", { email, code: wrong })).body.error.code).toBe("invalid_code");
    // Après 5 erreurs, même le bon code ne passe plus.
    expect((await c.post("/api/auth/code/verify", { email, code })).body.error.code).toBe("code_expired");
    // Nouveau code : pas avant une minute.
    expect((await c.post("/api/auth/code", { email })).body.error.code).toBe("too_soon");
    await db.userLoginCode.updateMany({ where: { email }, data: { createdAt: new Date(Date.now() - 2 * 60_000) } });
    for (let i = 0; i < 4; i++) {
      expect((await c.post("/api/auth/code", { email })).status).toBe(204);
      await db.userLoginCode.updateMany({ where: { email }, data: { createdAt: new Date(Date.now() - 2 * 60_000) } });
    }
    expect((await c.post("/api/auth/code", { email })).status).toBe(429);
  });

  it("confirme l'email d'un compte antérieur non confirmé", async () => {
    const email = `${uniq("u")}@test.fove`;
    await db.user.create({ data: { email, name: "Ancien" } });
    await signIn(agent(app), email);
    expect((await db.user.findUniqueOrThrow({ where: { email } })).emailVerifiedAt).not.toBeNull();
  });

  it("refuse un code mal formé et exige l'en-tête anti-CSRF", async () => {
    const c = agent(app);
    expect((await c.post("/api/auth/code/verify", { email: "x@test.fove", code: "12ab56" })).status).toBe(400);
    const res = await request(app.getHttpServer()).post("/api/auth/code").send({ email: "x@test.fove" });
    expect(res.status).toBe(403);
    // Les routes mot de passe n'existent plus.
    expect((await c.post("/api/auth/login", { email: "x@test.fove", password: "motdepasse123" })).status).toBe(404);
    expect((await c.post("/api/auth/forgot-password", { email: "x@test.fove" })).status).toBe(404);
  });

  it("ne stocke que l'empreinte du jeton de session, et l'échéance glisse", async () => {
    const c = agent(app);
    const email = `${uniq("u")}@test.fove`;
    const res = await signIn(c, email, "Amy");
    const cookie = String(res.headers["set-cookie"]).split(";")[0]!.split("=")[1]!;
    const session = await db.session.findFirstOrThrow({ where: { user: { email } } });
    expect(session.tokenHash).not.toBe(cookie);
    expect(String(res.headers["set-cookie"])).toMatch(/HttpOnly/);
    expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now() + 89 * 86_400_000);
    // Utilisation après plus de 5 minutes : l'échéance repart pour 90 jours.
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date(Date.now() - 10 * 60_000), expiresAt: new Date(Date.now() + 86_400_000) } });
    expect((await c.get("/api/auth/me")).status).toBe(200);
    expect((await db.session.findUniqueOrThrow({ where: { id: session.id } })).expiresAt.getTime()).toBeGreaterThan(Date.now() + 89 * 86_400_000);
  });

  it("invitation : le lien reçu suffit, sans mot de passe, et connecte un compte existant", async () => {
    const owner = await ownerWithTenant(app);
    const invite = async (email: string) => {
      expect((await owner.client.post("/api/app/team/invitations", { email, role: "CASHIER" })).status).toBe(201);
      return /token=([A-Za-z0-9_-]+)/.exec((await lastEmail(email))!.text)![1]!;
    };
    // Nouveau membre : nom seulement.
    const fresh = `${uniq("m")}@test.fove`;
    const c = agent(app);
    const token = await invite(fresh);
    expect((await c.post("/api/auth/invitations/accept", { token })).body.error.code).toBe("account_required");
    expect((await c.post("/api/auth/invitations/accept", { token, name: "Membre" })).status).toBeLessThan(300);
    expect((await c.get("/api/auth/me")).body.user).toMatchObject({ email: fresh });

    // Compte existant, non connecté : connecté par le lien.
    const existing = `${uniq("m")}@test.fove`;
    await db.user.create({ data: { email: existing, name: "Ancien" } });
    const e = agent(app);
    expect((await e.post("/api/auth/invitations/accept", { token: await invite(existing) })).status).toBeLessThan(300);
    const me = await e.get("/api/auth/me");
    expect(me.body.user.email).toBe(existing);
    expect(me.body.user.emailVerifiedAt).not.toBeNull();
  });
});
