import { beforeAll, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { createCustomerWithCard, createPointsProgram, db, earn, ownerWithTenant, resetDatabase, startApp, uniq } from "./helpers";

describe("récompenses gérées par le commerce", () => {
  let app: NestExpressApplication;
  beforeAll(async () => { await resetDatabase(); app = await startApp(); });
  afterAll(async () => { await app.close(); });

  it("répercute une modification et conserve la remise historique", async () => {
    const { client } = await ownerWithTenant(app);
    const program = await createPointsProgram(client, { currency: "USD", spendStep: "1" });
    const card = await createCustomerWithCard(client, program.id);
    await earn(client, card.accountId, "100");
    const reward = await client.post("/api/app/rewards", { programId: program.id, name: "Remise fidélité", cost: 10, kind: "PERCENTAGE", value: "10" });
    expect(reward.status).toBe(201);
    const key = uniq("discount-");
    const res = await client.post("/api/app/redemptions", { accountId: card.accountId, rewardId: reward.body.id, purchaseAmount: "25", idempotencyKey: key });
    expect(res.status).toBe(201);
    expect(Number(res.body.redemption.discountAmount)).toBe(2.5);
    expect(res.body.redemption.currency).toBe("USD");
    expect((await client.patch(`/api/app/rewards/${reward.body.id}`, { value: "20" })).status).toBe(200);
    const current = await client.get(`/api/app/accounts/${card.accountId}`);
    expect(Number(current.body.rewards[0].value)).toBe(20);
    const publicCard = await request(app.getHttpServer()).get(`/api/public/cards/${card.cardUrl.split('/card/')[1]}`);
    expect(Number(publicCard.body.rewards[0].value)).toBe(20);
    const replay = await client.post("/api/app/redemptions", { accountId: card.accountId, rewardId: reward.body.id, purchaseAmount: "25", idempotencyKey: key });
    expect(replay.body.replayed).toBe(true);
    expect(Number(replay.body.redemption.discountAmount)).toBe(2.5);
    expect((await db.loyaltyAccount.findUniqueOrThrow({ where: { id: card.accountId } })).balance).toBe(90);
    expect((await client.patch(`/api/app/rewards/${reward.body.id}`, { value: "101" })).status).toBe(422);
    const other = await ownerWithTenant(app);
    expect((await other.client.patch(`/api/app/rewards/${reward.body.id}`, { value: "50" })).status).toBe(404);
  });

  it("exige un achat pour la remise fixe et ne débite pas en cas d’erreur", async () => {
    const { client } = await ownerWithTenant(app);
    const program = await createPointsProgram(client, { spendStep: "1" });
    const card = await createCustomerWithCard(client, program.id);
    await earn(client, card.accountId, "100");
    const reward = (await client.post("/api/app/rewards", { programId: program.id, name: "Bon fidélité", cost: 10, kind: "FIXED", value: "20", stock: 2 })).body;
    expect((await client.post("/api/app/redemptions", { accountId: card.accountId, rewardId: reward.id, idempotencyKey: uniq("missing-") })).status).toBe(422);
    expect((await db.loyaltyAccount.findUniqueOrThrow({ where: { id: card.accountId } })).balance).toBe(100);
    const res = await client.post("/api/app/redemptions", { accountId: card.accountId, rewardId: reward.id, purchaseAmount: "12.50", idempotencyKey: uniq("fixed-") });
    expect(Number(res.body.redemption.discountAmount)).toBe(12.5);
  });

  it("répercute les paramètres sur la carte publique sans modifier une autre entreprise", async () => {
    const { client } = await ownerWithTenant(app);
    const program = await createPointsProgram(client);
    const card = await createCustomerWithCard(client, program.id);
    expect((await client.patch("/api/app/tenant", { name: "Commerce personnalisé", primaryColor: "#112233" })).status).toBe(200);
    const publicCard = await request(app.getHttpServer()).get(`/api/public/cards/${card.cardUrl.split('/card/')[1]}`);
    expect(publicCard.body.tenant.name).toBe("Commerce personnalisé");
    expect(publicCard.body.tenant.primaryColor).toBe("#112233");
  });
});
