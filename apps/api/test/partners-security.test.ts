import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { agent, db, lastEmail, resetDatabase, startApp, uniq, type Client, signIn } from "./helpers";

let app: NestExpressApplication;
beforeAll(async () => {
  await resetDatabase();
  app = await startApp();
});
afterAll(() => app.close());

const newEmail = () => `${uniq("partner")}@test.fove`;

/** Inscription commerçant : session ouverte, email non confirmé. */
async function signup(email: string, verified = false) {
  const c = agent(app);
  await signIn(c, email, "Test");
  // Le code confirme l'email : un compte non confirmé est simulé (compte antérieur à la connexion par code).
  if (!verified) await db.user.update({ where: { email }, data: { emailVerifiedAt: null } });
  return c;
}

/** Candidature partenaire publique. */
async function apply(email: string, extra: Record<string, unknown> = {}, locale = "fr") {
  return request(app.getHttpServer())
    .post("/api/partners/apply")
    .set("accept-language", locale)
    .send({ name: "Agence Test", email, phone: "+243810000000", country: "CD", city: "Kinshasa", promotionStrategy: "Je recommande FOVE à mes clients commerçants.", acceptTerms: true, ...extra });
}

/** Partenaire validé et rattaché à un compte confirmé, avec un prospect. */
async function activePartnerWithLead() {
  const email = newEmail();
  const c = await signup(email, true);
  expect((await apply(email)).status).toBeLessThan(300);
  await db.partner.update({ where: { email }, data: { status: "ACTIVE" } });
  const lead = await c.post("/api/partner/leads", { businessName: "Boutique Prospect" });
  expect(lead.status).toBeLessThan(300);
  return { c, email, leadId: lead.body.id as string };
}

describe("espace partenaire : mise à jour d'un prospect", () => {
  it("n'écrit jamais au-delà du prospect (pas d'escalade vers super admin)", async () => {
    const { c, email, leadId } = await activePartnerWithLead();
    const res = await c.patch(`/api/partner/leads/${leadId}`, {
      businessName: "Nouveau nom",
      partner: { update: { user: { update: { isSuperAdmin: true, adminRole: "SUPER_ADMIN" } } } },
      partnerId: "00000000-0000-4000-8000-000000000000",
    });
    expect(res.status).toBe(200);
    expect(res.body.businessName).toBe("Nouveau nom");
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    expect(user.isSuperAdmin).toBe(false);
    expect(user.adminRole).toBeNull();
    expect((await c.get("/api/admin/tenants")).status).toBe(403);
  });

  it("ne permet pas de rattacher le compte d'un autre utilisateur", async () => {
    const { c, email, leadId } = await activePartnerWithLead();
    const victim = newEmail();
    await signup(victim, true);
    await c.patch(`/api/partner/leads/${leadId}`, { partner: { update: { user: { connect: { email: victim } } } } });
    const partner = await db.partner.findUniqueOrThrow({ where: { email } });
    const owner = await db.user.findUniqueOrThrow({ where: { email } });
    expect(partner.userId).toBe(owner.id);
  });

  it("refuse un statut inconnu", async () => {
    const { c, leadId } = await activePartnerWithLead();
    expect((await c.patch(`/api/partner/leads/${leadId}`, { status: "HACKED" })).status).toBe(400);
  });
});

describe("espace partenaire : rattachement d'un profil par email", () => {
  it("un compte non confirmé ne prend pas le profil d'un partenaire avec son email", async () => {
    const email = newEmail();
    await apply(email);
    await db.partner.update({ where: { email }, data: { status: "ACTIVE" } });
    // Quelqu'un crée un compte avec l'adresse du partenaire, sans la confirmer.
    const intrus = await signup(email);
    const res = await intrus.get("/api/partner/me");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("email_not_verified");
    expect((await db.partner.findUniqueOrThrow({ where: { email } })).userId).toBeNull();
    expect((await intrus.patch("/api/partner/profile", { payoutInfo: { iban: "FR76 INTRUS" } })).status).toBe(403);
  });

  it("une fois l'email confirmé, le titulaire récupère son profil", async () => {
    const email = newEmail();
    await apply(email);
    await db.partner.update({ where: { email }, data: { status: "ACTIVE" } });
    const c = await signup(email, true);
    expect((await c.get("/api/partner/me")).status).toBe(200);
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    expect((await db.partner.findUniqueOrThrow({ where: { email } })).userId).toBe(user.id);
  });

  it("la candidature ne lie pas un compte existant non confirmé", async () => {
    const email = newEmail();
    await signup(email);
    expect((await apply(email)).status).toBeLessThan(300);
    expect((await db.partner.findUniqueOrThrow({ where: { email } })).userId).toBeNull();
  });

  it("ne renvoie jamais le profil partenaire rattaché à un autre compte", async () => {
    const owner = newEmail();
    const ownerClient: Client = await signup(owner, true);
    await apply(owner);
    await db.partner.update({ where: { email: owner }, data: { status: "ACTIVE" } });
    expect((await ownerClient.get("/api/partner/me")).status).toBe(200);
    // Le profil porte maintenant l'email d'un autre compte confirmé, mais reste rattaché au premier.
    const other = newEmail();
    const otherClient = await signup(other, true);
    await db.partner.update({ where: { email: owner }, data: { email: other } });
    expect((await otherClient.get("/api/partner/me")).status).toBe(403);
  });
});

describe("candidature partenaire : email de confirmation", () => {
  it("échappe le HTML saisi par le candidat", async () => {
    const email = newEmail();
    const res = await apply(email, { name: "X</strong><a href=https://evil.example>Compte suspendu</a>", city: "<b>Ville</b>" });
    expect(res.status).toBeLessThan(300);
    const html = (await lastEmail(email))!.html!;
    expect(html).not.toContain("<a href=https://evil.example>");
    // Le balisage saisi reste du texte (une adresse seule peut devenir un lien, jamais une balise).
    expect(html).toContain("X&lt;/strong&gt;&lt;a href=");
    expect(html).toContain("suspendu&lt;/a&gt;");
    // Notification interne à l'équipe : mêmes protections.
    const team = await db.emailOutbox.findFirstOrThrow({ where: { to: "contact@fove.digital", text: { contains: email } }, orderBy: { createdAt: "desc" } });
    expect(team.subject).toMatch(/^\[FOVE · Partenaires\]/);
    expect(team.html).toContain("&lt;b&gt;Ville&lt;/b&gt;");
    expect(team.html).not.toContain("<b>Ville</b>");
  });
});
