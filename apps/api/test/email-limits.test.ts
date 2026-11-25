import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { createCustomerWithCard, createPointsProgram, db, earn, ownerWithTenant, randomPhone, resetDatabase, selfEnroll, startApp, uniq } from "./helpers";

let app: NestExpressApplication;
beforeAll(async () => {
  await resetDatabase();
  app = await startApp();
});
afterAll(() => app.close());

/** Remplit le fichier clients jusqu'à `count` fiches. */
async function fillCustomers(tenantId: string, count: number) {
  const existing = await db.customer.count({ where: { tenantId } });
  await db.customer.createMany({ data: Array.from({ length: count - existing }, (_, i) => ({ tenantId, firstName: `Rempli${i}` })) });
}

const blocked = (res: { status: number; body: { error?: { code?: string } } }) => {
  expect(res.status).toBe(403);
  expect(res.body.error?.code).toBe("email_not_verified");
};

describe("propriétaire à l'email non confirmé : la grille", () => {
  it("bloque équipe, export, import, envois groupés et connecteur boutique", async () => {
    const o = await ownerWithTenant(app, { verified: false });
    const program = await createPointsProgram(o.client);
    const { customerId } = await createCustomerWithCard(o.client, program.id);

    blocked(await o.client.post("/api/app/team/invitations", { email: `${uniq("inv")}@test.fove`, role: "CASHIER" }));
    blocked(await o.client.get(`/api/app/customers/${customerId}/export`));
    blocked(await o.client.post("/api/app/customers/import", { rows: [{ firstName: "Imp", phone: randomPhone() }] }));
    blocked(await o.client.post(`/api/app/programs/${program.id}/wallet-broadcast`, { title: "Promo", body: "Bonjour" }));
    blocked(await o.client.post("/api/app/wallet-broadcast", { title: "Promo", body: "Bonjour" }));
    blocked(await o.client.post("/api/app/integrations/connections", { provider: "SHOPIFY", shopDomain: "x.myshopify.com", secret: "s".repeat(32) }));
  });

  it("laisse libre l'usage simple : programme, caisse, crédit, abonnement", async () => {
    const o = await ownerWithTenant(app, { verified: false });
    const program = await createPointsProgram(o.client);
    const { accountId } = await createCustomerWithCard(o.client, program.id);
    expect((await earn(o.client, accountId, "5000")).status).toBe(201);
    expect((await o.client.post("/api/app/billing/checkout", { planCode: "starter", interval: "YEAR" })).status).toBe(201);
  });

  it("une fois l'email confirmé, tout se débloque", async () => {
    const o = await ownerWithTenant(app, { verified: false });
    blocked(await o.client.post("/api/app/team/invitations", { email: `${uniq("inv")}@test.fove`, role: "CASHIER" }));
    await db.user.update({ where: { email: o.email }, data: { emailVerifiedAt: new Date() } });
    expect((await o.client.post("/api/app/team/invitations", { email: `${uniq("inv")}@test.fove`, role: "CASHIER" })).status).toBeLessThan(300);
  });
});

describe("limite douce : 50 clients sans propriétaire confirmé", () => {
  it("refuse le 51e client en caisse, mais jamais un crédit", async () => {
    const o = await ownerWithTenant(app, { verified: false });
    const program = await createPointsProgram(o.client);
    const { accountId } = await createCustomerWithCard(o.client, program.id);
    await fillCustomers(o.tenantId, 50);

    blocked(await o.client.post("/api/app/customers", { firstName: "Cinquante-et-un", phone: randomPhone() }));
    expect((await earn(o.client, accountId, "2000")).status).toBe(201);

    await db.user.update({ where: { email: o.email }, data: { emailVerifiedAt: new Date() } });
    expect((await o.client.post("/api/app/customers", { firstName: "Cinquante-et-un", phone: randomPhone() })).status).toBe(201);
  });

  it("au QR : « inscriptions fermées » pour le client, alerte (une fois par jour) pour le commerçant", async () => {
    const o = await ownerWithTenant(app, { verified: false });
    const program = await createPointsProgram(o.client);
    const token = ((await o.client.get("/api/app/enrollment-links")).body as { token: string; programId: string }[]).find((l) => l.programId === program.id)!.token;
    await fillCustomers(o.tenantId, 50);
    const contact = (await db.tenantSettings.findUniqueOrThrow({ where: { tenantId: o.tenantId } })).contactEmail!;

    const res = await selfEnroll(app, token, { firstName: "Refusé", acceptTerms: true });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("enrollment_closed");
    // Le client ne voit rien du compte du commerçant.
    expect(JSON.stringify(res.body)).not.toMatch(/email|confirm/i);
    await selfEnroll(app, token, { firstName: "Refusé2", acceptTerms: true });

    const alerts = await db.emailOutbox.findMany({ where: { to: contact, subject: { contains: "n'a pas pu rejoindre" } } });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.text).toMatch(/50 clients/);
    expect(alerts[0]!.text).toMatch(/n'est pas encore confirmée/);
  });

  it("ne concerne pas un commerce dont un propriétaire a confirmé son email", async () => {
    const o = await ownerWithTenant(app);
    await fillCustomers(o.tenantId, 50);
    expect((await o.client.post("/api/app/customers", { firstName: "Libre", phone: randomPhone() })).status).toBe(201);
  });
});
