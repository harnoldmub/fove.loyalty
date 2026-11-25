import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { agent, db, lastEmail, ownerWithTenant, resetDatabase, startApp, uniq } from "./helpers";
import { hashPassword } from "../src/common/crypto";
import { PlanService } from "../src/billing/plan.service";

/** Encaissement par les partenaires (docs/chantier-encaissement-hors-ligne.md, H3). */
let app: NestExpressApplication;

beforeAll(async () => {
  await resetDatabase();
  app = await startApp({ STRIPE_SECRET_KEY: undefined });
  await db.bankAccount.create({ data: { country: "MA", currency: "MAD", beneficiary: "Dizayna Maroc" } });
});
afterAll(async () => {
  await app.close();
});

/** Partenaire validé, connecté, avec un compte à l'email confirmé. */
async function partner(extra: object = {}) {
  const email = `${uniq("agent")}@test.fove`;
  const user = await db.user.create({ data: { email, name: "Agent", passwordHash: await hashPassword("motdepasse123"), emailVerifiedAt: new Date(), isPartner: true } });
  const record = await db.partner.create({ data: { name: "Agent Casa", email, code: uniq("AG").toUpperCase(), status: "ACTIVE", userId: user.id, country: "MA", ...extra } });
  const c = agent(app);
  expect((await c.post("/api/auth/login", { email, password: "motdepasse123" })).status).toBe(200);
  return { c, partner: record };
}

async function moroccan() {
  const o = await ownerWithTenant(app, { plan: "free" });
  await db.tenantSettings.update({ where: { tenantId: o.tenantId }, data: { country: "MA", locale: "fr", contactEmail: o.email } });
  return o;
}

const plan = (tenantId: string) => app.get(PlanService).currentPlan(tenantId);

describe("encaissement par référence", () => {
  it("active l'abonnement, prend 5 % de frais et prévient le commerçant", async () => {
    const { c, partner: p } = await partner();
    const o = await moroccan();
    const { reference, amountCents } = (await o.client.post("/api/app/billing/offline", { planCode: "starter" })).body;

    const lookup = await c.get(`/api/partner/collection/lookup?reference=${encodeURIComponent(reference.toLowerCase())}`);
    expect(lookup.status).toBe(200);
    expect(lookup.body).toMatchObject({ reference, amountCents, currency: "MAD", kind: "new" });
    expect((await c.get("/api/partner/collection/lookup?reference=FV-AAAAAA-A")).status).toBe(404);

    const res = await c.post("/api/partner/collection/collect", { reference, receiptNumber: "R-001" });
    expect(res.status).toBe(201);
    const sub = await db.subscription.findUniqueOrThrow({ where: { tenantId: o.tenantId } });
    expect(sub).toMatchObject({ provider: "OFFLINE", status: "ACTIVE", provisionalUntil: null });
    expect((await plan(o.tenantId)).code).toBe("starter");
    const payment = await db.payment.findFirstOrThrow({ where: { tenantId: o.tenantId } });
    expect(payment).toMatchObject({ collectorPartnerId: p.id, provider: "MANUAL", method: "cash", receiptNumber: "R-001", amountCents });
    const fee = await db.partnerCommission.findFirstOrThrow({ where: { partnerId: p.id, kind: "COLLECTION_FEE" } });
    expect(fee).toMatchObject({ commissionAmountCents: Math.round(amountCents * 0.05), currency: "MAD", status: "CONFIRMED" });

    // Le commerçant reçoit une confirmation avec un lien de signalement.
    const mail = await lastEmail(o.email);
    expect(mail?.subject).toContain("Confirmation de votre paiement");
    const token = decodeURIComponent(/token=([^\s"&]+)/.exec(mail!.text)![1]!);
    expect((await request(app.getHttpServer()).post("/api/public/collection-report").send({ token: `${token}x`, note: "?" })).status).toBe(400);
    expect((await request(app.getHttpServer()).post("/api/public/collection-report").send({ token, note: "Je n'ai payé que 500 MAD" })).status).toBe(201);
    expect((await db.payment.findUniqueOrThrow({ where: { id: payment.id } })).disputeNote).toBe("Je n'ai payé que 500 MAD");

    // Déjà encaissée : la référence n'est plus en attente.
    expect((await c.post("/api/partner/collection/collect", { reference })).status).toBe(404);
    const overview = (await c.get("/api/partner/collection")).body;
    expect(overview.history).toHaveLength(1);
    expect(overview.status.outstandingEurCents).toBeGreaterThan(0);
  });

  it("souscription d'un client apporté : commission d'apport, pas de frais", async () => {
    const { c, partner: p } = await partner();
    const o = await moroccan();
    await db.acquisitionAttribution.create({ data: { tenantId: o.tenantId, partnerId: p.id, code: p.code } });
    const clients = (await c.get("/api/partner/collection/clients")).body;
    expect(clients).toEqual([expect.objectContaining({ tenantId: o.tenantId, planCode: "free", currency: "MAD" })]);

    const quote = await c.post("/api/partner/collection/invoice", { tenantId: o.tenantId, planCode: "business" });
    expect(quote.status).toBe(201);
    expect(quote.body).toMatchObject({ amountCents: 249000, currency: "MAD" });
    // Pas d'accès provisoire avant l'encaissement.
    expect((await plan(o.tenantId)).code).toBe("free");
    expect((await c.post("/api/partner/collection/collect", { reference: quote.body.reference, method: "MOBILE_MONEY" })).status).toBe(201);
    expect((await plan(o.tenantId)).code).toBe("business");
    expect(await db.partnerCommission.count({ where: { partnerId: p.id, kind: "COLLECTION_FEE" } })).toBe(0);
    expect(await db.partnerCommission.count({ where: { partnerId: p.id, kind: "ACQUISITION" } })).toBe(1);

    // Le commerce d'un autre ne passe pas par la liste « Clients ».
    const other = await moroccan();
    expect((await c.post("/api/partner/collection/invoice", { tenantId: other.tenantId, planCode: "starter" })).status).toBe(403);
  });
});

describe("garde-fous", () => {
  it("refuse au-delà du plafond d'encours, si l'encaissement est désactivé ou un relevé impayé", async () => {
    const { c, partner: p } = await partner({ collectionCapEurCents: 5_000 });
    const o = await moroccan();
    const { reference } = (await o.client.post("/api/app/billing/offline", { planCode: "starter" })).body;
    const capped = await c.post("/api/partner/collection/collect", { reference });
    expect(capped.body.error.code).toBe("collection_cap");

    await db.partner.update({ where: { id: p.id }, data: { collectionCapEurCents: 1_000_000, collectionEnabled: false } });
    expect((await c.post("/api/partner/collection/collect", { reference })).body.error.code).toBe("collection_disabled");

    await db.partner.update({ where: { id: p.id }, data: { collectionEnabled: true } });
    await db.partnerStatement.create({
      data: { partnerId: p.id, reference: "FV-RL-AAAAAA-A", periodStart: new Date("2026-09-01"), periodEnd: new Date("2026-09-30"), currency: "MAD", collectedCents: 10000, commissionsCents: 0, feesCents: 500, balanceCents: 9500, dueAt: new Date("2026-10-16"), createdAt: new Date(Date.now() - 31 * 86_400_000) },
    });
    expect((await c.post("/api/partner/collection/collect", { reference })).body.error.code).toBe("statement_overdue");
  });

  it("réserve l'encaissement aux partenaires validés", async () => {
    const { c } = await partner({ status: "PENDING" });
    const o = await moroccan();
    const { reference } = (await o.client.post("/api/app/billing/offline", { planCode: "starter" })).body;
    expect((await c.post("/api/partner/collection/collect", { reference })).status).toBe(403);
    const merchant = await moroccan();
    expect((await merchant.client.post("/api/partner/collection/collect", { reference })).status).toBeGreaterThanOrEqual(400);
  });
});
