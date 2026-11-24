import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { agent, createPointsProgram, db, ownerWithTenant, randomPhone, resetDatabase, selfEnroll, startApp, uniq, type Client } from "./helpers";

let app: NestExpressApplication;
beforeAll(async () => {
  await resetDatabase();
  app = await startApp({ GOOGLE_OAUTH_CLIENT_ID: "test-client.apps.googleusercontent.com", GOOGLE_OAUTH_CLIENT_SECRET: "test-secret" });
});
afterAll(() => app.close());
afterEach(() => vi.restoreAllMocks());

const newEmail = () => `${uniq("g")}@test.fove`;

/** Simule les réponses de Google (échange du code, puis profil). */
function mockGoogle(profile: { email: string; sub?: string; email_verified?: boolean; given_name?: string; family_name?: string }) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith("https://oauth2.googleapis.com/token")) return Response.json({ access_token: "tok" });
    if (url.startsWith("https://openidconnect.googleapis.com/v1/userinfo")) {
      return Response.json({ sub: `sub-${profile.email}`, email_verified: true, name: "Amina Diallo", given_name: "Amina", family_name: "Diallo", ...profile });
    }
    throw new Error(`fetch inattendu : ${url}`);
  });
}

/** Aller-retour complet par Google, depuis `next`. */
async function googleLogin(c: Client, next = "/mes-cartes") {
  const start = await c.get(`/api/client/auth/google?next=${encodeURIComponent(next)}`);
  expect(start.status).toBe(303);
  const google = new URL(start.headers.location);
  expect(google.searchParams.get("redirect_uri")).toMatch(/\/api\/client\/auth\/google\/callback$/);
  return c.get(`/api/client/auth/google/callback?code=abc&state=${google.searchParams.get("state")}`);
}

async function shop(programOverrides: object = {}) {
  const { client: owner, tenantId } = await ownerWithTenant(app);
  const program = await createPointsProgram(owner, programOverrides);
  const links = (await owner.get("/api/app/enrollment-links")).body as { token: string; programId: string }[];
  return { tenantId, token: links.find((l) => l.programId === program.id)!.token };
}

describe("compte client FOVE : continuer avec Google", () => {
  it("crée un compte confirmé, avec le prénom et le nom de Google, et revient sur la page du commerce", async () => {
    const { token } = await shop();
    const email = newEmail();
    mockGoogle({ email });
    const c = agent(app);
    const res = await googleLogin(c, `/join/${token}`);
    expect(res.status).toBe(303);
    expect(res.headers.location).toMatch(new RegExp(`/join/${token}$`));

    const me = await c.get("/api/client/me");
    expect(me.body).toMatchObject({ email, firstName: "Amina", lastName: "Diallo" });
    expect(me.body.emailVerifiedAt).not.toBeNull();
    expect((await db.clientAccount.findUniqueOrThrow({ where: { email } })).googleSub).toBe(`sub-${email}`);

    // De retour sur la page du commerce : un geste pour rejoindre, même pour un 2e commerce.
    expect((await c.get(`/api/client/join/${token}`)).body).toMatchObject({ state: "can_join", verified: true });
    expect((await c.post(`/api/client/join/${token}`, { phone: randomPhone(), acceptTerms: true })).body.state).toBe("joined");
    const other = await shop();
    expect((await c.get(`/api/client/join/${other.token}`)).body.state).toBe("can_join");
  });

  it("ne crée pas de session commerçant", async () => {
    mockGoogle({ email: newEmail() });
    const c = agent(app);
    await googleLogin(c);
    expect((await c.get("/api/auth/me")).status).toBe(401);
  });

  it("retrouve le compte créé par code email et y attache l'identité Google", async () => {
    const email = newEmail();
    const c = agent(app);
    await c.post("/api/client/auth/code", { email });
    const code = /: (\d{6})/.exec((await db.emailOutbox.findFirstOrThrow({ where: { to: email } })).text)![1];
    const id = (await c.post("/api/client/auth/verify", { email, code })).body.account.id;

    mockGoogle({ email });
    await googleLogin(agent(app));
    const account = await db.clientAccount.findUniqueOrThrow({ where: { email } });
    expect(account.id).toBe(id);
    expect(account.googleSub).toBe(`sub-${email}`);
    expect(await db.clientAccount.count({ where: { email } })).toBe(1);
  });

  it("confirme un compte créé au scan, ferme ses autres sessions et active ses cartes en attente", async () => {
    const { token } = await shop({ enrollmentVerification: "EMAIL_OTP" });
    const email = newEmail();
    const enrolled = await selfEnroll(app, token, { firstName: "Otp", phone: randomPhone(), email, acceptTerms: true });
    expect(enrolled.body.status).toBe("PENDING_VERIFICATION");

    mockGoogle({ email });
    const phone = agent(app);
    await googleLogin(phone);
    expect((await db.clientAccount.findUniqueOrThrow({ where: { email } })).emailVerifiedAt).not.toBeNull();
    // Session ouverte à l'inscription : fermée (quelqu'un d'autre a pu taper cet email).
    expect((await enrolled.client.get("/api/client/me")).status).toBe(401);
    const card = await phone.get(`/api/public/cards/${enrolled.body.cardPath.split("/card/")[1]}`);
    expect(card.body.card.status).toBe("ACTIVE");
  });

  it("reconnaît le compte par son identifiant Google même si l'email Google a changé", async () => {
    const email = newEmail();
    mockGoogle({ email, sub: "sub-stable" });
    await googleLogin(agent(app));
    vi.restoreAllMocks();
    mockGoogle({ email: newEmail(), sub: "sub-stable" });
    const c = agent(app);
    await googleLogin(c);
    expect((await c.get("/api/client/me")).body.email).toBe(email);
  });

  it("refuse un email que Google n'a pas vérifié, et renvoie vers la connexion", async () => {
    const email = newEmail();
    mockGoogle({ email, email_verified: false });
    const res = await googleLogin(agent(app));
    expect(res.headers.location).toContain("/mes-cartes/connexion?");
    expect(res.headers.location).toContain("oauth_error=failed");
    expect(await db.clientAccount.findUnique({ where: { email } })).toBeNull();
  });

  it("refuse un retour dont l'état ne correspond pas, sans appeler Google", async () => {
    mockGoogle({ email: newEmail() });
    const c = agent(app);
    await c.get("/api/client/auth/google");
    const res = await c.get("/api/client/auth/google/callback?code=abc&state=faux");
    expect(res.headers.location).toContain("oauth_error=failed");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("le retour Google commerçant ne vaut pas pour l'espace client (cookies d'état distincts)", async () => {
    mockGoogle({ email: newEmail() });
    const c = agent(app);
    const start = await c.get("/api/auth/google?next=/app");
    const state = new URL(start.headers.location).searchParams.get("state");
    const res = await c.get(`/api/client/auth/google/callback?code=abc&state=${state}`);
    expect(res.headers.location).toContain("oauth_error=failed");
  });
});
