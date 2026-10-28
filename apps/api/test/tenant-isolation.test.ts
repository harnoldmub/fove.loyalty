import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { createCustomerWithCard, createPointsProgram, db, earn, ownerWithTenant, resetDatabase, startApp } from "./helpers";

let app: NestExpressApplication;
let A: Awaited<ReturnType<typeof ownerWithTenant>>;
let B: Awaited<ReturnType<typeof ownerWithTenant>>;
let a: { programId: string; customerId: string; accountId: string; txId: string; qr: string; cardNumber: string };

beforeAll(async () => {
  await resetDatabase();
  app = await startApp();
  A = await ownerWithTenant(app);
  B = await ownerWithTenant(app);
  const program = await createPointsProgram(A.client);
  const card = await createCustomerWithCard(A.client, program.id);
  const tx = await earn(A.client, card.accountId, "5000");
  const account = await db.loyaltyAccount.findUniqueOrThrow({ where: { id: card.accountId } });
  a = { programId: program.id, customerId: card.customerId, accountId: card.accountId, txId: tx.body.transaction.id, qr: account.qrToken, cardNumber: account.cardNumber };
  await createPointsProgram(B.client);
});
afterAll(() => app.close());

describe("isolation multi-tenant", () => {
  it("B ne voit aucune donnée de A dans ses listes", async () => {
    expect((await B.client.get("/api/app/customers")).body.data).toHaveLength(0);
    expect((await B.client.get("/api/app/transactions")).body.data).toHaveLength(0);
    const programs = (await B.client.get("/api/app/programs")).body as { id: string }[];
    expect(programs.map((p) => p.id)).not.toContain(a.programId);
  });

  it("B ne peut pas lire les ressources de A par identifiant", async () => {
    expect((await B.client.get(`/api/app/customers/${a.customerId}`)).status).toBe(404);
    expect((await B.client.get(`/api/app/accounts/${a.accountId}`)).status).toBe(404);
    expect((await B.client.get(`/api/app/programs/${a.programId}`)).status).toBe(404);
    expect((await B.client.get(`/api/app/customers/${a.customerId}/export`)).status).toBe(404);
  });

  it("le QR et le numéro de carte de A sont inconnus chez B", async () => {
    expect((await B.client.post("/api/app/scanner/lookup", { code: a.qr })).status).toBe(404);
    expect((await B.client.post("/api/app/scanner/lookup", { code: a.cardNumber })).status).toBe(404);
    expect((await A.client.post("/api/app/scanner/lookup", { code: a.qr })).status).toBe(200);
  });

  it("B ne peut ni créditer, ni annuler, ni modifier chez A", async () => {
    expect((await earn(B.client, a.accountId, "10000")).status).toBe(404);
    expect((await B.client.post(`/api/app/transactions/${a.txId}/reverse`, { reason: "test", idempotencyKey: "rev-isolation-1" })).status).toBe(404);
    expect((await B.client.patch(`/api/app/customers/${a.customerId}`, { firstName: "Pirate" })).status).toBe(404);
    expect((await B.client.patch(`/api/app/programs/${a.programId}`, { name: "Pirate" })).status).toBe(404);
    expect((await B.client.post("/api/app/accounts", { customerId: a.customerId, programId: a.programId })).status).toBe(404);
    const account = await db.loyaltyAccount.findUniqueOrThrow({ where: { id: a.accountId } });
    expect(account.balance).toBe(5);
  });

  it("le tenant actif ne peut pas être choisi librement par le navigateur", async () => {
    expect((await B.client.post("/api/auth/switch-tenant", { tenantId: A.tenantId })).status).toBe(403);
    // Un en-tête ou un paramètre forgé n'a aucun effet.
    const forged = await B.client.raw.get(`/api/app/customers?tenantId=${A.tenantId}`).set("x-tenant-id", A.tenantId);
    expect(forged.body.data).toHaveLength(0);
  });

  it("la base refuse une relation entre deux entreprises (clé composite)", async () => {
    const bProgram = await db.loyaltyProgram.findFirstOrThrow({ where: { tenantId: B.tenantId } });
    await expect(
      db.loyaltyAccount.create({
        data: { tenantId: B.tenantId, programId: bProgram.id, customerId: a.customerId, cardNumber: "FV-XXXX-0001", qrToken: "fvq_x", accessTokenHash: "h1" },
      }),
    ).rejects.toThrow();
  });

  it("une clé API de B n'accède pas aux données de A", async () => {
    const key = await B.client.post("/api/app/integrations/keys", { name: "Clé B", kind: "SECRET", scopes: ["customers:read", "loyalty:read", "loyalty:write"] });
    // L'email de B n'est pas vérifié : la création de clé est refusée.
    expect(key.status).toBe(403);
    await db.user.update({ where: { email: B.email }, data: { emailVerifiedAt: new Date() } });
    const ok = await B.client.post("/api/app/integrations/keys", { name: "Clé B", kind: "SECRET", scopes: ["customers:read", "loyalty:read", "loyalty:write"] });
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    const http = request(app.getHttpServer());
    const auth = { Authorization: `Bearer ${ok.body.key}` };
    expect((await http.get(`/api/v1/customers/${a.customerId}`).set(auth)).status).toBe(404);
    expect((await http.get(`/api/v1/loyalty/accounts/${a.accountId}`).set(auth)).status).toBe(404);
    const credit = await http.post("/api/v1/loyalty/transactions").set(auth).set("Idempotency-Key", "iso-credit-1").send({ accountId: a.accountId, amount: "9000" });
    expect(credit.status).toBe(404);
  });
});
