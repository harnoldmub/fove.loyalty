import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { createCustomerWithCard, createPointsProgram, db, earn, ownerWithTenant, resetDatabase, startApp, uniq } from "./helpers";
import { CustomerReferralService } from "../src/customer-referrals/customer-referral.service";

/** Parrainage entre clients d'un commerce (docs/chantier-parrainage-clients.md). */
let app: NestExpressApplication;
const http = () => request(app.getHttpServer());

beforeAll(async () => {
  await resetDatabase();
  app = await startApp({ STRIPE_SECRET_KEY: undefined });
});
afterAll(async () => {
  await app.close();
});

const SETTINGS = { enabled: true, referrerStamps: 2, referrerPoints: 50, refereeStamps: 1, refereePoints: 0, monthlyCap: 5 };

async function stampShop(settings: object = {}) {
  const owner = await ownerWithTenant(app);
  const program = await createPointsProgram(owner.client, { name: "Café", mode: "STAMPS", stampsTarget: 10, stampsPerPurchase: 1 });
  const links = (await owner.client.get("/api/app/enrollment-links")).body as { token: string; programId: string }[];
  const token = links.find((l) => l.programId === program.id)!.token;
  expect((await owner.client.put("/api/app/customer-referrals/settings", { ...SETTINGS, ...settings })).status).toBe(200);
  return { ...owner, programId: program.id, token };
}

/** Lien de parrainage d'une carte (comme le bouton « Parrainer un ami »). */
async function referralCode(cardUrl: string) {
  const token = cardUrl.split("/card/")[1]!;
  const res = await http().post(`/api/public/cards/${token}/referral-link`);
  expect(res.status).toBe(200);
  return new URL(res.body.url).searchParams.get("parrain")!;
}

/** Un ami s'inscrit avec le lien (nouveau compte FOVE). */
async function friendSignup(token: string, code: string, firstName = "Karim", extra: object = {}) {
  const res = await http().post(`/api/client/join/${token}/signup`).set("x-fove-csrf", "1").send({ firstName, email: `${uniq("ami")}@test.fove`, acceptTerms: true, referralCode: code, ...extra });
  expect(res.status).toBe(200);
  return db.customer.findFirstOrThrow({ where: { firstName }, orderBy: { createdAt: "desc" }, include: { accounts: true } });
}

describe("parrainage entre clients", () => {
  it("bienvenue du filleul à l'inscription, récompense du parrain à son premier passage, notification sur la carte", async () => {
    const { client, tenantId, programId, token } = await stampShop();
    const parrain = await createCustomerWithCard(client, programId);
    const code = await referralCode(parrain.cardUrl);
    const friend = await friendSignup(token, code);
    const friendAccount = friend.accounts[0]!;
    expect(friendAccount.balance).toBe(1);
    const referral = await db.customerReferral.findFirstOrThrow({ where: { tenantId, refereeCustomerId: friend.id } });
    expect(referral.status).toBe("SIGNED_UP");
    expect((await db.loyaltyAccount.findUniqueOrThrow({ where: { id: parrain.accountId } })).balance).toBe(0);

    expect((await earn(client, friendAccount.id, null)).status).toBe(201);
    const parrainCard = await db.loyaltyAccount.findUniqueOrThrow({ where: { id: parrain.accountId } });
    expect(parrainCard.balance).toBe(2);
    expect(parrainCard.lastWalletMessageTitle).toBe("Karim est venu grâce à vous !");
    expect((await db.customerReferral.findUniqueOrThrow({ where: { id: referral.id } })).status).toBe("REWARDED");
    const tx = await db.loyaltyTransaction.findFirstOrThrow({ where: { accountId: parrain.accountId, kind: "ADJUSTMENT" } });
    expect(tx.reason).toBe("Parrainage : Karim");

    const overview = (await client.get("/api/app/customer-referrals")).body;
    expect(overview.stats).toMatchObject({ signedUp: 1, came: 1, rewarded: 1 });
    expect(overview.stats.top[0].rewarded).toBe(1);
  });

  it("plafond mensuel : au-delà, parrainage noté sans récompense", async () => {
    const { client, programId, token } = await stampShop({ monthlyCap: 1 });
    const parrain = await createCustomerWithCard(client, programId);
    const code = await referralCode(parrain.cardUrl);
    const a = await friendSignup(token, code, "Amina");
    const b = await friendSignup(token, code, "Bilal");
    await earn(client, a.accounts[0]!.id, null);
    await earn(client, b.accounts[0]!.id, null);
    expect((await db.loyaltyAccount.findUniqueOrThrow({ where: { id: parrain.accountId } })).balance).toBe(2);
    expect((await db.customerReferral.findFirstOrThrow({ where: { refereeCustomerId: b.id } })).status).toBe("CAPPED");
  });

  it("désactivé ou offre Gratuite : pas de lien, pas de parrainage", async () => {
    const off = await stampShop({ enabled: false });
    const parrain = await createCustomerWithCard(off.client, off.programId);
    expect((await http().post(`/api/public/cards/${parrain.cardUrl.split("/card/")[1]}/referral-link`)).status).toBe(404);
    expect((await http().get(`/api/public/cards/${parrain.cardUrl.split("/card/")[1]}`)).body.referral).toBeNull();

    const free = await ownerWithTenant(app, { plan: "free" });
    expect((await free.client.put("/api/app/customer-referrals/settings", SETTINGS)).status).toBe(402);
  });

  it("le premier passage ne récompense qu'une fois, et un client existant n'est jamais un filleul", async () => {
    const { client, tenantId, programId, token } = await stampShop();
    const parrain = await createCustomerWithCard(client, programId);
    const code = await referralCode(parrain.cardUrl);
    const friend = await friendSignup(token, code, "Chloé");
    await earn(client, friend.accounts[0]!.id, null);
    await app.get(CustomerReferralService).onVisit(tenantId, friend.id);
    expect((await db.loyaltyAccount.findUniqueOrThrow({ where: { id: parrain.accountId } })).balance).toBe(2);
    expect(await db.customerReferral.count({ where: { tenantId } })).toBe(1);

    // Client déjà connu du commerce (même téléphone) : sa carte est retrouvée, pas de parrainage.
    const known = await createCustomerWithCard(client, programId);
    await http().post(`/api/client/join/${token}/signup`).set("x-fove-csrf", "1").send({ firstName: "Awa", email: `${uniq("connu")}@test.fove`, phone: known.phone, acceptTerms: true, referralCode: code });
    expect(await db.customerReferral.count({ where: { tenantId, refereeCustomerId: known.customerId } })).toBe(0);
    expect(await db.customerReferral.count({ where: { tenantId } })).toBe(1);
  });
});
