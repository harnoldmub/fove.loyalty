import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { agent, db, ownerWithTenant, resetDatabase, startApp } from "./helpers";
import { hashPassword } from "../src/common/crypto";
import { parseAmount, parseBankCsv, parseDate } from "../src/admin/finance/bank-csv";

describe("lecture d'un relevé CSV", () => {
  it("lit montants et dates aux formats courants", () => {
    expect(parseAmount("1 234,56")).toBe(123456);
    expect(parseAmount("1,234.56")).toBe(123456);
    expect(parseAmount("-99")).toBe(-9900);
    expect(parseAmount("1.290")).toBe(129000);
    expect(parseAmount("12,5")).toBe(1250);
    expect(parseAmount("abc")).toBeNull();
    expect(parseDate("05/11/2026")?.toISOString().slice(0, 10)).toBe("2026-11-05");
    expect(parseDate("2026-11-05")?.toISOString().slice(0, 10)).toBe("2026-11-05");
    expect(parseDate("31/02/2026")).toBeNull();
  });

  it("accepte crédit / débit, guillemets et lignes invalides", () => {
    const csv = `Date;Libellé;Débit;Crédit;Devise\n05/11/2026;"VIR ""AMAL"" FV 7KQ4M2 X";;1 290,00;MAD\n06/11/2026;FRAIS;15,00;;MAD\nxx;Ligne cassée;;1;MAD\n`;
    const { rows, skipped } = parseBankCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ label: 'VIR "AMAL" FV 7KQ4M2 X', amountCents: 129000, currency: "MAD" });
    expect(rows[1]!.amountCents).toBe(-1500);
    expect(skipped).toEqual([4]);
    expect(() => parseBankCsv("a,b\n1,2")).toThrow();
  });
});

describe("rapprochement bancaire", () => {
  let app: NestExpressApplication;
  let admin: ReturnType<typeof agent>;
  beforeAll(async () => {
    await resetDatabase();
    app = await startApp({ STRIPE_SECRET_KEY: undefined });
    const email = `admin${Date.now()}@fove.test`;
    await db.user.create({ data: { email, name: "Admin", passwordHash: await hashPassword("motdepasse123"), isSuperAdmin: true, emailVerifiedAt: new Date() } });
    admin = agent(app);
    await admin.post("/api/auth/login", { email, password: "motdepasse123" });
    await admin.post("/api/admin/finance/bank-accounts", { country: "MA", currency: "MAD", beneficiary: "Dizayna Maroc" });
  });
  afterAll(async () => {
    await app.close();
  });

  it("retrouve la facture par la référence du libellé et la valide en un clic", async () => {
    const o = await ownerWithTenant(app, { plan: "free" });
    await db.tenantSettings.update({ where: { tenantId: o.tenantId }, data: { country: "MA" } });
    const { reference, amountCents } = (await o.client.post("/api/app/billing/offline", { planCode: "starter" })).body;
    const label = `VIR RECU BOUTIQUE ${reference.toLowerCase().replace(/-/g, " ")}`;
    const csv = `date,label,amount\n2026-11-20,${label},${(amountCents / 100).toFixed(2)}\n2026-11-21,PRELEVEMENT LOYER,-500\n`;
    const res = await admin.post("/api/admin/finance/treasury/import", { csv, currency: "MAD" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ imported: 2, matched: 1, duplicates: 0 });
    expect((await admin.post("/api/admin/finance/treasury/import", { csv, currency: "MAD" })).body).toMatchObject({ imported: 0, duplicates: 2 });

    const treasury = (await admin.get("/api/admin/finance/treasury")).body;
    const line = treasury.bankEntries.find((e: { label: string }) => e.label === label);
    expect(line.suggestion).toMatchObject({ type: "INVOICE", reference, expectedCents: amountCents, currency: "MAD" });
    expect(line.amountMismatch).toBe(false);

    const ok = await admin.post(`/api/admin/finance/treasury/entries/${line.id}/confirm`);
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ reconciled: true, reconciledType: "PAYMENT" });
    expect((await db.subscription.findUniqueOrThrow({ where: { tenantId: o.tenantId } })).provisionalUntil).toBeNull();
    expect((await admin.post(`/api/admin/finance/treasury/entries/${line.id}/confirm`)).status).toBe(400);
  });

  it("signale un écart de montant sur une ligne saisie à la main", async () => {
    const o = await ownerWithTenant(app, { plan: "free" });
    await db.tenantSettings.update({ where: { tenantId: o.tenantId }, data: { country: "MA" } });
    const { reference, amountCents } = (await o.client.post("/api/app/billing/offline", { planCode: "starter" })).body;
    const res = await admin.post("/api/admin/finance/treasury/entries", { entryDate: "2026-11-22", label: `Versement ${reference}`, amountCents: amountCents - 2000, currency: "MAD" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ suggestedType: "INVOICE", amountMismatch: true });
  });
});
