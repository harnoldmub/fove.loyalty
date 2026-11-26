import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { normalizePaymentReference } from "@fove/shared";
import { agent, db, lastEmail, ownerWithTenant, resetDatabase, startApp, signIn } from "./helpers";
import { OfflineBillingService } from "../src/billing/offline.service";
import { PlanService } from "../src/billing/plan.service";
import { BillingService } from "../src/billing/billing.service";

/** Règlement hors ligne : virement direct, accès provisoire, validation (docs/chantier-encaissement-hors-ligne.md, H1). */
let app: NestExpressApplication;
let admin: ReturnType<typeof agent>;

beforeAll(async () => {
  await resetDatabase();
  app = await startApp({ STRIPE_SECRET_KEY: undefined });
  const email = `admin${Date.now()}@fove.test`;
  await db.user.create({ data: { email, name: "Admin", isSuperAdmin: true, emailVerifiedAt: new Date() } });
  admin = agent(app);
  await signIn(admin, email);
  const res = await admin.post("/api/admin/finance/bank-accounts", { country: "MA", currency: "MAD", beneficiary: "Dizayna Maroc", bankName: "Banque Populaire", accountNumber: "181 810 2111111111111111 00", instructions: "Espèces : au bureau de Casablanca." });
  expect(res.status).toBe(201);
});
afterAll(async () => {
  await app.close();
});

async function moroccan() {
  const o = await ownerWithTenant(app, { plan: "free" });
  await db.tenantSettings.update({ where: { tenantId: o.tenantId }, data: { country: "MA", locale: "fr", contactEmail: o.email } });
  return o;
}

const plan = (tenantId: string) => app.get(PlanService).currentPlan(tenantId);

describe("virement direct", () => {
  it("n'est proposé que dans un pays avec des coordonnées", async () => {
    const o = await ownerWithTenant(app, { plan: "free" });
    await db.tenantSettings.update({ where: { tenantId: o.tenantId }, data: { country: "SN" } });
    expect((await o.client.get("/api/app/billing")).body.offline.available).toBe(false);
    const res = await o.client.post("/api/app/billing/offline", { planCode: "starter" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("offline_unavailable");
  });

  it("donne une référence, ouvre 7 jours d'accès provisoire, puis active un an au paiement", async () => {
    const o = await moroccan();
    const res = await o.client.post("/api/app/billing/offline", { planCode: "starter" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ amountCents: 129000, currency: "MAD" });
    expect(normalizePaymentReference(res.body.reference)?.reference).toBe(res.body.reference);
    const mail = await lastEmail(o.email);
    expect(mail?.text).toContain(res.body.reference);
    expect(mail?.text).toContain("Banque Populaire");

    // Accès provisoire : l'offre s'applique tout de suite.
    expect((await plan(o.tenantId)).code).toBe("starter");
    const billing = (await o.client.get("/api/app/billing")).body;
    expect(billing.offline.invoice).toMatchObject({ reference: res.body.reference, kind: "new", planCode: "starter" });
    expect(billing.offline.invoice.provisionalUntil).toBeTruthy();

    // Le paiement par carte est refusé tant que l'abonnement hors ligne est payé et en cours.
    const list = (await admin.get(`/api/admin/finance/offline-invoices?q=${encodeURIComponent(res.body.reference.toLowerCase().replace(/-/g, " "))}`)).body;
    expect(list).toHaveLength(1);
    const short = await admin.post(`/api/admin/finance/offline-invoices/${list[0].id}/validate`, { method: "BANK_TRANSFER", amountCents: 128000 });
    expect(short.status).toBe(400);
    expect(short.body.error.code).toBe("amount_short");
    const ok = await admin.post(`/api/admin/finance/offline-invoices/${list[0].id}/validate`, { method: "BANK_TRANSFER", amountCents: 128000, acceptShortfall: true, bankReference: "VIR 123" });
    expect(ok.status).toBe(201);

    const sub = await db.subscription.findUniqueOrThrow({ where: { tenantId: o.tenantId } });
    expect(sub).toMatchObject({ provider: "OFFLINE", status: "ACTIVE", currency: "MAD", provisionalUntil: null });
    expect(sub.currentPeriodEnd!.getTime()).toBeGreaterThan(Date.now() + 360 * 86_400_000);
    const payment = await db.payment.findFirstOrThrow({ where: { tenantId: o.tenantId } });
    expect(payment).toMatchObject({ provider: "BANK_TRANSFER", currency: "MAD", amountCents: 128000, providerPaymentId: "VIR 123" });
    expect((await lastEmail(o.email))?.subject).toContain("Paiement reçu");
    expect((await admin.post(`/api/admin/finance/offline-invoices/${list[0].id}/validate`, { method: "CASH", amountCents: 129000 })).status).toBe(400);

    const checkout = await o.client.post("/api/app/billing/checkout", { planCode: "business", interval: "YEAR" });
    expect(checkout.body.error.code).toBe("offline_running");

    // Renouvellement : la facture couvre l'année suivante.
    const renewal = await o.client.post("/api/app/billing/offline", { planCode: "business" });
    expect(renewal.status).toBe(201);
    const invoice = await db.invoice.findFirstOrThrow({ where: { paymentReference: renewal.body.reference } });
    expect(invoice.periodStart!.getTime()).toBe(sub.currentPeriodEnd!.getTime());
    expect((await plan(o.tenantId)).code).toBe("starter");
    await app.get(OfflineBillingService).validate(invoice.id, { method: "MOBILE_MONEY", amountCents: invoice.amountDueCents }, { userId: (await db.user.findFirstOrThrow({ where: { isSuperAdmin: true } })).id, email: "admin@fove.test" });
    const renewed = await db.subscription.findUniqueOrThrow({ where: { tenantId: o.tenantId } });
    expect(renewed.currentPeriodEnd!.getTime()).toBe(invoice.periodEnd!.getTime());
    expect((await plan(o.tenantId)).code).toBe("business");
  });

  it("revient au Gratuit sans paiement à la fin de l'accès provisoire, qui n'est pas redonné", async () => {
    const o = await moroccan();
    const first = await o.client.post("/api/app/billing/offline", { planCode: "starter" });
    await db.subscription.update({ where: { tenantId: o.tenantId }, data: { provisionalUntil: new Date(Date.now() - 1000), currentPeriodEnd: new Date(Date.now() - 1000) } });
    expect((await plan(o.tenantId)).code).toBe("free");
    expect(await app.get(OfflineBillingService).expireProvisional()).toBeGreaterThanOrEqual(1);
    expect((await db.invoice.findFirstOrThrow({ where: { paymentReference: first.body.reference } })).status).toBe("VOID");
    expect((await lastEmail(o.email))?.subject).toContain("accès provisoire");
    await app.get(BillingService).closeExpired();

    // Nouvelle demande : facture, mais pas de nouvel accès provisoire.
    const second = await o.client.post("/api/app/billing/offline", { planCode: "starter" });
    expect(second.status).toBe(201);
    expect((await plan(o.tenantId)).code).toBe("free");
    expect((await o.client.get("/api/app/billing")).body.offline.invoice.provisionalUntil).toBeNull();
  });

  it("annule une demande et l'accès provisoire en cours", async () => {
    const o = await moroccan();
    await o.client.post("/api/app/billing/offline", { planCode: "starter" });
    expect((await o.client.post("/api/app/billing/offline/cancel")).status).toBe(204);
    expect((await plan(o.tenantId)).code).toBe("free");
    expect((await o.client.get("/api/app/billing")).body.offline.invoice).toBeNull();
  });

  it("remplace la facture en attente si l'offre change, sans prolonger l'accès provisoire", async () => {
    const o = await moroccan();
    const a = await o.client.post("/api/app/billing/offline", { planCode: "starter" });
    const until = (await db.subscription.findUniqueOrThrow({ where: { tenantId: o.tenantId } })).provisionalUntil!;
    const b = await o.client.post("/api/app/billing/offline", { planCode: "business" });
    expect(b.body.reference).not.toBe(a.body.reference);
    expect((await db.invoice.findFirstOrThrow({ where: { paymentReference: a.body.reference } })).status).toBe("VOID");
    const sub = await db.subscription.findUniqueOrThrow({ where: { tenantId: o.tenantId } });
    expect(sub.provisionalUntil!.getTime()).toBe(until.getTime());
    expect((await plan(o.tenantId)).code).toBe("business");
    // Même offre : la même facture est renvoyée.
    expect((await o.client.post("/api/app/billing/offline", { planCode: "business" })).body.reference).toBe(b.body.reference);
  });

  it("réserve le back-office à la finance", async () => {
    const o = await moroccan();
    expect((await o.client.get("/api/admin/finance/offline-invoices")).status).toBe(403);
    expect((await o.client.get("/api/admin/finance/bank-accounts")).status).toBe(403);
  });
});
