import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { agent, db, lastEmail, ownerWithTenant, resetDatabase, startApp, uniq, type Client } from "./helpers";

let app: NestExpressApplication;
beforeAll(async () => {
  await resetDatabase();
  app = await startApp();
});
afterAll(() => app.close());

const newEmail = () => `${uniq("client")}@test.fove`;

async function codeFor(email: string) {
  const mail = await lastEmail(email);
  return /: (\d{6})/.exec(mail!.text)![1]!;
}

/** Connexion complète par code : demande, lecture de l'email, saisie. */
async function login(c: Client, email: string) {
  expect((await c.post("/api/client/auth/code", { email })).status).toBe(204);
  return c.post("/api/client/auth/verify", { email, code: await codeFor(email) });
}

/** Simule une demande ancienne pour passer le délai de renvoi d'une minute. */
async function ageCodes(email: string, ms = 61_000) {
  const codes = await db.clientLoginCode.findMany({ where: { email } });
  for (const c of codes) await db.clientLoginCode.update({ where: { id: c.id }, data: { createdAt: new Date(c.createdAt.getTime() - ms) } });
}

describe("compte client FOVE : connexion par code email", () => {
  it("crée un compte confirmé au premier code et ouvre une session client", async () => {
    const c = agent(app);
    const email = newEmail();
    const res = await login(c, email);
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(true);
    expect(res.body.account.emailVerifiedAt).not.toBeNull();

    const me = await c.get("/api/client/me");
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(email);

    // Session distincte de l'espace commerçant.
    expect((await c.get("/api/auth/me")).status).toBe(401);
  });

  it("répond pareil que l'email ait un compte ou non", async () => {
    const known = newEmail();
    await db.clientAccount.create({ data: { email: known, emailVerifiedAt: new Date() } });
    const a = await agent(app).post("/api/client/auth/code", { email: known });
    const b = await agent(app).post("/api/client/auth/code", { email: newEmail() });
    expect([a.status, b.status]).toEqual([204, 204]);
    expect(a.body).toEqual(b.body);
  });

  it("reconnecte un compte existant sans en créer un autre", async () => {
    const email = newEmail();
    await login(agent(app), email);
    await ageCodes(email);
    const res = await login(agent(app), email);
    expect(res.body.created).toBe(false);
    expect(await db.clientAccount.count({ where: { email } })).toBe(1);
  });

  it("refuse un mauvais code, puis bloque après 5 essais", async () => {
    const c = agent(app);
    const email = newEmail();
    await c.post("/api/client/auth/code", { email });
    const good = await codeFor(email);
    const wrong = good === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) {
      const res = await c.post("/api/client/auth/verify", { email, code: wrong });
      expect(res.body.error.code).toBe("invalid_code");
    }
    const blocked = await c.post("/api/client/auth/verify", { email, code: good });
    expect(blocked.body.error.code).toBe("code_expired");
    expect(await db.clientAccount.findUnique({ where: { email } })).toBeNull();
  });

  it("n'accepte un code qu'une fois, et pas après 10 minutes", async () => {
    const email = newEmail();
    await agent(app).post("/api/client/auth/code", { email });
    const code = await codeFor(email);
    expect((await agent(app).post("/api/client/auth/verify", { email, code })).status).toBe(200);
    expect((await agent(app).post("/api/client/auth/verify", { email, code })).body.error.code).toBe("code_expired");

    const late = newEmail();
    await agent(app).post("/api/client/auth/code", { email: late });
    await db.clientLoginCode.updateMany({ where: { email: late }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await agent(app).post("/api/client/auth/verify", { email: late, code: await codeFor(late) })).body.error.code).toBe("code_expired");
  });

  it("impose 1 minute entre deux codes et 5 codes par heure", async () => {
    const email = newEmail();
    const c = agent(app);
    expect((await c.post("/api/client/auth/code", { email })).status).toBe(204);
    expect((await c.post("/api/client/auth/code", { email })).body.error.code).toBe("too_soon");
    for (let i = 0; i < 4; i++) {
      await ageCodes(email);
      expect((await c.post("/api/client/auth/code", { email })).status).toBe(204);
    }
    await ageCodes(email);
    const res = await c.post("/api/client/auth/code", { email });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("too_many_codes");
  });

  it("limite à 60 codes par heure depuis une même adresse IP", async () => {
    const first = newEmail();
    await agent(app).post("/api/client/auth/code", { email: first });
    const ip = (await db.clientLoginCode.findFirst({ where: { email: first } }))!.ip!;
    const filler = Array.from({ length: 60 }, (_, i) => ({ email: `filler-${i}-${first}`, codeHash: "x", ip, expiresAt: new Date(Date.now() + 600_000) }));
    await db.clientLoginCode.createMany({ data: filler });
    try {
      const res = await agent(app).post("/api/client/auth/code", { email: newEmail() });
      expect(res.status).toBe(429);
    } finally {
      await db.clientLoginCode.deleteMany({ where: { ip } });
    }
  });

  it("envoie le code dans la langue du visiteur", async () => {
    const email = newEmail();
    await request(app.getHttpServer()).post("/api/client/auth/code").set("x-fove-csrf", "1").set("accept-language", "es-ES,es;q=0.9").send({ email });
    expect((await lastEmail(email))!.subject).toBe("Tu código de acceso a FOVE");
  });

  it("exige l'en-tête anti-CSRF", async () => {
    const res = await request(app.getHttpServer()).post("/api/client/auth/code").send({ email: newEmail() });
    expect(res.status).toBe(403);
  });

  it("ferme les sessions d'un compte non confirmé quand le titulaire de l'email prouve sa propriété", async () => {
    const email = newEmail();
    const account = await db.clientAccount.create({ data: { email } });
    const token = uniq("tok");
    await db.clientSession.create({
      data: { clientAccountId: account.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 86_400_000) },
    });
    const intrus = () => request(app.getHttpServer()).get("/api/client/me").set("Cookie", `fove_client=${token}`);
    expect((await intrus()).status).toBe(200);

    const res = await login(agent(app), email);
    expect(res.body.created).toBe(false);
    expect(res.body.account.emailVerifiedAt).not.toBeNull();
    expect((await intrus()).status).toBe(401);
  });
});

describe("compte client FOVE : profil, déconnexion, suppression", () => {
  it("met à jour le profil", async () => {
    const c = agent(app);
    await login(c, newEmail());
    expect((await c.patch("/api/client/me", { firstName: "", lastName: "X" })).status).toBe(400);
    const res = await c.patch("/api/client/me", { firstName: "Amina", lastName: "Diallo", phone: "+243810000000" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ firstName: "Amina", lastName: "Diallo", phone: "+243810000000" });
  });

  it("déconnecte uniquement cet appareil", async () => {
    const email = newEmail();
    const phone = agent(app);
    const tablet = agent(app);
    await login(phone, email);
    await ageCodes(email);
    await login(tablet, email);
    expect((await phone.post("/api/client/auth/logout")).status).toBe(204);
    expect((await phone.get("/api/client/me")).status).toBe(401);
    expect((await tablet.get("/api/client/me")).status).toBe(200);
  });

  it("supprime le compte et détache les fiches, qui restent chez le commerçant", async () => {
    const { tenantId } = await ownerWithTenant(app);
    const c = agent(app);
    const email = newEmail();
    const accountId = (await login(c, email)).body.account.id as string;
    const customer = await db.customer.create({ data: { tenantId, firstName: "Amina", email, clientAccountId: accountId } });

    expect((await c.delete("/api/client/me")).status).toBe(204);
    expect((await c.get("/api/client/me")).status).toBe(401);
    expect(await db.clientAccount.findUnique({ where: { id: accountId } })).toBeNull();
    expect(await db.clientLoginCode.count({ where: { email } })).toBe(0);
    const kept = await db.customer.findUnique({ where: { id: customer.id }, select: { clientAccountId: true } });
    expect(kept).not.toBeNull();
    expect(kept!.clientAccountId).toBeNull();

    const log = await db.auditLog.findFirst({ where: { action: "client.account_deleted", targetId: accountId } });
    expect(log).not.toBeNull();
    expect(JSON.stringify(log)).not.toContain(email);
  });

  it("refuse l'accès sans session client, même avec une session commerçant", async () => {
    const { client } = await ownerWithTenant(app);
    expect((await client.get("/api/client/me")).status).toBe(401);
  });
});
