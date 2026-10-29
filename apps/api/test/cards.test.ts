import { generateKeyPairSync, verify } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { createCustomerWithCard, createPointsProgram, db, earn, ownerWithTenant, resetDatabase, startApp, uniq, type Client } from "./helpers";

describe("partage de la carte, passages, immuabilité", () => {
  let app: NestExpressApplication;
  let owner: Client;
  let programId: string;
  beforeAll(async () => {
    await resetDatabase();
    app = await startApp();
    owner = (await ownerWithTenant(app)).client;
    programId = (await createPointsProgram(owner)).id;
  });
  afterAll(() => app.close());

  it("le lien de carte est stable ; le renouveler révoque l'ancien", async () => {
    const { accountId, cardUrl, phone } = await createCustomerWithCard(owner, programId);
    const share = await owner.post(`/api/app/accounts/${accountId}/share`, { renew: false });
    expect(share.status).toBe(200);
    expect(share.body.url).toBe(cardUrl);
    expect(share.body.whatsapp).toContain(`https://wa.me/${phone.replace(/\D/g, "")}?text=`);
    expect(share.body.message).toContain(cardUrl);
    const renewed = await owner.post(`/api/app/accounts/${accountId}/share`, { renew: true });
    expect(renewed.body.url).not.toBe(cardUrl);
    const http = request(app.getHttpServer());
    expect((await http.get(`/api/public/cards/${cardUrl.split("/card/")[1]}`)).status).toBe(404);
    expect((await http.get(`/api/public/cards/${renewed.body.url.split("/card/")[1]}`)).status).toBe(200);
  });

  it("un seul passage par jour quand le programme l'exige", async () => {
    const res = await owner.post("/api/app/programs", { name: "Passages", mode: "STAMPS", currency: "CDF", oneVisitPerDay: true });
    const { accountId } = await createCustomerWithCard(owner, res.body.id);
    const key = uniq("v-");
    const first = await earn(owner, accountId, null, key);
    expect(first.status).toBe(201);
    // Le même scan rejoué n'est pas un refus : c'est la même opération.
    expect((await earn(owner, accountId, null, key)).body.replayed).toBe(true);
    const second = await earn(owner, accountId, null);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("visit_already_counted");
    // Deux scans simultanés : un seul passe.
    const other = await createCustomerWithCard(owner, res.body.id);
    const parallel = await Promise.all([1, 2, 3, 4].map(() => earn(owner, other.accountId, null)));
    expect(parallel.filter((r) => r.status === 201)).toHaveLength(1);
    // Passage annulé par erreur : le client peut être recompté.
    await owner.post(`/api/app/transactions/${first.body.transaction.id}/reverse`, { reason: "Erreur", idempotencyKey: uniq("r-") });
    expect((await earn(owner, accountId, null)).status).toBe(201);
  });

  it("retrouve un client par téléphone saisi avec espaces ou au format local", async () => {
    const { customerId, phone } = await createCustomerWithCard(owner, programId);
    const local = `0${phone.slice(4, 6)} ${phone.slice(6, 9)} ${phone.slice(9)}`;
    const found = await owner.get(`/api/app/customers?q=${encodeURIComponent(local)}`);
    expect(found.body.data.map((c: { id: string }) => c.id)).toContain(customerId);
  });

  it("le registre et l'audit sont immuables en base", async () => {
    const { accountId } = await createCustomerWithCard(owner, programId);
    const tx = (await earn(owner, accountId, "5000")).body.transaction;
    await expect(db.loyaltyTransaction.update({ where: { id: tx.id }, data: { delta: 999 } })).rejects.toThrow(/immuable/);
    await expect(db.loyaltyTransaction.delete({ where: { id: tx.id } })).rejects.toThrow(/immuable/);
    const log = await db.auditLog.findFirstOrThrow();
    await expect(db.auditLog.delete({ where: { id: log.id } })).rejects.toThrow(/immuable/);
  });
});

describe("Google Wallet configuré", () => {
  let app: NestExpressApplication;
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  beforeAll(async () => {
    await resetDatabase();
    app = await startApp({
      GOOGLE_WALLET_ISSUER_ID: "3388000000012345678",
      GOOGLE_WALLET_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: "fove@test.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) }),
    });
  });
  afterAll(async () => {
    await app.close();
    delete process.env.GOOGLE_WALLET_ISSUER_ID;
    delete process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON;
  });

  it("produit un lien d'ajout signé avec la classe du programme et le QR de la carte", async () => {
    const { client } = await ownerWithTenant(app);
    const program = await createPointsProgram(client);
    const { accountId, cardUrl } = await createCustomerWithCard(client, program.id);
    const token = cardUrl.split("/card/")[1]!;
    const http = request(app.getHttpServer());
    expect((await http.get(`/api/public/cards/${token}`)).body.googleWallet).toBe(true);
    const res = await http.get(`/api/public/cards/${token}/google-wallet`);
    expect(res.status).toBe(200);
    const jwt = res.body.url.replace("https://pay.google.com/gp/v/save/", "");
    const [header, payload, signature] = jwt.split(".");
    expect(verify("RSA-SHA256", Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature, "base64url"))).toBe(true);
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    const account = await db.loyaltyAccount.findUniqueOrThrow({ where: { id: accountId } });
    expect(claims.payload.loyaltyClasses[0].id).toBe(`3388000000012345678.fove_${program.id.replace(/-/g, "")}`);
    expect(claims.payload.loyaltyObjects[0].barcode.value).toBe(account.qrToken);
    expect(claims.exp - claims.iat).toBe(600);
    expect((await client.get("/api/app/wallet/status")).body.googleWallet).toBe(true);
  });
});
