import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { agent, db, ownerWithTenant, resetDatabase, startApp, uniq, signIn } from "./helpers";
import { pickAttribution, ReferralService } from "../src/referrals/referral.service";
import { BillingService } from "../src/billing/billing.service";
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
  if (!attribution.reuse) await signIn(client, email, "Filleul");
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

const DAY = 86_400_000;

/** Parrain (offre donnée, email confirmé) et un filleul inscrit par son lien, puis abonné en annuel (mode simulé). */
async function referredAndPaid(parrainPlan = "business") {
  const parrain = await ownerWithTenant(app, { plan: parrainPlan });
  const slug = (await db.tenant.findUniqueOrThrow({ where: { id: parrain.tenantId } })).slug;
  const filleul = await newTenant({ referrerSlug: slug });
  const checkout = await filleul.client.post("/api/app/billing/checkout", { planCode: "starter", interval: "YEAR" });
  expect(checkout.status).toBe(201);
  const referral = await db.referralReward.findUniqueOrThrow({ where: { referredTenantId: filleul.tenantId } });
  return { parrain, filleul, referral };
}

const referrals = () => app.get(ReferralService);
const usdPrice = async (code: string) => (await db.planPrice.findFirstOrThrow({ where: { plan: { code }, currency: "USD" } })).yearlyCents;
const reload = (id: string) => db.referralReward.findUniqueOrThrow({ where: { id } });

describe("parrainage : récompenses (mode simulé)", () => {
  it("le filleul paie 20 $ de moins ; le crédit du parrain attend 14 jours puis est acquis pour 3 ans", async () => {
    const { filleul, referral } = await referredAndPaid();
    const payment = await db.payment.findFirstOrThrow({ where: { tenantId: filleul.tenantId } });
    expect(payment.amountCents).toBe((await usdPrice("starter")) - 2000);
    expect(referral.status).toBe("PENDING");
    expect(referral.refereeDiscountUsedAt).not.toBeNull();
    expect(referral.pendingUntil!.getTime() - payment.confirmedAt!.getTime()).toBe(14 * DAY);

    await referrals().processDue(new Date(Date.now() + 13 * DAY));
    expect((await reload(referral.id)).status).toBe("PENDING");
    const at = new Date(Date.now() + 15 * DAY);
    await referrals().processDue(at);
    const earned = await reload(referral.id);
    expect(earned).toMatchObject({ status: "EARNED", creditAmountCents: 2000, creditRemainingCents: 2000 });
    expect(earned.expiresAt!.getUTCFullYear()).toBe(at.getUTCFullYear() + 3);
  });

  it("le crédit est déduit du renouvellement du parrain, le plus ancien d'abord", async () => {
    const { parrain, referral } = await referredAndPaid();
    await referrals().processDue(new Date(Date.now() + 15 * DAY));
    await db.subscription.update({ where: { tenantId: parrain.tenantId }, data: { provider: "MOCK", currentPeriodEnd: new Date(Date.now() - 1000) } });
    await app.get(BillingService).closeExpired(new Date());

    const renewal = await db.payment.findFirstOrThrow({ where: { tenantId: parrain.tenantId }, orderBy: { createdAt: "desc" } });
    expect(renewal.amountCents).toBe((await usdPrice("business")) - 2000);
    expect(await reload(referral.id)).toMatchObject({ creditRemainingCents: 0, creditUsedCents: 2000 });
    expect(await db.referralCreditUse.findFirst({ where: { rewardId: referral.id, paymentId: renewal.id, amountCents: 2000 } })).not.toBeNull();
  });

  it("un remboursement ou une résiliation pendant l'attente annule le crédit (le filleul garde sa remise)", async () => {
    const refunded = await referredAndPaid();
    await db.payment.updateMany({ where: { id: refunded.referral.triggerPaymentId! }, data: { amountRefundedCents: 500 } });
    const cancelled = await referredAndPaid();
    await db.subscription.update({ where: { tenantId: cancelled.filleul.tenantId }, data: { cancelAtPeriodEnd: true } });

    await referrals().processDue(new Date(Date.now() + 15 * DAY));
    expect(await reload(refunded.referral.id)).toMatchObject({ status: "CANCELLED", cancelReason: "refunded", creditAmountCents: 0 });
    expect(await reload(cancelled.referral.id)).toMatchObject({ status: "CANCELLED", cancelReason: "cancelled" });
  });

  it("parrain repassé en Gratuit : rien pour lui, la remise du filleul est maintenue", async () => {
    const { parrain, referral } = await referredAndPaid();
    const free = await db.subscriptionPlan.findUniqueOrThrow({ where: { code: "free" } });
    await db.subscription.update({ where: { tenantId: parrain.tenantId }, data: { planId: free.id } });
    await referrals().processDue(new Date(Date.now() + 15 * DAY));
    expect(await reload(referral.id)).toMatchObject({ status: "NO_PLAN", creditAmountCents: 0 });
    expect(referral.refereeDiscountUsedAt).not.toBeNull();
  });

  it("plafond de l'année civile : crédit partiel jusqu'au plafond, puis « hors plafond » ; l'année passée ne compte pas", async () => {
    const first = await referredAndPaid("starter");
    const cap = Math.min(20000, (await usdPrice("starter")));
    const at = new Date(Date.now() + 15 * DAY);
    // Déjà gagné cette année : le plafond moins 500 ; et un gros crédit l'an dernier, qui ne compte pas.
    const lastYear = new Date(Date.UTC(at.getUTCFullYear() - 1, 5, 1));
    for (const [amount, earnedAt] of [[cap - 500, at], [cap, lastYear]] as const) {
      const other = await ownerWithTenant(app);
      await db.referralReward.create({ data: { referrerTenantId: first.parrain.tenantId, referredTenantId: other.tenantId, status: "EARNED", creditAmountCents: amount, creditRemainingCents: amount, earnedAt } });
    }
    await referrals().processDue(at);
    expect(await reload(first.referral.id)).toMatchObject({ status: "EARNED", creditAmountCents: 500 });

    // Filleul suivant du même parrain : plafond atteint.
    const slug = (await db.tenant.findUniqueOrThrow({ where: { id: first.parrain.tenantId } })).slug;
    const second = await newTenant({ referrerSlug: slug });
    await second.client.post("/api/app/billing/checkout", { planCode: "starter", interval: "YEAR" });
    const secondReferral = await db.referralReward.findUniqueOrThrow({ where: { referredTenantId: second.tenantId } });
    await referrals().processDue(at);
    expect(await reload(secondReferral.id)).toMatchObject({ status: "CAPPED", creditAmountCents: 0 });
    // Le filleul hors plafond a bien eu sa remise.
    expect(secondReferral.refereeDiscountUsedAt).not.toBeNull();
  });

  it("même carte bancaire que le parrain : parrainage annulé", async () => {
    const parrain = await ownerWithTenant(app);
    const slug = (await db.tenant.findUniqueOrThrow({ where: { id: parrain.tenantId } })).slug;
    const filleul = await newTenant({ referrerSlug: slug });
    await db.payment.create({ data: { reference: uniq("PAY-"), tenantId: parrain.tenantId, amountCents: 100, netCents: 100, status: "SUCCEEDED", cardFingerprint: "fp_meme_carte" } });
    const payment = await db.payment.create({ data: { reference: uniq("PAY-"), tenantId: filleul.tenantId, amountCents: 100, netCents: 100, status: "SUCCEEDED", cardFingerprint: "fp_meme_carte" } });
    await referrals().onPaymentConfirmed(payment);
    expect(await db.referralReward.findUniqueOrThrow({ where: { referredTenantId: filleul.tenantId } })).toMatchObject({ status: "CANCELLED", cancelReason: "same_card" });
  });

  it("un crédit non utilisé expire au bout de 3 ans", async () => {
    const { referral } = await referredAndPaid();
    await referrals().processDue(new Date(Date.now() + 15 * DAY));
    await referrals().processDue(new Date(Date.now() + (15 + 3 * 366) * DAY));
    expect(await reload(referral.id)).toMatchObject({ status: "EXPIRED", creditRemainingCents: 0 });
  });

  it("la remise du filleul ne s'applique qu'une fois", async () => {
    const { filleul } = await referredAndPaid();
    expect(await referrals().refereeDiscount(filleul.tenantId, "USD")).toBe(0);
  });
});

describe("page « Parrainage »", () => {
  it("offre payante : lien, filleuls et plafond de l'année ; Gratuit : pas de lien", async () => {
    const parrain = await ownerWithTenant(app, { plan: "business" });
    const slug = (await db.tenant.findUniqueOrThrow({ where: { id: parrain.tenantId } })).slug;
    const filleul = await newTenant({ referrerSlug: slug });

    const res = await parrain.client.get("/api/app/referrals");
    expect(res.status).toBe(200);
    expect(res.body.available).toBe(true);
    expect(res.body.link).toMatch(new RegExp(`/signup\\?ref=${slug}$`));
    expect(res.body.referrals).toEqual([expect.objectContaining({ status: "SIGNED_UP", amountCents: 0 })]);
    expect(res.body.year).toMatchObject({ capCents: Math.min(20000, (await usdPrice("business"))) });

    // Le filleul voit sa remise jusqu'à son premier paiement.
    expect((await filleul.client.get("/api/app/referrals")).body.asReferee).toMatchObject({ discountCents: 2000 });
    await filleul.client.post("/api/app/billing/checkout", { planCode: "starter", interval: "YEAR" });
    expect((await filleul.client.get("/api/app/referrals")).body.asReferee).toBeNull();

    const free = await ownerWithTenant(app, { plan: "free" });
    const locked = (await free.client.get("/api/app/referrals")).body;
    expect(locked).toMatchObject({ available: false, link: null });
  });
});

describe("invitation au programme partenaires", () => {
  /** Ajoute au parrain un crédit déjà acquis cette année (filleul fictif). */
  async function earned(referrerTenantId: string, amount: number, at: Date) {
    const other = await ownerWithTenant(app);
    await db.referralReward.create({ data: { referrerTenantId, referredTenantId: other.tenantId, status: "EARNED", creditAmountCents: amount, creditRemainingCents: amount, earnedAt: at } });
  }
  const invites = (to: string) => db.emailOutbox.findMany({ where: { to, OR: [{ subject: { contains: "plafond de parrainage" } }, { subject: { contains: "Plafond de parrainage" } }] } });

  it("à 80 % du plafond puis au plafond : encart sur la page et un email par palier", async () => {
    const first = await referredAndPaid("starter");
    const parrainId = first.parrain.tenantId;
    const contact = (await db.tenantSettings.findUniqueOrThrow({ where: { tenantId: parrainId } })).contactEmail!;
    const { cap } = await referrals().yearlyCap(parrainId);
    const at = new Date(Date.now() + 15 * DAY);
    await earned(parrainId, Math.ceil(cap * 0.8) - 2000, at);

    await referrals().processDue(at); // + 20 $ : franchit les 80 %
    expect(await referrals().partnerInvite(parrainId, at)).toBe("approaching");
    expect((await invites(contact)).map((m) => m.subject)).toEqual(["Vous approchez de votre plafond de parrainage"]);

    await earned(parrainId, cap, at);
    const slug = (await db.tenant.findUniqueOrThrow({ where: { id: parrainId } })).slug;
    const second = await newTenant({ referrerSlug: slug });
    await second.client.post("/api/app/billing/checkout", { planCode: "starter", interval: "YEAR" });
    await referrals().processDue(at); // hors plafond
    await referrals().processDue(at);
    expect(await referrals().partnerInvite(parrainId, at)).toBe("reached");
    const subjects = (await invites(contact)).map((m) => m.subject);
    expect(subjects).toHaveLength(2);
    expect(subjects).toContain("Plafond de parrainage atteint : devenez partenaire FOVE");
  });

  it("rien pour un commerçant déjà partenaire", async () => {
    const parrain = await ownerWithTenant(app, { plan: "business" });
    const { cap } = await referrals().yearlyCap(parrain.tenantId);
    await earned(parrain.tenantId, cap, new Date());
    expect(await referrals().partnerInvite(parrain.tenantId)).toBe("reached");
    await db.partner.create({ data: { name: "Moi", email: parrain.email, code: uniq("ME").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12), status: "ACTIVE" } });
    expect(await referrals().partnerInvite(parrain.tenantId)).toBeNull();
    expect((await parrain.client.get("/api/app/referrals")).body.partnerInvite).toBeNull();
  });
});

describe("admin Finance > Parrainages", () => {
  async function superAdmin() {
    const email = `${uniq("admin")}@test.fove`;
    await db.user.create({ data: { email, name: "Admin", isSuperAdmin: true, emailVerifiedAt: new Date() } });
    const c = agent(app);
    await signIn(c, email);
    return c;
  }

  it("liste avec totaux ; l'annulation retire le crédit non utilisé et exige un motif", async () => {
    const admin = await superAdmin();
    const { referral } = await referredAndPaid();
    await referrals().processDue(new Date(Date.now() + 15 * DAY));

    const list = await admin.get("/api/admin/finance/referrals");
    expect(list.status).toBe(200);
    expect(list.body.items.find((r: { id: string }) => r.id === referral.id)).toMatchObject({ status: "EARNED", creditRemainingCents: 2000 });
    expect(list.body.remainingCents).toBeGreaterThanOrEqual(2000);

    expect((await admin.post(`/api/admin/finance/referrals/${referral.id}/cancel`, { reason: "" })).status).toBe(400);
    const cancel = await admin.post(`/api/admin/finance/referrals/${referral.id}/cancel`, { reason: "Comptes liés (fraude)" });
    expect(cancel.body).toEqual({ status: "CANCELLED", removedCents: 2000 });
    expect(await reload(referral.id)).toMatchObject({ status: "CANCELLED", creditRemainingCents: 0, cancelReason: "admin: Comptes liés (fraude)" });
    expect((await admin.post(`/api/admin/finance/referrals/${referral.id}/cancel`, { reason: "encore" })).status).toBe(400);
  });

  it("réservé à l'équipe FOVE", async () => {
    const { client } = await ownerWithTenant(app);
    expect((await client.get("/api/admin/finance/referrals")).status).toBe(403);
  });
});
