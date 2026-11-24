import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { agent, createPointsProgram, db, earn, lastEmail, ownerWithTenant, randomPhone, resetDatabase, startApp, uniq } from "./helpers";
import { ClientAccountService } from "../src/client-account/client-account.service";

let app: NestExpressApplication;
let accounts: ClientAccountService;
beforeAll(async () => {
  await resetDatabase();
  app = await startApp({ CLIENT_ACCOUNT_INACTIVE_MONTHS: "36" });
  accounts = app.get(ClientAccountService);
});
afterAll(() => app.close());

const DAY = 86_400_000;
const newEmail = () => `${uniq("ret")}@test.fove`;
const monthsAgo = (n: number, from = new Date()) => {
  const d = new Date(from);
  d.setMonth(d.getMonth() - n);
  return d;
};

async function verifiedClient(email = newEmail()) {
  const c = agent(app);
  await c.post("/api/client/auth/code", { email });
  const code = /: (\d{6})/.exec((await lastEmail(email))!.text)![1];
  expect((await c.post("/api/client/auth/verify", { email, code })).status).toBe(200);
  return { c, email, id: (await db.clientAccount.findUniqueOrThrow({ where: { email } })).id };
}

async function shop() {
  const { client: owner, tenantId } = await ownerWithTenant(app);
  const program = await createPointsProgram(owner);
  const links = (await owner.get("/api/app/enrollment-links")).body as { token: string; programId: string }[];
  return { owner, tenantId, token: links.find((l) => l.programId === program.id)!.token };
}

/** Rend le compte (et ses cartes) inactifs depuis `months` mois. */
async function makeInactive(id: string, months: number) {
  const at = monthsAgo(months);
  await db.clientAccount.update({ where: { id }, data: { lastActiveAt: at } });
  await db.loyaltyAccount.updateMany({ where: { customer: { clientAccountId: id } }, data: { lastActivityAt: at } });
}

describe("compte client FOVE : « Télécharger mes données »", () => {
  it("exporte le compte, ses appareils, ses cartes, ses refus et son journal, sans les données des commerces", async () => {
    const s = await shop();
    const { c, email, id } = await verifiedClient();
    await c.patch("/api/client/me", { firstName: "Amina", lastName: "Diallo", phone: "+243810002222" });
    await c.post(`/api/client/join/${s.token}`, { phone: randomPhone(), acceptTerms: true });
    const card = await db.loyaltyAccount.findFirstOrThrow({ where: { tenantId: s.tenantId } });
    await earn(s.owner, card.id, "4000");

    const res = await c.get("/api/client/me/export");
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toMatch(/^attachment; filename="fove-mes-donnees-\d{4}-\d{2}-\d{2}\.json"$/);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body.account).toMatchObject({ email, firstName: "Amina", lastName: "Diallo", phone: "+243810002222", termsVersion: "2026-11-24" });
    expect(res.body.sessions.length).toBeGreaterThanOrEqual(1);
    expect(res.body.cards).toEqual([expect.objectContaining({ program: "Points", cardNumber: card.cardNumber, balance: 4, status: "ACTIVE" })]);
    expect(res.body.businesses).toHaveLength(1);
    expect(res.body.securityLog.map((l: { action: string }) => l.action)).toContain("client.signup");
    expect(res.body.notice).toMatch(/détenues par ce commerce/);
    // Ni l'historique des passages ni les notes du commerçant : ce sont ses données.
    expect(JSON.stringify(res.body)).not.toMatch(/transactions|notes|delta/);
    expect(await db.auditLog.count({ where: { action: "client.data_exported", targetId: id } })).toBe(1);
  });

  it("exige une session client", async () => {
    expect((await request(app.getHttpServer()).get("/api/client/me/export")).status).toBe(401);
  });
});

describe("compte client FOVE : suppression des comptes inactifs", () => {
  it("prévient une fois, 30 jours avant, puis supprime en détachant les cartes", async () => {
    const s = await shop();
    const { c, email, id } = await verifiedClient();
    await c.post(`/api/client/join/${s.token}`, { firstName: "Vieux", phone: randomPhone(), acceptTerms: true });
    await makeInactive(id, 36);

    const now = new Date();
    await accounts.purgeInactive(now);
    const warning = await lastEmail(email);
    expect(warning!.subject).toBe("Votre compte FOVE sera supprimé dans 30 jours");
    expect(warning!.text).toContain("/mes-cartes/connexion?email=");
    expect((await db.clientAccount.findUniqueOrThrow({ where: { id } })).inactivityWarnedAt).not.toBeNull();

    // Pas de 2e prévenance, pas de suppression avant 30 jours.
    await accounts.purgeInactive(new Date(now.getTime() + 10 * DAY));
    expect(await db.emailOutbox.count({ where: { to: email, subject: warning!.subject } })).toBe(1);
    expect(await db.clientAccount.findUnique({ where: { id } })).not.toBeNull();

    await accounts.purgeInactive(new Date(now.getTime() + 31 * DAY));
    expect(await db.clientAccount.findUnique({ where: { id } })).toBeNull();
    const fiche = await db.customer.findFirstOrThrow({ where: { tenantId: s.tenantId }, select: { clientAccountId: true } });
    expect(fiche.clientAccountId).toBeNull();
    expect(await db.loyaltyAccount.count({ where: { tenantId: s.tenantId, status: "ACTIVE" } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "client.account_deleted_inactive", targetId: id } })).toBe(1);
  });

  it("une connexion après la prévenance garde le compte", async () => {
    const { email, id } = await verifiedClient();
    await makeInactive(id, 36);
    const now = new Date();
    await accounts.purgeInactive(now);

    const c = agent(app);
    await db.clientLoginCode.updateMany({ where: { email }, data: { createdAt: new Date(Date.now() - 2 * 3_600_000) } });
    await c.post("/api/client/auth/code", { email });
    const code = /: (\d{6})/.exec((await lastEmail(email))!.text)![1];
    await c.post("/api/client/auth/verify", { email, code });
    expect((await db.clientAccount.findUniqueOrThrow({ where: { id } })).inactivityWarnedAt).toBeNull();

    await accounts.purgeInactive(new Date(now.getTime() + 31 * DAY));
    expect(await db.clientAccount.findUnique({ where: { id } })).not.toBeNull();
  });

  it("une carte utilisée en caisse compte comme une activité", async () => {
    const s = await shop();
    const { c, email, id } = await verifiedClient();
    await c.post(`/api/client/join/${s.token}`, { firstName: "Wallet", phone: randomPhone(), acceptTerms: true });
    await makeInactive(id, 40);
    // Le client n'ouvre jamais « Mes cartes », mais passe en caisse avec sa carte.
    const card = await db.loyaltyAccount.findFirstOrThrow({ where: { tenantId: s.tenantId } });
    await earn(s.owner, card.id, "1000");

    await accounts.purgeInactive(new Date());
    expect(await db.emailOutbox.count({ where: { to: email, subject: { contains: "supprimé" } } })).toBe(0);
    expect((await db.clientAccount.findUniqueOrThrow({ where: { id } })).inactivityWarnedAt).toBeNull();
  });

  it("ne touche pas un compte actif, et une vieille prévenance ne vaut pas pour une nouvelle période", async () => {
    const recent = await verifiedClient();
    const old = await verifiedClient();
    // Prévenu il y a 4 ans, puis redevenu actif ; inactif à nouveau depuis 36 mois.
    await makeInactive(old.id, 36);
    await db.clientAccount.update({ where: { id: old.id }, data: { inactivityWarnedAt: monthsAgo(48) } });

    const result = await accounts.purgeInactive(new Date());
    expect(result.deleted).toBe(0);
    expect(await db.clientAccount.findUnique({ where: { id: old.id } })).not.toBeNull();
    expect((await lastEmail(old.email))!.subject).toBe("Votre compte FOVE sera supprimé dans 30 jours");
    expect((await db.clientAccount.findUniqueOrThrow({ where: { id: recent.id } })).inactivityWarnedAt).toBeNull();
  });

  it("prévient dans la langue du compte", async () => {
    const email = newEmail();
    const account = await db.clientAccount.create({ data: { email, emailVerifiedAt: new Date(), locale: "es", lastActiveAt: monthsAgo(37) } });
    await accounts.purgeInactive(new Date());
    expect((await lastEmail(email))!.subject).toBe("Tu cuenta FOVE se eliminará dentro de 30 días");
    await db.clientAccount.delete({ where: { id: account.id } });
  });
});
