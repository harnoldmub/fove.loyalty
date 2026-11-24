import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { agent, createPointsProgram, db, earn, lastEmail, ownerWithTenant, randomPhone, resetDatabase, selfEnroll, startApp, uniq, type Client } from "./helpers";

let app: NestExpressApplication;
beforeAll(async () => {
  await resetDatabase();
  app = await startApp();
});
afterAll(() => app.close());

const http = () => request(app.getHttpServer());
const newEmail = () => `${uniq("cards")}@test.fove`;

async function shop() {
  const { client: owner, tenantId } = await ownerWithTenant(app);
  const program = await createPointsProgram(owner);
  await db.tenantSettings.update({ where: { tenantId }, data: { primaryColor: "#AA3300" } });
  const links = (await owner.get("/api/app/enrollment-links")).body as { token: string; programId: string }[];
  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  return { owner, tenantId, name: tenant.name, programId: program.id as string, token: links.find((l) => l.programId === program.id)!.token };
}

/** Client connecté avec un compte confirmé (code email). */
async function verifiedClient(email = newEmail()) {
  const c = agent(app);
  await c.post("/api/client/auth/code", { email });
  const code = /: (\d{6})/.exec((await lastEmail(email))!.text)![1];
  expect((await c.post("/api/client/auth/verify", { email, code })).status).toBe(200);
  return { c, email };
}

/** Fiche créée en caisse par le commerçant, avec une carte. */
async function tillCustomer(s: Awaited<ReturnType<typeof shop>>, data: { email?: string; phone?: string; firstName?: string }) {
  const res = await s.owner.post("/api/app/customers", { firstName: data.firstName ?? "Awa", phone: data.phone ?? randomPhone(), email: data.email, programId: s.programId });
  expect(res.status).toBe(201);
  return res.body.customer.id as string;
}

const cardsOf = async (c: Client) => (await c.get("/api/client/me/cards")).body as {
  cards: { tenant: { name: string; primaryColor: string }; program: { name: string }; balance: number; status: string; cardPath: string }[];
  linkable: { customerId: string; firstName: string; tenant: { name: string }; cards: { balance: number }[] }[];
};

describe("« Mes cartes »", () => {
  it("est réservé aux comptes confirmés", async () => {
    const { token } = await shop();
    const enrolled = await selfEnroll(app, token, { firstName: "Pas", phone: randomPhone(), acceptTerms: true });
    const res = await enrolled.client.get("/api/client/me/cards");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("confirmation_required");
    expect((await http().get("/api/client/me/cards")).status).toBe(401);
  });

  it("liste les cartes du compte aux couleurs de chaque commerce, la plus récemment utilisée en premier", async () => {
    const a = await shop();
    const b = await shop();
    const { c } = await verifiedClient();
    await c.post(`/api/client/join/${a.token}`, { firstName: "Yao", phone: randomPhone(), acceptTerms: true });
    await c.post(`/api/client/join/${b.token}`, { phone: randomPhone(), acceptTerms: true });

    // Passage en caisse chez A : sa carte remonte en tête.
    const accountA = await db.loyaltyAccount.findFirstOrThrow({ where: { tenantId: a.tenantId } });
    await earn(a.owner, accountA.id, "3000");

    const { cards, linkable } = await cardsOf(c);
    expect(linkable).toEqual([]);
    expect(cards.map((x) => x.tenant.name)).toEqual([a.name, b.name]);
    expect(cards[0]).toMatchObject({ tenant: { primaryColor: "#AA3300" }, program: { name: "Points" }, balance: 3, status: "ACTIVE" });
    // Le lien ouvre la carte habituelle, sans connexion.
    const card = await http().get(`/api/public/cards/${cards[0]!.cardPath.split("/card/")[1]}`);
    expect(card.body.card.balance).toBe(3);
  });

  it("propose la fiche créée en caisse avec son email, puis la rattache", async () => {
    const s = await shop();
    const { c, email } = await verifiedClient();
    const customerId = await tillCustomer(s, { email, firstName: "Awa" });
    const accountId = (await db.loyaltyAccount.findFirstOrThrow({ where: { customerId } })).id;
    await earn(s.owner, accountId, "5000");

    const before = await cardsOf(c);
    expect(before.cards).toEqual([]);
    expect(before.linkable).toEqual([{ customerId, firstName: "Awa", tenant: expect.objectContaining({ name: s.name }), cards: [expect.objectContaining({ balance: 5 })] }]);

    expect((await c.post(`/api/client/me/linkable/${customerId}`)).status).toBe(204);
    const after = await cardsOf(c);
    expect(after.linkable).toEqual([]);
    expect(after.cards).toHaveLength(1);
    expect(after.cards[0]!.balance).toBe(5);
    expect((await db.customerIdentity.findFirstOrThrow({ where: { customerId, kind: "EMAIL" } })).verifiedAt).not.toBeNull();
    // Le scan du QR de ce commerce ouvre maintenant directement la carte.
    expect((await c.get(`/api/client/join/${s.token}`)).body.state).toBe("has_card");
  });

  it("« Ce n'est pas moi » : la fiche n'est plus proposée ni rattachable", async () => {
    const s = await shop();
    const { c, email } = await verifiedClient();
    const customerId = await tillCustomer(s, { email });
    expect((await c.delete(`/api/client/me/linkable/${customerId}`)).status).toBe(204);
    expect((await cardsOf(c)).linkable).toEqual([]);
    expect((await c.post(`/api/client/me/linkable/${customerId}`)).status).toBe(404);
    expect((await db.customer.findUniqueOrThrow({ where: { id: customerId }, select: { clientAccountId: true } })).clientAccountId).toBeNull();
  });

  it("ne propose jamais une fiche sur le seul téléphone, ni celle d'un autre email, ni une fiche anonymisée", async () => {
    const s = await shop();
    const { c, email } = await verifiedClient();
    const phone = randomPhone();
    await c.patch("/api/client/me", { firstName: "Yao", lastName: "", phone });
    const samePhone = await tillCustomer(s, { phone });
    const otherEmail = await tillCustomer(s, { email: newEmail() });
    const other = await shop();
    const anonymized = await tillCustomer(other, { email });
    await other.owner.post(`/api/app/customers/${anonymized}/anonymize`);

    expect((await cardsOf(c)).linkable).toEqual([]);
    for (const id of [samePhone, otherEmail, anonymized]) expect((await c.post(`/api/client/me/linkable/${id}`)).status).toBe(404);
  });

  it("ne propose pas de 2e fiche chez un commerce où le compte a déjà la sienne", async () => {
    const s = await shop();
    const { c, email } = await verifiedClient();
    await c.post(`/api/client/join/${s.token}`, { firstName: "Yao", phone: randomPhone(), acceptTerms: true });
    // Cas limite : une 2e fiche porte l'email du compte (identité retirée puis recréée par le commerçant).
    const dup = await db.customer.create({ data: { tenantId: s.tenantId, firstName: "Double", email } });
    await db.customerIdentity.deleteMany({ where: { tenantId: s.tenantId, kind: "EMAIL", value: email } });
    await db.customerIdentity.create({ data: { tenantId: s.tenantId, customerId: dup.id, kind: "EMAIL", value: email } });
    expect((await cardsOf(c)).linkable).toEqual([]);
    expect((await c.post(`/api/client/me/linkable/${dup.id}`)).status).toBe(404);
  });

  it("ne propose pas une fiche sans carte (elle sera reprise au scan du QR)", async () => {
    const s = await shop();
    const { c, email } = await verifiedClient();
    const res = await s.owner.post("/api/app/customers", { firstName: "SansCarte", phone: randomPhone(), email });
    expect(res.status).toBe(201);
    expect((await cardsOf(c)).linkable).toEqual([]);
    // Au scan, la fiche est reprise et la carte créée dessus, sans doublon.
    expect((await c.post(`/api/client/join/${s.token}`, { phone: randomPhone(), acceptTerms: true })).body.state).toBe("joined");
    expect(await db.customer.count({ where: { tenantId: s.tenantId } })).toBe(1);
    expect((await cardsOf(c)).cards).toHaveLength(1);
  });

  it("une carte clôturée disparaît de la liste", async () => {
    const s = await shop();
    const { c } = await verifiedClient();
    await c.post(`/api/client/join/${s.token}`, { firstName: "Yao", phone: randomPhone(), acceptTerms: true });
    await db.loyaltyAccount.updateMany({ where: { tenantId: s.tenantId }, data: { status: "CLOSED" } });
    expect((await cardsOf(c)).cards).toEqual([]);
  });
});
