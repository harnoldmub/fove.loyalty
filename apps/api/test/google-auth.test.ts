import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { agent, db, resetDatabase, startApp, uniq, type Client } from "./helpers";

let app: NestExpressApplication;
beforeAll(async () => {
  await resetDatabase();
  app = await startApp({ GOOGLE_OAUTH_CLIENT_ID: "test-client.apps.googleusercontent.com", GOOGLE_OAUTH_CLIENT_SECRET: "test-secret" });
});
afterAll(() => app.close());
afterEach(() => vi.restoreAllMocks());

/** Simule les réponses de Google (échange du code, puis profil). */
function mockGoogle(profile: { email: string; email_verified?: boolean; name?: string }) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith("https://oauth2.googleapis.com/token")) return Response.json({ access_token: "tok" });
    if (url.startsWith("https://openidconnect.googleapis.com/v1/userinfo")) return Response.json({ sub: `google-${profile.email}`, email_verified: true, name: "Amy", ...profile });
    throw new Error(`fetch inattendu : ${url}`);
  });
}

/** Parcours complet : départ vers Google puis retour avec un code. */
async function googleLogin(c: Client, next = "/app") {
  const start = await c.get(`/api/auth/google?next=${encodeURIComponent(next)}`);
  expect(start.status).toBe(303);
  const state = new URL(start.headers.location).searchParams.get("state")!;
  return c.get(`/api/auth/google/callback?code=abc&state=${state}`);
}

describe("connexion Google des commerçants", () => {
  it("crée un compte confirmé pour un nouvel email", async () => {
    const email = `${uniq("g")}@test.fove`;
    mockGoogle({ email });
    const c = agent(app);
    const res = await googleLogin(c);
    expect(res.status).toBe(303);
    expect(res.headers.location).toMatch(/\/app$/);
    const me = await c.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(email);
    expect(me.body.user.emailVerifiedAt).not.toBeNull();
  });

  it("reprend un compte non confirmé créé par un tiers : mot de passe et sessions invalidés", async () => {
    const email = `${uniq("g")}@test.fove`;
    const intrus = agent(app);
    await intrus.post("/api/auth/signup", { name: "Intrus", email, password: "motdepasse123", acceptTerms: true });
    expect((await intrus.get("/api/auth/me")).status).toBe(200);

    mockGoogle({ email });
    const proprietaire = agent(app);
    expect((await googleLogin(proprietaire)).status).toBe(303);

    expect((await proprietaire.get("/api/auth/me")).body.user.emailVerifiedAt).not.toBeNull();
    expect((await intrus.get("/api/auth/me")).status).toBe(401);
    expect((await agent(app).post("/api/auth/login", { email, password: "motdepasse123" })).status).toBe(401);
  });

  it("ne touche ni au mot de passe ni aux sessions d'un compte déjà confirmé", async () => {
    const email = `${uniq("g")}@test.fove`;
    const first = agent(app);
    await first.post("/api/auth/signup", { name: "Amy", email, password: "motdepasse123", acceptTerms: true });
    await db.user.update({ where: { email }, data: { emailVerifiedAt: new Date() } });

    mockGoogle({ email });
    expect((await googleLogin(agent(app))).status).toBe(303);

    expect((await first.get("/api/auth/me")).status).toBe(200);
    expect((await agent(app).post("/api/auth/login", { email, password: "motdepasse123" })).status).toBe(200);
  });

  it("refuse un email que Google n'a pas vérifié", async () => {
    const email = `${uniq("g")}@test.fove`;
    mockGoogle({ email, email_verified: false });
    const c = agent(app);
    const res = await googleLogin(c);
    expect(res.headers.location).toContain("oauth_error=failed");
    expect(await db.user.findUnique({ where: { email } })).toBeNull();
    expect((await c.get("/api/auth/me")).status).toBe(401);
  });

  it("refuse un retour dont le state ne correspond pas", async () => {
    mockGoogle({ email: `${uniq("g")}@test.fove` });
    const c = agent(app);
    await c.get("/api/auth/google");
    const res = await c.get("/api/auth/google/callback?code=abc&state=faux");
    expect(res.headers.location).toContain("oauth_error=failed");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
