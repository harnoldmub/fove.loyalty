import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { agent, db, lastEmail, ownerWithTenant, resetDatabase, startApp, uniq } from "./helpers";
import { hashPassword } from "../src/common/crypto";
import { StatementService } from "../src/partners/statement.service";

/** Relevés mensuels et compensation (docs/chantier-encaissement-hors-ligne.md, H4). */
let app: NestExpressApplication;
let admin: ReturnType<typeof agent>;
const now = new Date();
const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15));

beforeAll(async () => {
  await resetDatabase();
  app = await startApp({ STRIPE_SECRET_KEY: undefined });
  await db.bankAccount.create({ data: { country: "MA", currency: "MAD", beneficiary: "Dizayna Maroc", accountNumber: "007 780 0001" } });
  await db.exchangeRate.create({ data: { currency: "MAD", unitsPerEur: 10 } });
  const email = `admin${Date.now()}@fove.test`;
  await db.user.create({ data: { email, name: "Admin", passwordHash: await hashPassword("motdepasse123"), isSuperAdmin: true, emailVerifiedAt: new Date() } });
  admin = agent(app);
  await admin.post("/api/auth/login", { email, password: "motdepasse123" });
});
afterAll(async () => {
  await app.close();
});

async function collector() {
  const email = `${uniq("agent")}@test.fove`;
  const user = await db.user.create({ data: { email, name: "Agent", passwordHash: await hashPassword("motdepasse123"), emailVerifiedAt: new Date(), isPartner: true, locale: "fr" } });
  const partner = await db.partner.create({ data: { name: "Agent Rabat", email, code: uniq("RB").toUpperCase(), status: "ACTIVE", userId: user.id, country: "MA", payoutCurrency: "EUR" } });
  const c = agent(app);
  await c.post("/api/auth/login", { email, password: "motdepasse123" });
  return { c, partner, email };
}

/** Encaissement d'une souscription par le partenaire, daté du mois dernier. */
async function collected(c: ReturnType<typeof agent>) {
  const o = await ownerWithTenant(app, { plan: "free" });
  await db.tenantSettings.update({ where: { tenantId: o.tenantId }, data: { country: "MA", locale: "fr" } });
  const { reference } = (await o.client.post("/api/app/billing/offline", { planCode: "starter" })).body;
  expect((await c.post("/api/partner/collection/collect", { reference })).status).toBe(201);
  await db.payment.updateMany({ where: { tenantId: o.tenantId }, data: { confirmedAt: lastMonth } });
  return o;
}

describe("relevé mensuel", () => {
  it("compense encaissements, frais et commissions, puis se règle par rapprochement", async () => {
    const { c, partner, email } = await collector();
    await collected(c);
    await collected(c);
    // Commission disponible (paiement en ligne d'un client apporté) : 20 €, soit 200 MAD.
    const other = await ownerWithTenant(app, { plan: "free" });
    await db.partnerCommission.create({ data: { partnerId: partner.id, tenantId: other.tenantId, amountBaseCents: 10000, commissionRatePercent: 20, commissionAmountCents: 2000, currency: "EUR", status: "AVAILABLE", payoutCurrency: "EUR", payoutAmountCents: 2000, fxRate: 1 } });

    expect(await app.get(StatementService).issueMonthly(now)).toBe(1);
    expect(await app.get(StatementService).issueMonthly(now)).toBe(0);
    const statement = await db.partnerStatement.findFirstOrThrow({ where: { partnerId: partner.id } });
    expect(statement).toMatchObject({ currency: "MAD", collectedCents: 258000, feesCents: 12900, commissionsCents: 20000, balanceCents: 258000 - 12900 - 20000, status: "ISSUED" });
    expect(await db.payment.count({ where: { statementId: statement.id } })).toBe(2);
    expect(await db.partnerCommission.count({ where: { statementId: statement.id, status: "PAID" } })).toBe(3);
    const mail = await lastEmail(email);
    expect(mail?.text).toContain(statement.reference);
    expect(mail?.text).toContain("007 780 0001");

    // Le partenaire voit son relevé ; l'encours reste dû jusqu'au paiement.
    const overview = (await c.get("/api/partner/collection")).body;
    expect(overview.statements[0]).toMatchObject({ reference: statement.reference, status: "ISSUED" });
    expect(overview.status.outstandingEurCents).toBe(Math.round(statement.balanceCents / 10));

    // Virement partiel puis solde, retrouvés par la référence du relevé.
    const partial = await admin.post("/api/admin/finance/treasury/entries", { entryDate: "2026-12-05", label: `VIR ${statement.reference.toLowerCase()}`, amountCents: 100000, currency: "MAD" });
    expect(partial.body).toMatchObject({ suggestedType: "STATEMENT", amountMismatch: true });
    expect((await admin.post(`/api/admin/finance/treasury/entries/${partial.body.id}/confirm`)).status).toBe(201);
    expect((await db.partnerStatement.findUniqueOrThrow({ where: { id: statement.id } })).status).toBe("ISSUED");
    expect((await admin.post(`/api/admin/finance/statements/${statement.id}/pay`, { amountCents: statement.balanceCents - 100000 })).status).toBe(204);
    expect((await db.partnerStatement.findUniqueOrThrow({ where: { id: statement.id } })).status).toBe("PAID");
    expect((await c.get("/api/partner/collection")).body.status.outstandingEurCents).toBe(0);
  });

  it("solde en faveur du partenaire : relevé soldé et versement créé", async () => {
    const { c, partner } = await collector();
    await collected(c);
    const other = await ownerWithTenant(app, { plan: "free" });
    await db.partnerCommission.create({ data: { partnerId: partner.id, tenantId: other.tenantId, amountBaseCents: 100000, commissionRatePercent: 20, commissionAmountCents: 20000, currency: "EUR", status: "AVAILABLE", payoutCurrency: "EUR", payoutAmountCents: 20000, fxRate: 1 } });
    await app.get(StatementService).issueMonthly(now);
    const statement = await db.partnerStatement.findFirstOrThrow({ where: { partnerId: partner.id } });
    // 1 290 MAD encaissés − 64,50 MAD de frais − 2 000 MAD de commissions.
    expect(statement).toMatchObject({ status: "SETTLED", balanceCents: 129000 - 6450 - 200000 });
    const payout = await db.partnerPayout.findFirstOrThrow({ where: { partnerId: partner.id } });
    expect(payout).toMatchObject({ status: "PENDING", currency: "EUR", amountCents: Math.round((200000 + 6450 - 129000) / 10), reference: statement.reference });
  });

  it("liste les relevés dans le back-office", async () => {
    const list = await admin.get("/api/admin/finance/statements?status=ALL");
    expect(list.status).toBe(200);
    expect(list.body.length).toBeGreaterThanOrEqual(2);
  });
});
