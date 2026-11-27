import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { agent, db, lastEmail, ownerWithTenant, resetDatabase, signIn, startApp, uniq } from "./helpers";

/** Espaces d'un compte (administration, commerçant, partenaire) et arrivée après connexion. */
let app: NestExpressApplication;
beforeAll(async () => {
  await resetDatabase();
  app = await startApp();
});
afterAll(() => app.close());

async function superAdmin() {
  const email = `${uniq("admin")}@test.fove`;
  await db.user.create({ data: { email, name: "Admin", isSuperAdmin: true, emailVerifiedAt: new Date() } });
  const c = agent(app);
  await signIn(c, email);
  return c;
}

describe("espaces et arrivée", () => {
  it("un partenaire sans commerce arrive dans son espace partenaire, même à sa première connexion", async () => {
    const email = `${uniq("p")}@test.fove`;
    await db.partner.create({ data: { name: "Agence", email, code: uniq("AG").toUpperCase(), status: "APPROVED" } });
    const res = await signIn(agent(app), email, "Agence");
    expect(res.body).toMatchObject({ status: "signed_in", created: true, home: "/partner" });
  });

  it("un commerçant partenaire arrive sur son commerce et voit ses deux espaces", async () => {
    const o = await ownerWithTenant(app);
    await db.partner.create({ data: { name: "Moi", email: o.email, code: uniq("ME").toUpperCase(), status: "ACTIVE" } });
    const me = (await o.client.get("/api/auth/me")).body;
    expect(me.spaces).toEqual({ admin: false, merchant: true, partner: true });
    expect(me.home).toBe("/app");
    expect((await signIn(agent(app), o.email)).body.home).toBe("/app");
  });

  it("une candidature refusée ne donne pas d'espace partenaire", async () => {
    const email = `${uniq("p")}@test.fove`;
    await db.partner.create({ data: { name: "Refusé", email, code: uniq("RF").toUpperCase(), status: "REJECTED" } });
    const c = agent(app);
    expect((await signIn(c, email, "Refusé")).body.home).toBe("/app");
    expect((await c.get("/api/auth/me")).body.spaces.partner).toBe(false);
  });

  it("un admin arrive dans l'administration", async () => {
    const c = await superAdmin();
    expect((await c.get("/api/auth/me")).body).toMatchObject({ spaces: { admin: true }, home: "/admin" });
  });
});

describe("partenaire créé par l'admin", () => {
  it("reçoit l'email d'invitation, et son compte existant est rattaché", async () => {
    const admin = await superAdmin();
    const email = `${uniq("p")}@test.fove`;
    const existing = agent(app);
    await signIn(existing, email, "Déjà client");
    const code = uniq("NEW").toUpperCase();
    const res = await admin.post("/api/admin/finance/partners", { name: "Nouveau partenaire", email, code, commissionRatePercent: 15 });
    expect(res.status).toBeLessThan(300);
    const mail = await lastEmail(email);
    expect(mail?.text).toContain(code);
    expect(mail?.text).toContain("/partner");
    expect(mail?.html).toContain('bgcolor="#14204A"');
    const partner = await db.partner.findUniqueOrThrow({ where: { email } });
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    expect(partner.userId).toBe(user.id);
    expect(user.isPartner).toBe(true);
    expect((await existing.get("/api/partner/me")).status).toBe(200);
  });
});
