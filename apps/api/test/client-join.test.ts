import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { agent, createPointsProgram, db, lastEmail, ownerWithTenant, randomPhone, resetDatabase, selfEnroll, startApp, uniq, type Client } from "./helpers";

let app: NestExpressApplication;
beforeAll(async () => {
  await resetDatabase();
  app = await startApp();
});
afterAll(() => app.close());

const http = () => request(app.getHttpServer());
const newEmail = () => `${uniq("join")}@test.fove`;
const cardToken = (path: string) => path.split("/card/")[1]!;

/** Un commerce avec un programme à points, et le jeton de son QR d'inscription. */
async function shop(programOverrides: object = {}) {
  const { client: owner, tenantId } = await ownerWithTenant(app);
  const program = await createPointsProgram(owner, programOverrides);
  const links = (await owner.get("/api/app/enrollment-links")).body as { token: string; programId: string }[];
  return { owner, tenantId, programId: program.id as string, token: links.find((l) => l.programId === program.id)!.token };
}

async function codeFor(email: string) {
  return /: (\d{6})/.exec((await lastEmail(email))!.text)![1]!;
}

/** Saisie du dernier code reçu par email, sur ce téléphone. */
async function confirm(c: Client, email: string) {
  const res = await c.post("/api/client/auth/verify", { email, code: await codeFor(email) });
  expect(res.status).toBe(200);
  return res;
}

/** Repousse les codes déjà envoyés pour passer le délai de renvoi d'une minute. */
async function ageCodes(email: string) {
  const codes = await db.clientLoginCode.findMany({ where: { email } });
  for (const c of codes) await db.clientLoginCode.update({ where: { id: c.id }, data: { createdAt: new Date(c.createdAt.getTime() - 61_000) } });
}

/** Client déjà connecté avec un compte confirmé, sans aucune carte. */
async function verifiedClient(email = newEmail()) {
  const c = agent(app);
  await c.post("/api/client/auth/code", { email });
  await confirm(c, email);
  return { c, email };
}

describe("parcours au scan : situations", () => {
  it("visiteur non connecté", async () => {
    const { token } = await shop();
    expect((await http().get(`/api/client/join/${token}`)).body).toEqual({ state: "anonymous" });
  });

  it("l'ancienne inscription sans compte n'existe plus", async () => {
    const { token } = await shop();
    const res = await http().post(`/api/public/join/${token}`).set("x-fove-csrf", "1").send({ firstName: "A", phone: randomPhone(), acceptTerms: true });
    expect(res.status).toBe(404);
  });

  it("« Créer ma carte » avec un email nouveau : compte non confirmé, carte active, puis ouverture directe", async () => {
    const { token, tenantId } = await shop();
    const email = newEmail();
    const res = await selfEnroll(app, token, { firstName: "Amina", lastName: "D", phone: randomPhone(), email, acceptTerms: true });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ state: "joined", status: "ACTIVE" });

    const account = await db.clientAccount.findUniqueOrThrow({ where: { email } });
    expect(account.emailVerifiedAt).toBeNull();
    expect(account.termsVersion).toBe("2026-11-24");
    expect(account.firstName).toBe("Amina");
    expect(account.phone).toMatch(/^\+243/);
    const fiche = await db.customer.findFirstOrThrow({ where: { tenantId, clientAccountId: account.id } });
    expect(fiche.email).toBe(email);

    // Email de bienvenue avec le code et le lien qui le saisit.
    const mail = await lastEmail(email);
    expect(mail!.text).toMatch(/mes-cartes\/connexion\?email=.+&code=\d{6}/);

    // Deuxième scan du même QR sur ce téléphone : la carte s'ouvre directement, sans confirmation.
    const again = await res.client.get(`/api/client/join/${token}`);
    expect(again.body).toEqual({ state: "has_card", cardPath: res.body.cardPath });
  });

  it("compte non confirmé chez un 2e commerce : confirmation exigée, puis inscription", async () => {
    const a = await shop();
    const b = await shop();
    const email = newEmail();
    const first = await selfEnroll(app, a.token, { firstName: "Amina", phone: randomPhone(), email, acceptTerms: true });
    const c = first.client;

    expect((await c.get(`/api/client/join/${b.token}`)).body).toEqual({ state: "needs_confirmation", email });
    const refused = await c.post(`/api/client/join/${b.token}`, { phone: randomPhone(), acceptTerms: true });
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe("confirmation_required");

    await confirm(c, email);
    const state = await c.get(`/api/client/join/${b.token}`);
    expect(state.body).toMatchObject({ state: "can_join", verified: true, profile: { firstName: "Amina", email } });
    expect(state.body.profile.phone).toMatch(/^\+243/);

    const joined = await c.post(`/api/client/join/${b.token}`, { phone: state.body.profile.phone, acceptTerms: true });
    expect(joined.status).toBe(200);
    expect(joined.body.status).toBe("ACTIVE");
    const card = await http().get(`/api/public/cards/${cardToken(joined.body.cardPath)}`);
    expect(card.body.customer.firstName).toBe("Amina");
  });

  it("compte confirmé : rejoint un commerce en un geste, téléphone pré-rempli", async () => {
    const { c, email } = await verifiedClient();
    await c.patch("/api/client/me", { firstName: "Yao", lastName: "", phone: "+243810001111" });
    const { token, tenantId } = await shop();
    const state = await c.get(`/api/client/join/${token}`);
    expect(state.body).toMatchObject({ state: "can_join", profile: { phone: "+243810001111", email } });
    expect((await c.post(`/api/client/join/${token}`, { phone: "+243810001111", acceptTerms: true })).body.state).toBe("joined");
    expect((await c.get(`/api/client/join/${token}`)).body.state).toBe("has_card");
    expect(await db.customer.count({ where: { tenantId } })).toBe(1);
  });

  it("refuse sans acceptation des conditions et filtre les robots", async () => {
    const { token } = await shop();
    expect((await selfEnroll(app, token, { firstName: "Sans", phone: randomPhone(), acceptTerms: false })).status).toBe(400);
    expect((await selfEnroll(app, token, { firstName: "Bot", phone: randomPhone(), acceptTerms: true, website: "spam" })).status).toBe(400);
  });
});

describe("parcours au scan : email déjà connu (option 1 du 24/11/2026)", () => {
  it("email d'un compte FOVE existant : code envoyé, rien n'est créé avant le code", async () => {
    const { email } = await verifiedClient();
    await ageCodes(email);
    const { token, tenantId } = await shop();
    const res = await selfEnroll(app, token, { firstName: "Autre", phone: randomPhone(), email, acceptTerms: true });
    expect(res.body).toEqual({ state: "code_sent", email });
    expect(await db.customer.count({ where: { tenantId } })).toBe(0);
    expect((await res.client.get("/api/client/me")).status).toBe(401);

    // Le titulaire saisit le code sur ce téléphone, puis sa carte est créée dans son compte.
    await confirm(res.client, email);
    const joined = await res.client.post(`/api/client/join/${token}`, { firstName: "Autre", phone: randomPhone(), acceptTerms: true });
    expect(joined.body.state).toBe("joined");
    const account = await db.clientAccount.findUniqueOrThrow({ where: { email } });
    expect(await db.customer.count({ where: { tenantId, clientAccountId: account.id } })).toBe(1);
  });

  it("fiche créée en caisse avec cet email : code, puis la fiche est reprise sans doublon", async () => {
    const { owner, token, tenantId, programId } = await shop();
    const email = newEmail();
    const created = await owner.post("/api/app/customers", { firstName: "Awa", phone: randomPhone(), email, programId });
    expect(created.status).toBe(201);

    const res = await selfEnroll(app, token, { firstName: "Awa", phone: randomPhone(), email, acceptTerms: true });
    expect(res.body.state).toBe("code_sent");
    await confirm(res.client, email);
    // La fiche a déjà une carte dans ce programme : elle s'ouvre.
    const state = await res.client.get(`/api/client/join/${token}`);
    expect(state.body.state).toBe("can_join");
    const joined = await res.client.post(`/api/client/join/${token}`, { phone: randomPhone(), acceptTerms: true });
    expect(joined.body).toMatchObject({ state: "joined", status: "ACTIVE" });
    expect(await db.customer.count({ where: { tenantId } })).toBe(1);
    expect((await db.customer.findUniqueOrThrow({ where: { id: created.body.customer.id }, select: { clientAccountId: true } })).clientAccountId).not.toBeNull();
    expect((await res.client.get(`/api/client/join/${token}`)).body.state).toBe("has_card");
  });

  it("compte non confirmé et fiche existante avec son email chez ce commerce : confirmation avant de la reprendre", async () => {
    const a = await shop();
    const b = await shop();
    const email = newEmail();
    await b.owner.post("/api/app/customers", { firstName: "Awa", phone: randomPhone(), email, programId: b.programId });
    const first = await selfEnroll(app, a.token, { firstName: "Awa", phone: randomPhone(), email, acceptTerms: true });
    expect((await first.client.get(`/api/client/join/${b.token}`)).body.state).toBe("needs_confirmation");
  });
});

describe("parcours au scan : téléphone facultatif, email obligatoire", () => {
  it("« Créer ma carte » sans téléphone : la fiche et le compte n'ont que l'email", async () => {
    const { token, tenantId } = await shop();
    const email = newEmail();
    const res = await selfEnroll(app, token, { firstName: "SansTel", email, acceptTerms: true });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ state: "joined", status: "ACTIVE" });
    const fiche = await db.customer.findFirstOrThrow({ where: { tenantId } });
    expect(fiche).toMatchObject({ email, phone: null, marketingSmsConsent: false });
    expect((await db.clientAccount.findUniqueOrThrow({ where: { email } })).phone).toBeNull();
  });

  it("après Google ou une connexion, rejoindre sans téléphone", async () => {
    const { token, tenantId } = await shop();
    const { c } = await verifiedClient();
    const joined = await c.post(`/api/client/join/${token}`, { firstName: "Yao", phone: "", acceptTerms: true });
    expect(joined.status).toBe(200);
    expect(joined.body.state).toBe("joined");
    expect((await db.customer.findFirstOrThrow({ where: { tenantId } })).phone).toBeNull();
  });

  it("l'email reste obligatoire, et un numéro saisi doit être valide", async () => {
    const { token } = await shop();
    expect((await agent(app).post(`/api/client/join/${token}/signup`, { firstName: "SansMail", acceptTerms: true })).status).toBe(400);
    expect((await selfEnroll(app, token, { firstName: "Court", phone: "123", acceptTerms: true })).status).toBe(400);
    const invalid = await selfEnroll(app, token, { firstName: "Faux", phone: "000000000000", acceptTerms: true });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe("invalid_phone");
  });
});

describe("parcours au scan : règles", () => {
  it("téléphone déjà connu chez ce commerce sous un autre email : nouvelle fiche, sans le téléphone", async () => {
    const { owner, token, tenantId, programId } = await shop();
    const phone = randomPhone();
    await owner.post("/api/app/customers", { firstName: "Ancien", phone, programId });
    const { c } = await verifiedClient();
    const joined = await c.post(`/api/client/join/${token}`, { firstName: "Nouveau", phone, acceptTerms: true });
    expect(joined.body.state).toBe("joined");
    const fiches = await db.customer.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" } });
    expect(fiches.map((f) => [f.firstName, f.phone])).toEqual([
      ["Ancien", phone],
      ["Nouveau", null],
    ]);
  });

  it("programme « code par email » : carte en attente, activée par la confirmation du compte", async () => {
    const { token } = await shop({ enrollmentVerification: "EMAIL_OTP" });
    const email = newEmail();
    const res = await selfEnroll(app, token, { firstName: "Otp", phone: randomPhone(), email, acceptTerms: true });
    expect(res.body.status).toBe("PENDING_VERIFICATION");
    const t = cardToken(res.body.cardPath);
    expect((await http().get(`/api/public/cards/${t}`)).body.verification).toBe("EMAIL_OTP");
    // Sans l'en-tête anti-CSRF (formulaire d'un autre site), le code est refusé.
    expect((await http().post(`/api/public/cards/${t}/verify`).send({ code: await codeFor(email) })).status).toBe(403);
    // Le code se saisit aussi depuis la page de la carte.
    expect((await http().post(`/api/public/cards/${t}/verify`).set("x-fove-csrf", "1").send({ code: await codeFor(email) })).body.status).toBe("ACTIVE");
    expect((await db.clientAccount.findUniqueOrThrow({ where: { email } })).emailVerifiedAt).not.toBeNull();
  });

  it("programme « code par email » et compte déjà confirmé : carte active tout de suite", async () => {
    const { token } = await shop({ enrollmentVerification: "EMAIL_OTP" });
    const { c } = await verifiedClient();
    const joined = await c.post(`/api/client/join/${token}`, { firstName: "Ok", phone: randomPhone(), acceptTerms: true });
    expect(joined.body.status).toBe("ACTIVE");
  });

  it("programme « en magasin » : la carte attend toujours l'employé", async () => {
    const { token } = await shop({ enrollmentVerification: "IN_STORE" });
    const { c } = await verifiedClient();
    const joined = await c.post(`/api/client/join/${token}`, { firstName: "Mag", phone: randomPhone(), acceptTerms: true });
    expect(joined.body.status).toBe("PENDING_VERIFICATION");
  });

  it("une fiche anonymisée par le commerçant est détachée du compte", async () => {
    const { owner, token, tenantId } = await shop();
    const { c } = await verifiedClient();
    await c.post(`/api/client/join/${token}`, { firstName: "Efface", phone: randomPhone(), acceptTerms: true });
    const fiche = await db.customer.findFirstOrThrow({ where: { tenantId } });
    expect((await owner.post(`/api/app/customers/${fiche.id}/anonymize`)).status).toBeLessThan(300);
    expect((await db.customer.findUniqueOrThrow({ where: { id: fiche.id }, select: { clientAccountId: true } })).clientAccountId).toBeNull();
    expect((await c.get(`/api/client/join/${token}`)).body.state).toBe("can_join");
  });

  it("le commerçant ne voit pas le compte FOVE de son client", async () => {
    const { owner, token, tenantId } = await shop();
    const { c } = await verifiedClient();
    await c.post(`/api/client/join/${token}`, { firstName: "Discret", phone: randomPhone(), acceptTerms: true });
    const fiche = await db.customer.findFirstOrThrow({ where: { tenantId } });
    const seen = await owner.get(`/api/app/customers/${fiche.id}`);
    expect(seen.status).toBe(200);
    expect(JSON.stringify(seen.body)).not.toContain("clientAccount");
  });
});
