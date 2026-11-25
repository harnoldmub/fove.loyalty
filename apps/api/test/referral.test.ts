import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { agent, db, ownerWithTenant, resetDatabase, startApp, uniq } from "./helpers";
import { pickAttribution } from "../src/referrals/referral.service";
import { PlanService } from "../src/billing/plan.service";

let app: NestExpressApplication;
beforeAll(async () => {
  await resetDatabase();
  app = await startApp();
});
afterAll(() => app.close());

/** Un commerçant qui s'inscrit et crée son commerce avec ce qu'il a dans ses cookies d'attribution. */
async function newTenant(attribution: Record<string, unknown> = {}, client = agent(app)) {
  const email = `${uniq("filleul")}@test.fove`;
  if (!attribution.reuse) expect((await client.post("/api/auth/signup", { name: "Filleul", email, password: "motdepasse123", acceptTerms: true })).status).toBe(201);
  const slug = uniq("shop-");
  const { reuse: _reuse, ...payload } = attribution;
  const res = await client.post("/api/app/tenants", { name: `Commerce ${slug}`, slug, ...payload });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return { client, tenantId: res.body.id as string };
}

async function activePartner() {
  const code = uniq("P").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  await db.partner.create({ data: { name: "Agence", email: `${uniq("agence")}@test.fove`, code, status: "ACTIVE" } });
  return code;
}

describe("règle « premier lien »", () => {
  it("un seul lien : il l'emporte ; aucun lien : personne", () => {
    expect(pickAttribution({ partnerCode: "P1" })).toBe("partner");
    expect(pickAttribution({ referrerSlug: "cafe-a" })).toBe("referral");
    expect(pickAttribution({})).toBeNull();
  });

  it("deux liens : le premier cliqué ; sans date, le plus ancien ; à égalité, le partenaire", () => {
    expect(pickAttribution({ partnerCode: "P1", partnerClickedAt: 2000, referrerSlug: "cafe-a", referrerClickedAt: 1000 })).toBe("referral");
    expect(pickAttribution({ partnerCode: "P1", partnerClickedAt: 1000, referrerSlug: "cafe-a", referrerClickedAt: 2000 })).toBe("partner");
    expect(pickAttribution({ partnerCode: "P1", partnerClickedAt: 2000, referrerSlug: "cafe-a" })).toBe("referral");
    expect(pickAttribution({ partnerCode: "P1", referrerSlug: "cafe-a" })).toBe("partner");
  });
});

describe("parrainage à l'inscription", () => {
  it("enregistre le filleul à l'état « inscrit », sans crédit", async () => {
    const parrain = await ownerWithTenant(app);
    const slug = (await db.tenant.findUniqueOrThrow({ where: { id: parrain.tenantId } })).slug;
    const clickedAt = Date.now() - 3_600_000;
    const { tenantId } = await newTenant({ referrerSlug: slug, referrerClickedAt: clickedAt });

    const reward = await db.referralReward.findUniqueOrThrow({ where: { referredTenantId: tenantId } });
    expect(reward).toMatchObject({ referrerTenantId: parrain.tenantId, status: "SIGNED_UP", creditAmountCents: 0, creditRemainingCents: 0, refereeDiscountCents: 2000 });
    expect(reward.clickedAt?.getTime()).toBe(clickedAt);
  });

  it("lien de parrainage cliqué avant le lien partenaire : seul le parrain est retenu", async () => {
    const parrain = await ownerWithTenant(app);
    const slug = (await db.tenant.findUniqueOrThrow({ where: { id: parrain.tenantId } })).slug;
    const code = await activePartner();
    const { tenantId } = await newTenant({ referrerSlug: slug, referrerClickedAt: Date.now() - 7_200_000, partnerCode: code, partnerClickedAt: Date.now() - 3_600_000 });
    expect(await db.referralReward.count({ where: { referredTenantId: tenantId } })).toBe(1);
    expect(await db.acquisitionAttribution.count({ where: { tenantId } })).toBe(0);
  });

  it("lien partenaire cliqué avant le lien de parrainage : seul le partenaire est retenu", async () => {
    const parrain = await ownerWithTenant(app);
    const slug = (await db.tenant.findUniqueOrThrow({ where: { id: parrain.tenantId } })).slug;
    const code = await activePartner();
    const { tenantId } = await newTenant({ referrerSlug: slug, referrerClickedAt: Date.now() - 3_600_000, partnerCode: code, partnerClickedAt: Date.now() - 7_200_000 });
    expect(await db.referralReward.count({ where: { referredTenantId: tenantId } })).toBe(0);
    expect(await db.acquisitionAttribution.count({ where: { tenantId } })).toBe(1);
  });

  it("un propriétaire ne parraine pas son propre nouveau commerce", async () => {
    const parrain = await ownerWithTenant(app);
    const slug = (await db.tenant.findUniqueOrThrow({ where: { id: parrain.tenantId } })).slug;
    const { tenantId } = await newTenant({ referrerSlug: slug, reuse: true }, parrain.client);
    expect(await db.referralReward.count({ where: { referredTenantId: tenantId } })).toBe(0);
    expect(await db.auditLog.count({ where: { action: "referral.excluded", targetId: tenantId } })).toBe(1);
  });

  it("ignore un lien de parrainage inconnu", async () => {
    const { tenantId } = await newTenant({ referrerSlug: "commerce-inexistant" });
    expect(await db.referralReward.count({ where: { referredTenantId: tenantId } })).toBe(0);
  });
});

describe("fonction d'offre « referral »", () => {
  it("incluse dans les offres payantes, absente du Gratuit", async () => {
    const plans = app.get(PlanService);
    const free = await ownerWithTenant(app, { plan: "free" });
    const business = await ownerWithTenant(app, { plan: "business" });
    expect((await plans.features(free.tenantId)).referral).toBe(false);
    expect((await plans.features(business.tenantId)).referral).toBe(true);
  });
});
