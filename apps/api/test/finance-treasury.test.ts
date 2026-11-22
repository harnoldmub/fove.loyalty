import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { agent, db, ownerWithTenant, resetDatabase, startApp, uniq } from "./helpers";
import { hashPassword } from "../src/common/crypto";

describe("trésorerie de la plateforme", () => {
  let app: NestExpressApplication;
  beforeAll(async () => {
    await resetDatabase();
    app = await startApp();
  });
  afterAll(() => app.close());

  async function superAdmin() {
    const email = `admin${Date.now()}@fove.test`;
    await db.user.create({ data: { email, name: "Admin", passwordHash: await hashPassword("motdepasse123"), isSuperAdmin: true, emailVerifiedAt: new Date() } });
    const c = agent(app);
    await c.post("/api/auth/login", { email, password: "motdepasse123" });
    return c;
  }

  it("calcule les soldes nets de frais et de remboursements et liste les écritures bancaires", async () => {
    const admin = await superAdmin();
    const { tenantId } = await ownerWithTenant(app);
    const payment = (data: { provider: "STRIPE" | "MANUAL"; status: "SUCCEEDED" | "PARTIALLY_REFUNDED" | "FAILED"; amountCents: number; feeCents: number; amountRefundedCents?: number }) =>
      db.payment.create({ data: { reference: uniq("PAY-"), tenantId, netCents: data.amountCents - data.feeCents, ...data } });
    await payment({ provider: "STRIPE", status: "SUCCEEDED", amountCents: 10_000, feeCents: 320 });
    await payment({ provider: "MANUAL", status: "PARTIALLY_REFUNDED", amountCents: 5_000, feeCents: 0, amountRefundedCents: 1_000 });
    await payment({ provider: "STRIPE", status: "FAILED", amountCents: 9_999, feeCents: 0 });
    await db.expense.create({ data: { reference: uniq("EXP-"), title: "Serveurs", supplier: "Railway", category: "HOSTING", amountCents: 2_000, expenseDate: new Date() } });
    await db.bankStatementEntry.createMany({
      data: [
        { entryDate: new Date("2026-11-02"), label: "Virement Stripe", amountCents: 9_680, reconciled: true, reconciledType: "PAYMENT" },
        { entryDate: new Date("2026-11-05"), label: "Prélèvement Railway", amountCents: -2_000 },
      ],
    });

    const res = await admin.get("/api/admin/finance/treasury");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      currency: "USD",
      totalCollectedNetCents: 9_680 + 4_000,
      stripeHeldCents: 9_680,
      manualDirectCents: 4_000,
      totalExpensesCents: 2_000,
      totalPayoutsCents: 0,
      estimatedCashCents: 9_680 + 4_000 - 2_000,
      bankBalanceCents: 7_680,
      bankEntryCount: 2,
      unreconciledCount: 1,
    });
    // La page lit ces champs : un renommage côté API doit faire échouer ce test.
    expect(res.body.bankEntries[0]).toMatchObject({ label: "Prélèvement Railway", amountCents: -2_000, currency: "USD", reconciled: false });
    expect(Object.keys(res.body.bankEntries[0])).toEqual(expect.arrayContaining(["id", "entryDate", "label", "amountCents", "currency", "reconciled", "reconciledType"]));
  });

  it("reste réservée aux administrateurs de la plateforme", async () => {
    const { client } = await ownerWithTenant(app);
    expect((await client.get("/api/admin/finance/treasury")).status).toBe(403);
  });
});
