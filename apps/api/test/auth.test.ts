import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { agent, db, lastEmail, resetDatabase, startApp, uniq } from "./helpers";

let app: NestExpressApplication;
beforeAll(async () => {
  await resetDatabase();
  app = await startApp();
});
afterAll(() => app.close());

describe("authentification", () => {
  it("inscription, session, déconnexion", async () => {
    const c = agent(app);
    const email = `${uniq("u")}@test.fove`;
    expect((await c.post("/api/auth/signup", { name: "Amy", email, password: "motdepasse123", acceptTerms: true })).status).toBe(201);
    const me = await c.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(email);
    expect(me.body.user.emailVerifiedAt).toBeNull();
    expect((await c.post("/api/auth/logout")).status).toBe(204);
    expect((await c.get("/api/auth/me")).status).toBe(401);
  });

  it("refuse un mot de passe faible et un email déjà pris", async () => {
    const c = agent(app);
    const email = `${uniq("u")}@test.fove`;
    expect((await c.post("/api/auth/signup", { name: "Amy", email, password: "court", acceptTerms: true })).status).toBe(400);
    await c.post("/api/auth/signup", { name: "Amy", email, password: "motdepasse123", acceptTerms: true });
    const again = await agent(app).post("/api/auth/signup", { name: "Amy", email, password: "motdepasse123", acceptTerms: true });
    expect(again.status).toBe(409);
  });

  it("exige l'en-tête anti-CSRF sur les écritures", async () => {
    const res = await request(app.getHttpServer()).post("/api/auth/login").send({ email: "x@test.fove", password: "x" });
    expect(res.status).toBe(403);
  });

  it("vérifie l'email avec un lien à usage unique", async () => {
    const c = agent(app);
    const email = `${uniq("u")}@test.fove`;
    await c.post("/api/auth/signup", { name: "Amy", email, password: "motdepasse123", acceptTerms: true });
    const token = /token=([A-Za-z0-9_-]+)/.exec((await lastEmail(email))!.text)![1];
    expect((await c.post("/api/auth/verify-email", { token })).status).toBe(204);
    expect((await c.post("/api/auth/verify-email", { token })).status).toBe(400);
    expect((await c.get("/api/auth/me")).body.user.emailVerifiedAt).not.toBeNull();
  });

  it("bloque le compte après 5 échecs", async () => {
    const email = `${uniq("u")}@test.fove`;
    await agent(app).post("/api/auth/signup", { name: "Amy", email, password: "motdepasse123", acceptTerms: true });
    const c = agent(app);
    for (let i = 0; i < 5; i++) expect((await c.post("/api/auth/login", { email, password: "mauvais12345" })).status).toBe(401);
    expect((await c.post("/api/auth/login", { email, password: "motdepasse123" })).status).toBe(403);
  });

  it("réinitialise le mot de passe et révoque les sessions", async () => {
    const email = `${uniq("u")}@test.fove`;
    const first = agent(app);
    await first.post("/api/auth/signup", { name: "Amy", email, password: "motdepasse123", acceptTerms: true });
    const anon = agent(app);
    expect((await anon.post("/api/auth/forgot-password", { email })).status).toBe(204);
    expect((await anon.post("/api/auth/forgot-password", { email: "inconnu@test.fove" })).status).toBe(204);
    const token = /token=([A-Za-z0-9_-]+)/.exec((await lastEmail(email))!.text)![1];
    expect((await anon.post("/api/auth/reset-password", { token, password: "nouveaumdp456" })).status).toBe(204);
    expect((await first.get("/api/auth/me")).status).toBe(401);
    expect((await anon.post("/api/auth/login", { email, password: "nouveaumdp456" })).status).toBe(200);
  });

  it("ne stocke que l'empreinte des jetons de session", async () => {
    const c = agent(app);
    const email = `${uniq("u")}@test.fove`;
    const res = await c.post("/api/auth/signup", { name: "Amy", email, password: "motdepasse123", acceptTerms: true });
    const cookie = String(res.headers["set-cookie"]).split(";")[0]!.split("=")[1]!;
    const session = await db.session.findFirst({ where: { user: { email } } });
    expect(session!.tokenHash).not.toBe(cookie);
    expect(String(res.headers["set-cookie"])).toMatch(/HttpOnly/);
  });
});
