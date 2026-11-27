import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { agent, db, lastEmail, ownerWithTenant, resetDatabase, setPlan, startApp, uniq, signIn } from "./helpers";
import { BillingEmailService, unpaidKey } from "../src/billing/billing-emails.service";
import { BillingService } from "../src/billing/billing.service";
import { PartnersService } from "../src/partners/partners.service";
import { TeamDigestService } from "../src/notifications/team-digest.service";

/**
 * Emails de suivi (docs/fonctionnalites.md, section 8) : deux gabarits distincts, l'un pour les
 * clients de FOVE, l'autre pour les notifications internes à l'équipe ; échéances d'abonnement,
 * partenaires, récapitulatif quotidien.
 */
let app: NestExpressApplication;
let admin: ReturnType<typeof agent>;
const DAY = 86_400_000;
const TEAM = "contact@fove.digital";

const emailsTo = (to: string) => db.emailOutbox.findMany({ where: { to }, orderBy: { createdAt: "asc" } });

beforeAll(async () => {
  await resetDatabase();
  app = await startApp({ STRIPE_SECRET_KEY: undefined });
  const email = `admin${Date.now()}@fove.test`;
  await db.user.create({ data: { email, name: "Admin", isSuperAdmin: true, emailVerifiedAt: new Date() } });
  admin = agent(app);
  await signIn(admin, email);
  // Notifications de l'équipe désactivées par défaut : activées pour ces tests.
  await db.teamNotificationSettings.create({ data: { id: "default", enabled: true } });
});
afterAll(async () => {
  await app.close();
});

describe("deux gabarits : clients et équipe FOVE", () => {
  it("le message de contact part à l'équipe, au gabarit interne", async () => {
    const from = `${uniq("visiteur")}@test.fove`;
    const res = await request(app.getHttpServer()).post("/api/public/contact").send({ name: "Visiteur", email: from, message: "Bonjour, je voudrais une démo de FOVE.", subject: "Démo" });
    expect(res.status).toBeLessThan(300);
    const team = await db.emailOutbox.findFirstOrThrow({ where: { to: TEAM, text: { contains: from } }, orderBy: { createdAt: "desc" } });
    expect(team.subject).toBe("[FOVE · Contact] Démo — Visiteur");
    expect(team.html).toContain("FOVE · ÉQUIPE");
    expect(team.html).toContain("Ne pas transférer à un client");
    expect(team.html).not.toContain("La fidélité qui rapproche");
  });

  it("le commerçant reçoit un email de bienvenue au gabarit de la marque, dans sa langue", async () => {
    const { email } = await ownerWithTenant(app, { plan: "free" });
    const welcome = await lastEmail(email);
    expect(welcome?.subject).toMatch(/^Bienvenue sur FOVE/);
    expect(welcome?.html).toContain("La fidélité qui rapproche");
    expect(welcome?.html).not.toContain("FOVE · ÉQUIPE");
  });
});

describe("abonnement : emails au commerçant", () => {
  it("activation, passage à une offre inférieure et résiliation (paiement simulé)", async () => {
    const { client, email } = await ownerWithTenant(app, { plan: "free" });
    expect((await client.post("/api/app/billing/checkout", { planCode: "business", interval: "YEAR" })).status).toBe(201);
    expect((await lastEmail(email))?.subject).toBe("Votre abonnement Business est actif");
    expect((await client.post("/api/app/billing/checkout", { planCode: "starter", interval: "YEAR" })).status).toBe(201);
    expect((await lastEmail(email))?.subject).toMatch(/^Passage à l'offre Starter le /);
    expect((await client.post("/api/app/billing/cancel")).status).toBeLessThan(300);
    expect((await lastEmail(email))?.subject).toMatch(/^Résiliation enregistrée : Business jusqu'au /);
  });

  it("rappels J-30 et J-7 d'un abonnement réglé par virement, une seule fois chacun, puis email de fin", async () => {
    const { tenantId, email } = await ownerWithTenant(app, { plan: "free" });
    const now = new Date();
    await setPlan(tenantId, "business", { provider: "OFFLINE", currency: "MAD", currentPeriodEnd: new Date(now.getTime() + 20 * DAY) });
    const emails = app.get(BillingEmailService);
    await emails.remindRenewals(now);
    await emails.remindRenewals(now);
    const reminders = (await emailsTo(email)).filter((e) => e.subject.startsWith("Votre abonnement Business se termine"));
    expect(reminders).toHaveLength(1);
    expect(reminders[0]!.text).toContain("dans 20 jours");

    // Six jours avant : rappel J-7.
    await emails.remindRenewals(new Date(now.getTime() + 14 * DAY));
    expect((await emailsTo(email)).filter((e) => e.subject.startsWith("Votre abonnement Business se termine"))).toHaveLength(2);

    // Échéance passée : retour au Gratuit et email de fin, une seule fois.
    await app.get(BillingService).closeExpired(new Date(now.getTime() + 21 * DAY));
    await app.get(BillingService).closeExpired(new Date(now.getTime() + 22 * DAY));
    const ended = (await emailsTo(email)).filter((e) => e.subject === "Votre offre Business est terminée");
    expect(ended).toHaveLength(1);
  });

  it("pas de rappel pour l'offre Gratuite ni pour un abonnement par carte", async () => {
    const { tenantId, email } = await ownerWithTenant(app, { plan: "free" });
    await setPlan(tenantId, "business", { provider: "STRIPE", currentPeriodEnd: new Date(Date.now() + 5 * DAY) });
    await app.get(BillingEmailService).remindRenewals();
    expect((await emailsTo(email)).some((e) => e.subject.includes("se termine"))).toBe(false);
  });

  it("rappel deux jours avant la fin d'un accès provisoire, avec la référence de paiement", async () => {
    await db.bankAccount.create({ data: { country: "*", currency: "MAD", beneficiary: "Dizayna" } });
    const { client, tenantId, email } = await ownerWithTenant(app, { plan: "free" });
    await client.post("/api/app/billing/currency", { currency: "MAD" });
    const res = await client.post("/api/app/billing/offline", { planCode: "business" });
    expect(res.status).toBeLessThan(300);
    const sub = await db.subscription.findUniqueOrThrow({ where: { tenantId } });
    const invoice = await db.invoice.findFirstOrThrow({ where: { tenantId, status: "OPEN", paymentReference: { not: null } } });
    const emails = app.get(BillingEmailService);
    await emails.remindProvisional(new Date(sub.provisionalUntil!.getTime() - 3 * DAY));
    expect((await emailsTo(email)).some((e) => e.subject.startsWith("Votre accès provisoire se termine"))).toBe(false);
    await emails.remindProvisional(new Date(sub.provisionalUntil!.getTime() - DAY));
    await emails.remindProvisional(new Date(sub.provisionalUntil!.getTime() - DAY / 2));
    const reminders = (await emailsTo(email)).filter((e) => e.subject.startsWith("Votre accès provisoire se termine"));
    expect(reminders).toHaveLength(1);
    expect(reminders[0]!.text).toContain(invoice.paymentReference!);
  });

  it("fin du délai de grâce d'un impayé par carte : un seul email, même si Stripe résilie ensuite", async () => {
    const { tenantId, email } = await ownerWithTenant(app, { plan: "free" });
    const since = new Date(Date.now() - 10 * DAY);
    await setPlan(tenantId, "business", { provider: "STRIPE", status: "PAST_DUE", pastDueSince: since });
    const emails = app.get(BillingEmailService);
    expect(await emails.notifyGraceEnded()).toBeGreaterThanOrEqual(1);
    await emails.notifyGraceEnded();
    const sub = await db.subscription.findUniqueOrThrow({ where: { tenantId } });
    expect(await emails.ended(tenantId, "Business", true, unpaidKey(sub.id, since))).toBe(false);
    const ended = (await emailsTo(email)).filter((e) => e.subject === "Votre offre Business est terminée");
    expect(ended).toHaveLength(1);
    expect(ended[0]!.text).toContain("Faute de paiement");
  });
});

describe("partenaires : emails de suivi", () => {
  async function partnerWithCommission(payoutInfo: object | null) {
    const email = `${uniq("agent")}@test.fove`;
    const partner = await db.partner.create({
      data: { name: "Agent", email, code: uniq("AG").toUpperCase(), status: "ACTIVE", country: "FR", payoutCurrency: "EUR", ...(payoutInfo ? { payoutInfo } : {}) },
    });
    const o = await ownerWithTenant(app, { plan: "free" });
    await db.partnerCommission.create({
      data: { partnerId: partner.id, tenantId: o.tenantId, amountBaseCents: 50000, commissionRatePercent: 20, commissionAmountCents: 10000, currency: "EUR", status: "PENDING", availableAt: new Date(Date.now() - 60 * DAY) },
    });
    return { partner, email };
  }

  it("sans coordonnées bancaires : pas de versement, une seule demande de coordonnées par mois", async () => {
    const { partner, email } = await partnerWithCommission(null);
    const partners = app.get(PartnersService);
    await partners.scheduleMonthlyPayouts();
    await partners.scheduleMonthlyPayouts();
    expect(await db.partnerPayout.count({ where: { partnerId: partner.id } })).toBe(0);
    const asks = (await emailsTo(email)).filter((e) => e.subject === "Ajoutez vos coordonnées bancaires pour recevoir vos commissions");
    expect(asks).toHaveLength(1);
    expect(asks[0]!.text).toContain("100");
  });

  it("versement rejeté : le partenaire est prévenu avec le motif", async () => {
    const { partner, email } = await partnerWithCommission({ method: "BANK_TRANSFER", accountHolder: "Agent", iban: "FR7630006000011234567890189" });
    await app.get(PartnersService).scheduleMonthlyPayouts();
    const payout = await db.partnerPayout.findFirstOrThrow({ where: { partnerId: partner.id } });
    await admin.post(`/api/admin/partners/payouts/${payout.id}/process`, { status: "REJECTED", rejectionReason: "IBAN invalide" });
    const mail = await lastEmail(email);
    expect(mail?.subject).toMatch(/^Versement non effectué/);
    expect(mail?.text).toContain("IBAN invalide");
  });

  it("un commerce inscrit avec le lien du partenaire le prévient", async () => {
    const email = `${uniq("agent")}@test.fove`;
    const partner = await db.partner.create({ data: { name: "Agent", email, code: uniq("AG").toUpperCase(), status: "ACTIVE", country: "FR" } });
    const owner = agent(app);
    await signIn(owner, `${uniq("owner")}@test.fove`, "Owner");
    const slug = uniq("shop-");
    expect((await owner.post("/api/app/tenants", { name: "Boulangerie Amina", slug, partnerCode: partner.code })).status).toBe(201);
    expect((await lastEmail(email))?.subject).toBe("Boulangerie Amina s'est inscrit avec votre lien");
  });
});

describe("récapitulatif quotidien de l'équipe", () => {
  it("un envoi par jour à partir de 6 h UTC, avec les actions à mener", async () => {
    await db.contactMessage.create({ data: { name: "Prospect", email: `${uniq("p")}@test.fove`, message: "Rappelez-moi", subject: "Rappel" } });
    const digest = app.get(TeamDigestService);
    const day = new Date(Date.UTC(2030, 0, 15, 5, 0));
    expect(await digest.sendDaily(day)).toBeNull();
    const total = await digest.sendDaily(new Date(Date.UTC(2030, 0, 15, 7, 0)));
    expect(total).toBeGreaterThan(0);
    expect(await digest.sendDaily(new Date(Date.UTC(2030, 0, 15, 9, 0)))).toBeNull();
    const mail = await db.emailOutbox.findFirstOrThrow({ where: { to: TEAM, subject: { startsWith: "[FOVE · Récapitulatif]" } }, orderBy: { createdAt: "desc" } });
    expect(mail.text).toContain("Messages de contact non traités");
    expect(mail.text).toContain("Prospect");
  });
});

describe("réglages des notifications de l'équipe (Admin > Système)", () => {
  const contact = (from: string) =>
    request(app.getHttpServer()).post("/api/public/contact").send({ name: "Visiteur", email: from, message: "Bonjour, une question sur FOVE.", subject: "Question" });
  const teamMails = (from: string) => db.emailOutbox.findMany({ where: { text: { contains: from }, subject: { startsWith: "[FOVE · Contact]" } } });
  const put = (body: object) => admin.put("/api/admin/team-notifications", { enabled: true, recipients: [], partners: true, contact: true, digest: true, ...body });

  it("désactivées : rien ne part ; un type coupé ne part pas ; plusieurs destinataires", async () => {
    expect((await put({ enabled: false })).status).toBe(200);
    const a = `${uniq("v")}@test.fove`;
    await contact(a);
    expect(await teamMails(a)).toHaveLength(0);

    await put({ contact: false });
    const b = `${uniq("v")}@test.fove`;
    await contact(b);
    expect(await teamMails(b)).toHaveLength(0);

    const res = await put({ recipients: ["Ops@Fove.digital", "direction@fove.digital", "ops@fove.digital"] });
    expect(res.body.effectiveRecipients).toEqual(["ops@fove.digital", "direction@fove.digital"]);
    const c = `${uniq("v")}@test.fove`;
    await contact(c);
    expect((await teamMails(c)).map((m) => m.to).sort()).toEqual(["direction@fove.digital", "ops@fove.digital"]);
    await put({});
  });

  it("récapitulatif coupé : pas d'envoi, il reprend à la réactivation", async () => {
    const digest = app.get(TeamDigestService);
    await put({ digest: false });
    expect(await digest.sendDaily(new Date(Date.UTC(2031, 2, 3, 8)))).toBeNull();
    await put({});
    expect(await digest.sendDaily(new Date(Date.UTC(2031, 2, 3, 9)))).not.toBeNull();
  });

  it("email de test envoyé même désactivé ; réservé au super admin ; adresses vérifiées", async () => {
    await put({ enabled: false });
    const res = await admin.post("/api/admin/team-notifications/test", {});
    expect(res.status).toBe(200);
    expect(res.body.sentTo).toEqual([TEAM]);
    expect((await lastEmail(TEAM))?.subject).toBe("[FOVE · Récapitulatif] Email de test");
    expect((await put({ recipients: ["pas-une-adresse"] })).status).toBe(400);
    const { client } = await ownerWithTenant(app, { plan: "free" });
    expect((await client.get("/api/admin/team-notifications")).status).toBe(403);
    await put({});
  });
});
