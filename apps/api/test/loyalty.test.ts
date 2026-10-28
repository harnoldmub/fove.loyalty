import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { createCustomerWithCard, createPointsProgram, db, earn, ownerWithTenant, resetDatabase, startApp, uniq, type Client } from "./helpers";

let app: NestExpressApplication;
let owner: Client;
let programId: string;

beforeAll(async () => {
  await resetDatabase();
  app = await startApp();
  owner = (await ownerWithTenant(app)).client;
  programId = (await createPointsProgram(owner, { maxPerTransaction: 500 })).id;
});
afterAll(() => app.close());

async function assertLedgerConsistent(accountId: string) {
  const account = await db.loyaltyAccount.findUniqueOrThrow({ where: { id: accountId } });
  const sum = await db.loyaltyTransaction.aggregate({ where: { accountId }, _sum: { delta: true } });
  const last = await db.loyaltyTransaction.findFirst({ where: { accountId }, orderBy: [{ createdAt: "desc" }] });
  expect(account.balance).toBe(sum._sum.delta ?? 0);
  if (last) expect(last.balanceAfter).toBe(account.balance);
  return account.balance;
}

async function reward(cost: number, stock: number | null = null) {
  const res = await owner.post("/api/app/rewards", { programId, name: `Récompense ${cost}`, cost, stock });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

describe("moteur de points", () => {
  it("calcule les points côté serveur (1 000 CDF = 1 point, plafond)", async () => {
    const { accountId } = await createCustomerWithCard(owner, programId);
    const preview = await owner.post("/api/app/scanner/preview", { accountId, amount: "15999" });
    expect(preview.body.delta).toBe(15);
    const res = await earn(owner, accountId, "15999");
    expect(res.status).toBe(201);
    expect(res.body.transaction.delta).toBe(15);
    expect((await earn(owner, accountId, "9000000")).body.transaction.delta).toBe(500);
    expect(await assertLedgerConsistent(accountId)).toBe(515);
  });

  it("une même clé d'idempotence ne crédite qu'une fois, même en parallèle", async () => {
    const { accountId } = await createCustomerWithCard(owner, programId);
    const key = uniq("dup-");
    const results = await Promise.all(Array.from({ length: 8 }, () => earn(owner, accountId, "10000", key)));
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(new Set(results.map((r) => r.body.transaction.id)).size).toBe(1);
    expect(await assertLedgerConsistent(accountId)).toBe(10);
  });

  it("refuse une clé réutilisée pour une autre carte", async () => {
    const a = await createCustomerWithCard(owner, programId);
    const b = await createCustomerWithCard(owner, programId);
    const key = uniq("cross-");
    await earn(owner, a.accountId, "1000", key);
    expect((await earn(owner, b.accountId, "1000", key)).status).toBe(409);
  });

  it("des crédits concurrents s'additionnent sans perte", async () => {
    const { accountId } = await createCustomerWithCard(owner, programId);
    await Promise.all(Array.from({ length: 20 }, () => earn(owner, accountId, "2000")));
    expect(await assertLedgerConsistent(accountId)).toBe(40);
  });

  it("des utilisations concurrentes ne dépassent jamais le solde", async () => {
    const { accountId } = await createCustomerWithCard(owner, programId);
    await earn(owner, accountId, "100000");
    const rewardId = await reward(30);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => owner.post("/api/app/redemptions", { accountId, rewardId, idempotencyKey: uniq("r-") })),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    expect(results.filter((r) => r.status === 422).every((r) => r.body.error.code === "insufficient_balance")).toBe(true);
    expect(await assertLedgerConsistent(accountId)).toBe(10);
  });

  it("le stock d'une récompense ne passe jamais sous zéro", async () => {
    const accounts = await Promise.all(Array.from({ length: 6 }, () => createCustomerWithCard(owner, programId)));
    for (const a of accounts) await earn(owner, a.accountId, "50000");
    const rewardId = await reward(10, 2);
    const results = await Promise.all(accounts.map((a) => owner.post("/api/app/redemptions", { accountId: a.accountId, rewardId, idempotencyKey: uniq("s-") })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    expect((await db.reward.findUniqueOrThrow({ where: { id: rewardId } })).stock).toBe(0);
  });

  it("une utilisation rejouée ne débite pas deux fois et s'annule une seule fois", async () => {
    const { accountId } = await createCustomerWithCard(owner, programId);
    await earn(owner, accountId, "50000");
    const rewardId = await reward(20, 5);
    const key = uniq("once-");
    const first = await owner.post("/api/app/redemptions", { accountId, rewardId, idempotencyKey: key });
    const second = await owner.post("/api/app/redemptions", { accountId, rewardId, idempotencyKey: key });
    expect(second.body.redemption.id).toBe(first.body.redemption.id);
    expect(second.body.replayed).toBe(true);
    expect(await assertLedgerConsistent(accountId)).toBe(30);

    const cancels = await Promise.all([1, 2, 3].map(() => owner.post(`/api/app/redemptions/${first.body.redemption.id}/cancel`, { reason: "Erreur de caisse" })));
    expect(cancels.filter((c) => c.status === 201)).toHaveLength(1);
    expect(await assertLedgerConsistent(accountId)).toBe(50);
    expect((await db.reward.findUniqueOrThrow({ where: { id: rewardId } })).stock).toBe(5);
  });

  it("annule un gain par écriture compensatoire, une seule fois", async () => {
    const { accountId } = await createCustomerWithCard(owner, programId);
    const tx = (await earn(owner, accountId, "8000")).body.transaction;
    const results = await Promise.all([1, 2, 3].map((i) => owner.post(`/api/app/transactions/${tx.id}/reverse`, { reason: "Vente annulée", idempotencyKey: uniq(`rv${i}-`) })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(2);
    expect(await assertLedgerConsistent(accountId)).toBe(0);
    const original = await db.loyaltyTransaction.findUniqueOrThrow({ where: { id: tx.id } });
    expect(original.delta).toBe(8);
  });

  it("refuse un débit manuel supérieur au solde mais accepte un ajustement positif", async () => {
    const { accountId } = await createCustomerWithCard(owner, programId);
    expect((await owner.post("/api/app/transactions/adjust", { accountId, delta: -5, reason: "Test débit", idempotencyKey: uniq("a-") })).status).toBe(422);
    expect((await owner.post("/api/app/transactions/adjust", { accountId, delta: 12, reason: "Geste commercial", idempotencyKey: uniq("a-") })).status).toBe(201);
    expect(await assertLedgerConsistent(accountId)).toBe(12);
  });

  it("une carte bloquée ne gagne plus de points", async () => {
    const { accountId } = await createCustomerWithCard(owner, programId);
    await owner.post(`/api/app/accounts/${accountId}/status`, { status: "BLOCKED" });
    const res = await earn(owner, accountId, "5000");
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("account_inactive");
  });

  it("expire les points après inactivité, de manière idempotente", async () => {
    const program = await createPointsProgram(owner, { name: "Expirant", inactivityExpiryDays: 30 }).catch(() => null);
    // Le quota de programmes de l'essai Business est de 3 : celui-ci passe.
    expect(program).not.toBeNull();
    const { accountId } = await createCustomerWithCard(owner, program!.id);
    await earn(owner, accountId, "20000");
    await db.loyaltyAccount.update({ where: { id: accountId }, data: { lastActivityAt: new Date(Date.now() - 40 * 86_400_000) } });
    const { LoyaltyService } = await import("../src/loyalty/loyalty.service");
    const service = app.get(LoyaltyService);
    await service.expireInactive();
    await service.expireInactive();
    expect(await assertLedgerConsistent(accountId)).toBe(0);
    expect(await db.loyaltyTransaction.count({ where: { accountId, kind: "EXPIRATION" } })).toBe(1);
  });
});

describe("carte à tampons", () => {
  it("un achat = un tampon, dix tampons = la récompense", async () => {
    const res = await owner.post("/api/app/programs", { name: "Café", mode: "STAMPS", currency: "CDF", stampsTarget: 10 });
    expect(res.status).toBe(201);
    const stampsProgram = res.body.id as string;
    const rewards = (await owner.get(`/api/app/rewards?programId=${stampsProgram}`)).body as { id: string; cost: number }[];
    expect(rewards).toHaveLength(1);
    expect(rewards[0]!.cost).toBe(10);
    const { accountId } = await createCustomerWithCard(owner, stampsProgram);
    for (let i = 0; i < 9; i++) await earn(owner, accountId, null);
    expect((await owner.post("/api/app/redemptions", { accountId, rewardId: rewards[0]!.id, idempotencyKey: uniq("st-") })).status).toBe(422);
    await earn(owner, accountId, null);
    const account = await owner.get(`/api/app/accounts/${accountId}`);
    expect(account.body.balance).toBe(10);
    expect(account.body.rewards[0].affordable).toBe(true);
    expect((await owner.post("/api/app/redemptions", { accountId, rewardId: rewards[0]!.id, idempotencyKey: uniq("st-") })).status).toBe(201);
    expect(await assertLedgerConsistent(accountId)).toBe(0);
  });
});
