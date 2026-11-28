import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { db, ownerWithTenant, resetDatabase, startApp, uniq } from "./helpers";
import { PartnersService } from "../src/partners/partners.service";

/** Réglages partenaires appliqués : durée du cookie d'attribution et fenêtre de conversion. */
let app: NestExpressApplication;
const DAY = 86_400_000;

beforeAll(async () => {
  await resetDatabase();
  app = await startApp({ STRIPE_SECRET_KEY: undefined });
});
afterAll(async () => {
  await app.close();
});

async function partner() {
  return db.partner.create({ data: { name: "Agent", email: `${uniq("agent")}@test.fove`, code: uniq("AG").toUpperCase(), status: "ACTIVE", country: "FR" } });
}

describe("réglages partenaires", () => {
  it("le lien partenaire reçoit la durée du cookie réglée dans l'administration", async () => {
    const partners = app.get(PartnersService);
    await partners.adminUpdateSettings({ ...(await partners.getSettings()), defaultCommissionRatePercent: 20, cookieAttributionDays: 45 } as never, { user: { id: "00000000-0000-0000-0000-000000000000" } } as never);
    const p = await partner();
    expect(await partners.trackClick(p.code, {})).toMatchObject({ found: true, cookieDays: 45 });
    expect(await partners.trackClick("INCONNU999", {})).toMatchObject({ found: false });
  });

  it("fenêtre de conversion : pas de commission si le premier paiement arrive après la fenêtre", async () => {
    const partners = app.get(PartnersService);
    await partners.adminUpdateSettings({ ...(await partners.getSettings()), defaultCommissionRatePercent: 20, conversionWindowDays: 90 } as never, { user: { id: "00000000-0000-0000-0000-000000000000" } } as never);
    const p = await partner();
    const pay = async (tenantId: string) => {
      const payment = await db.payment.create({ data: { reference: uniq("PAY-"), tenantId, provider: "MANUAL", amountCents: 10000, netCents: 10000, currency: "EUR", status: "SUCCEEDED" } });
      await partners.handlePaymentConfirmed({ id: payment.id, tenantId, amountCents: 10000, feeCents: 0, netCents: 10000, currency: "EUR" });
    };

    const late = await ownerWithTenant(app, { plan: "free" });
    await db.acquisitionAttribution.create({ data: { tenantId: late.tenantId, partnerId: p.id, code: p.code, attributionSource: "COOKIE", conversionStatus: "REGISTERED", createdAt: new Date(Date.now() - 100 * DAY) } });
    await pay(late.tenantId);
    expect(await db.partnerCommission.count({ where: { tenantId: late.tenantId } })).toBe(0);

    const onTime = await ownerWithTenant(app, { plan: "free" });
    await db.acquisitionAttribution.create({ data: { tenantId: onTime.tenantId, partnerId: p.id, code: p.code, attributionSource: "COOKIE", conversionStatus: "REGISTERED", createdAt: new Date(Date.now() - 10 * DAY) } });
    await pay(onTime.tenantId);
    expect(await db.partnerCommission.count({ where: { tenantId: onTime.tenantId } })).toBe(1);
  });
});
