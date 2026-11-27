import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { agent, db, lastEmail, ownerWithTenant, resetDatabase, startApp, uniq, signIn } from "./helpers";
import { PartnersService } from "../src/partners/partners.service";
import { PlanService } from "../src/billing/plan.service";

/**
 * Partenaires sans encaissement (décision du 26 novembre 2026) : le commerçant paie FOVE, la
 * commission naît au paiement confirmé, et les commissions disponibles sont versées chaque mois.
 */
let app: NestExpressApplication;
let admin: ReturnType<typeof agent>;
const DAY = 86_400_000;

beforeAll(async () => {
  await resetDatabase();
  app = await startApp({ STRIPE_SECRET_KEY: undefined });
  await db.bankAccount.create({ data: { country: "MA", currency: "MAD", beneficiary: "Dizayna Maroc" } });
  await db.exchangeRate.create({ data: { currency: "MAD", unitsPerEur: 10 } });
  const email = `admin${Date.now()}@fove.test`;
  await db.user.create({ data: { email, name: "Admin", isSuperAdmin: true, emailVerifiedAt: new Date() } });
  admin = agent(app);
  await signIn(admin, email);
});
afterAll(async () => {
  await app.close();
});

async function partner(extra: object = {}) {
  const email = `${uniq("agent")}@test.fove`;
  const user = await db.user.create({ data: { email, name: "Agent", emailVerifiedAt: new Date(), isPartner: true, locale: "fr" } });
  const record = await db.partner.create({ data: { name: "Agent Casa", email, code: uniq("AG").toUpperCase(), status: "ACTIVE", userId: user.id, country: "MA", payoutCurrency: "EUR", payoutInfo: { method: "BANK_TRANSFER", accountHolder: "Agent Casa", iban: "MA64011519000001205000534921" }, ...extra } });
  const c = agent(app);
  await signIn(c, email);
  return { c, partner: record, email };
}

async function client(partnerId: string, code: string) {
  const o = await ownerWithTenant(app, { plan: "free" });
  await db.tenantSettings.update({ where: { tenantId: o.tenantId }, data: { country: "MA", locale: "fr", contactEmail: o.email } });
  await db.acquisitionAttribution.create({ data: { tenantId: o.tenantId, partnerId, code } });
  return o;
}

describe("paiement reçu saisi par FOVE", () => {
  it("crée et valide la facture en une fois, sans email d'instructions", async () => {
    const { partner: p } = await partner();
    const o = await client(p.id, p.code);
    const res = await admin.post(`/api/admin/finance/tenants/${o.tenantId}/payment`, { planCode: "starter", method: "CASH", receiptNumber: "R-12" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ amountCents: 129000, currency: "MAD" });
    expect((await app.get(PlanService).currentPlan(o.tenantId)).code).toBe("starter");
    const payment = await db.payment.findFirstOrThrow({ where: { tenantId: o.tenantId } });
    expect(payment).toMatchObject({ provider: "MANUAL", method: "cash", receiptNumber: "R-12" });
    expect((await lastEmail(o.email))?.subject).toContain("Paiement reçu");
    // La commission d'apport naît au paiement confirmé.
    expect(await db.partnerCommission.count({ where: { partnerId: p.id, tenantId: o.tenantId } })).toBe(1);
  });

  it("refuse un montant inférieur sans accord, sans laisser de facture en attente", async () => {
    const o = await ownerWithTenant(app, { plan: "free" });
    await db.tenantSettings.update({ where: { tenantId: o.tenantId }, data: { country: "MA" } });
    const res = await admin.post(`/api/admin/finance/tenants/${o.tenantId}/payment`, { planCode: "starter", method: "BANK_TRANSFER", amountCents: 100000 });
    expect(res.body.error.code).toBe("amount_short");
    expect(await db.invoice.count({ where: { tenantId: o.tenantId, status: "OPEN" } })).toBe(0);
    const ok = await admin.post(`/api/admin/finance/tenants/${o.tenantId}/payment`, { planCode: "starter", method: "BANK_TRANSFER", amountCents: 100000, acceptShortfall: true });
    expect(ok.status).toBe(201);
  });
});

describe("clients du partenaire", () => {
  it("affiche l'état du paiement de chaque client", async () => {
    const { c, partner: p } = await partner();
    const pending = await client(p.id, p.code);
    await pending.client.post("/api/app/billing/offline", { planCode: "business" });
    const free = await client(p.id, p.code);
    const list = (await c.get("/api/partner/clients")).body as { tenantId: string; payment: string; pending: { reference: string } | null }[];
    expect(list.find((x) => x.tenantId === pending.tenantId)).toMatchObject({ payment: "provisional", pending: { reference: expect.stringMatching(/^FV-/) } });
    expect(list.find((x) => x.tenantId === free.tenantId)).toMatchObject({ payment: "free", pending: null });
    // Les routes d'encaissement par le partenaire n'existent plus.
    expect((await c.post("/api/partner/collection/collect", { reference: "FV-AAAAAA-A" })).status).toBe(404);
    expect((await c.post("/api/partner/payouts/request", { amountCents: 5000 })).status).toBe(404);
  });
});

describe("versement mensuel des commissions", () => {
  it("regroupe le 1er du mois les commissions disponibles, une seule fois, et les marque versées au paiement", async () => {
    const { partner: p, email } = await partner();
    const now = new Date();
    const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 5 * DAY);
    const make = async (cents: number, availableAt: Date) => {
      const o = await ownerWithTenant(app, { plan: "free" });
      return db.partnerCommission.create({ data: { partnerId: p.id, tenantId: o.tenantId, amountBaseCents: cents * 5, commissionRatePercent: 20, commissionAmountCents: cents, currency: "MAD", status: "PENDING", availableAt } });
    };
    await make(30000, lastMonth);
    await make(20000, lastMonth);
    // Disponible ce mois-ci : pour le versement suivant.
    await make(10000, new Date(Date.now() - 1000));

    const partners = app.get(PartnersService);
    expect(await partners.scheduleMonthlyPayouts(now)).toBe(1);
    expect(await partners.scheduleMonthlyPayouts(now)).toBe(0);
    const payout = await db.partnerPayout.findFirstOrThrow({ where: { partnerId: p.id } });
    // 500 MAD convertis en euros (1 € = 10 MAD).
    expect(payout).toMatchObject({ status: "PENDING", currency: "EUR", amountCents: 5000 });
    expect(await db.partnerCommission.count({ where: { payoutId: payout.id } })).toBe(2);
    expect((await lastEmail(email))?.subject).toContain("Votre versement du mois");

    const list = (await admin.get("/api/admin/partners/payouts?status=PENDING")).body as { id: string; commissions: unknown[] }[];
    expect(list.find((x) => x.id === payout.id)?.commissions).toHaveLength(2);
    expect((await admin.post(`/api/admin/partners/payouts/${payout.id}/process`, { status: "PAID", reference: "VIR-001" })).status).toBe(201);
    expect(await db.partnerCommission.count({ where: { payoutId: payout.id, status: "PAID" } })).toBe(2);
    expect((await admin.post(`/api/admin/partners/payouts/${payout.id}/process`, { status: "PAID" })).status).toBe(400);
  });

  it("reporte sous le seuil, et remet les commissions d'un versement rejeté au mois suivant", async () => {
    const { partner: p } = await partner();
    const o = await ownerWithTenant(app, { plan: "free" });
    const old = new Date(Date.now() - 60 * DAY);
    await db.partnerCommission.create({ data: { partnerId: p.id, tenantId: o.tenantId, amountBaseCents: 1000, commissionRatePercent: 20, commissionAmountCents: 2000, currency: "MAD", status: "PENDING", availableAt: old } });
    const partners = app.get(PartnersService);
    expect(await partners.scheduleMonthlyPayouts()).toBe(0);
    expect(await db.partnerPayout.count({ where: { partnerId: p.id } })).toBe(0);

    await db.partnerCommission.create({ data: { partnerId: p.id, tenantId: o.tenantId, amountBaseCents: 1000, commissionRatePercent: 20, commissionAmountCents: 60000, currency: "MAD", status: "PENDING", availableAt: old } });
    expect(await partners.scheduleMonthlyPayouts()).toBe(1);
    const payout = await db.partnerPayout.findFirstOrThrow({ where: { partnerId: p.id } });
    expect(payout.amountCents).toBe(6200);
    await admin.post(`/api/admin/partners/payouts/${payout.id}/process`, { status: "REJECTED", rejectionReason: "IBAN invalide" });
    expect(await db.partnerCommission.count({ where: { partnerId: p.id, status: "AVAILABLE", payoutId: null } })).toBe(2);
  });
});
