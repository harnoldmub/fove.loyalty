import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { createCustomerWithCard, createPointsProgram, db, ownerWithTenant, resetDatabase, startApp, uniq } from "./helpers";
import { ClientAccountService } from "../src/client-account/client-account.service";
import { parseBirthday } from "../src/customers/customers.service";

/** Relances et anniversaire, lot R1 (docs/chantier-relances-anniversaire.md). */
let app: NestExpressApplication;

beforeAll(async () => {
  await resetDatabase();
  app = await startApp({ STRIPE_SECRET_KEY: undefined });
});
afterAll(async () => {
  await app.close();
});

describe("anniversaire du client", () => {
  it("saisi, modifié et effacé sur la fiche ; jamais une date impossible", async () => {
    const { client } = await ownerWithTenant(app);
    const created = await client.post("/api/app/customers", { firstName: "Awa", phone: "+243810000001", birthDay: 12, birthMonth: 3 });
    expect(created.status).toBe(201);
    const id = created.body.customer.id as string;
    expect((await client.get(`/api/app/customers/${id}`)).body).toMatchObject({ birthDay: 12, birthMonth: 3 });
    expect((await client.patch(`/api/app/customers/${id}`, { birthDay: 31, birthMonth: 4 })).status).toBe(400);
    expect((await client.patch(`/api/app/customers/${id}`, { birthDay: 29, birthMonth: 2 })).status).toBe(200);
    expect((await client.patch(`/api/app/customers/${id}`, { birthDay: null, birthMonth: null })).status).toBe(200);
    expect((await client.get(`/api/app/customers/${id}`)).body).toMatchObject({ birthDay: null, birthMonth: null });
  });

  it("import : colonne anniversaire lue (jour et mois seulement)", async () => {
    expect(parseBirthday("12/03")).toEqual({ birthDay: 12, birthMonth: 3 });
    expect(parseBirthday("12/03/1990")).toEqual({ birthDay: 12, birthMonth: 3 });
    expect(parseBirthday("1990-03-12")).toEqual({ birthDay: 12, birthMonth: 3 });
    expect(parseBirthday("31/04")).toEqual({});
    const { client, tenantId } = await ownerWithTenant(app);
    const res = await client.post("/api/app/customers/import", { rows: [{ prenom: "Léa", telephone: "+243810000002", anniversaire: "05/11" }, { prenom: "Max", telephone: "+243810000003", anniversaire: "n'importe" }] });
    expect(res.status).toBeLessThan(300);
    const lea = await db.customer.findFirstOrThrow({ where: { tenantId, firstName: "Léa" } });
    const max = await db.customer.findFirstOrThrow({ where: { tenantId, firstName: "Max" } });
    expect([lea.birthDay, lea.birthMonth]).toEqual([5, 11]);
    expect(max.birthDay).toBeNull();
  });

  it("« Mes cartes » : l'anniversaire du compte est recopié sur les fiches des commerces", async () => {
    const { tenantId } = await ownerWithTenant(app);
    const account = await db.clientAccount.create({ data: { email: `${uniq("client")}@test.fove`, emailVerifiedAt: new Date(), firstName: "Inès" } });
    const fiche = await db.customer.create({ data: { tenantId, firstName: "Inès", email: account.email, clientAccountId: account.id } });
    const view = await app.get(ClientAccountService).updateProfile(account.id, { firstName: "Inès", lastName: "", phone: null, birthDay: 8, birthMonth: 6 });
    expect(view).toMatchObject({ birthDay: 8, birthMonth: 6 });
    expect(await db.customer.findUniqueOrThrow({ where: { id: fiche.id } })).toMatchObject({ birthDay: 8, birthMonth: 6 });
  });

  it("client effacé : anniversaire effacé aussi", async () => {
    const { client } = await ownerWithTenant(app);
    const id = (await client.post("/api/app/customers", { firstName: "Zoé", phone: "+243810000004", birthDay: 1, birthMonth: 1 })).body.customer.id as string;
    expect((await client.post(`/api/app/customers/${id}/anonymize`)).status).toBeLessThan(300);
    expect(await db.customer.findUniqueOrThrow({ where: { id } })).toMatchObject({ birthDay: null, birthMonth: null });
  });
});

describe("établissements et cartes", () => {
  it("position GPS : les deux coordonnées ou aucune", async () => {
    const { client } = await ownerWithTenant(app);
    const ok = await client.post("/api/app/establishments", { name: "Boutique Gombe", latitude: -4.3217, longitude: 15.3125 });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ latitude: -4.3217, longitude: 15.3125 });
    expect((await client.post("/api/app/establishments", { name: "Sans longitude", latitude: 10 })).status).toBe(400);
    expect((await client.patch(`/api/app/establishments/${ok.body.id}`, { latitude: null, longitude: null })).status).toBe(200);
  });

  it("un message Wallet ne compte pas comme une activité (expiration des points)", async () => {
    const { client } = await ownerWithTenant(app);
    const program = await createPointsProgram(client);
    const { accountId } = await createCustomerWithCard(client, program.id);
    const old = new Date(Date.now() - 200 * 86_400_000);
    await db.loyaltyAccount.update({ where: { id: accountId }, data: { lastActivityAt: old, passUpdatedAt: old } });
    expect((await client.post(`/api/app/accounts/${accountId}/wallet-message`, { title: "Bonjour", body: "Un message pour vous" })).status).toBeLessThan(300);
    const after = await db.loyaltyAccount.findUniqueOrThrow({ where: { id: accountId } });
    expect(after.lastActivityAt.getTime()).toBe(old.getTime());
    expect(after.passUpdatedAt.getTime()).toBeGreaterThan(old.getTime());
  });
});
