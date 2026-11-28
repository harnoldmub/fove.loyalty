import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { createCustomerWithCard, createPointsProgram, db, lastEmail, ownerWithTenant, resetDatabase, startApp, uniq, type Client } from "./helpers";
import { AutomationService } from "../src/automation/automation.service";

/** Relances automatiques (docs/chantier-relances-anniversaire.md, R2-R3). */
let app: NestExpressApplication;
const DAY = 86_400_000;
/** Midi à Kinshasa (UTC+1), fuseau par défaut des commerces de test. */
const noon = (offsetDays = 0) => new Date(Date.UTC(2031, 5, 10 + offsetDays, 11, 0));

beforeAll(async () => {
  await resetDatabase();
  app = await startApp({ STRIPE_SECRET_KEY: undefined });
});
afterAll(async () => {
  await app.close();
});

async function stampShop() {
  const owner = await ownerWithTenant(app);
  const program = await createPointsProgram(owner.client, { name: "Café", mode: "STAMPS", stampsTarget: 10, stampsPerPurchase: 1 });
  return { ...owner, programId: program.id };
}

async function cardWith(client: Client, programId: string, data: { balance: number; lastActivityDaysAgo: number; lastVisitDaysAgo?: number | null; createdDaysAgo?: number; email?: string | null; consent?: boolean }) {
  const { accountId, customerId } = await createCustomerWithCard(client, programId);
  const at = (d: number) => new Date(noon().getTime() - d * DAY);
  await db.loyaltyAccount.update({ where: { id: accountId }, data: { balance: data.balance, lastActivityAt: at(data.lastActivityDaysAgo) } });
  await db.customer.update({
    where: { id: customerId },
    data: {
      lastVisitAt: data.lastVisitDaysAgo === null ? null : at(data.lastVisitDaysAgo ?? data.lastActivityDaysAgo),
      totalVisits: 3,
      createdAt: at(data.createdDaysAgo ?? 200),
      email: data.email ?? null,
      marketingEmailConsent: data.consent ?? false,
    },
  });
  return { accountId, customerId };
}

const enable = (client: Client, kind: string, body: object = {}) => client.put(`/api/app/automations/${kind}`, { enabled: true, ...body });

describe("relances automatiques", () => {
  it("« plus qu'un passage » : message sur la carte, une seule fois, à l'heure du commerce", async () => {
    const { client, tenantId, programId } = await stampShop();
    const { accountId, customerId } = await cardWith(client, programId, { balance: 9, lastActivityDaysAgo: 3 });
    expect((await enable(client, "NEAR_REWARD")).status).toBe(200);
    const automation = app.get(AutomationService);

    // 7 h à Kinshasa : hors plage d'envoi.
    expect(await automation.runTenant(tenantId, new Date(Date.UTC(2031, 5, 10, 6, 0)))).toBeNull();
    expect(await automation.runTenant(tenantId, noon())).toBe(1);
    expect(await automation.runTenant(tenantId, new Date(noon().getTime() + 3_600_000))).toBeNull();
    expect(await automation.runTenant(tenantId, noon(1))).toBe(0);

    const msg = await db.customerMessage.findFirstOrThrow({ where: { customerId } });
    expect(msg).toMatchObject({ scenario: "NEAR_REWARD", channel: "WALLET" });
    expect(msg.body).toContain("1 tampon");
    const card = await db.loyaltyAccount.findUniqueOrThrow({ where: { id: accountId } });
    expect(card.lastWalletMessageTitle).toBe(msg.title);
  });

  it("récompense qui attend, puis plafond de 14 jours entre deux relances", async () => {
    const { client, tenantId, programId } = await stampShop();
    const { customerId } = await cardWith(client, programId, { balance: 10, lastActivityDaysAgo: 8 });
    await enable(client, "REWARD_WAITING");
    await enable(client, "AT_RISK");
    const automation = app.get(AutomationService);
    expect(await automation.runTenant(tenantId, noon())).toBe(1);
    expect((await db.customerMessage.findFirstOrThrow({ where: { customerId } })).scenario).toBe("REWARD_WAITING");
    // Utilise sa récompense puis s'absente : « en risque » mais encore sous le plafond de 14 jours.
    await db.loyaltyAccount.updateMany({ where: { customerId }, data: { balance: 2, lastActivityAt: new Date(noon().getTime() - 40 * DAY) } });
    await db.customer.update({ where: { id: customerId }, data: { lastVisitAt: new Date(noon().getTime() - 40 * DAY) } });
    expect(await automation.runTenant(tenantId, noon(5))).toBe(0);
    expect(await automation.runTenant(tenantId, noon(15))).toBe(1);
    expect(await db.customerMessage.count({ where: { customerId } })).toBe(2);
  });

  it("dormant : message seul par défaut, bonus de retour en option (crédité une fois)", async () => {
    const { client, tenantId, programId } = await stampShop();
    const { accountId, customerId } = await cardWith(client, programId, { balance: 4, lastActivityDaysAgo: 100 });
    await enable(client, "DORMANT", { bonus: 2 });
    const automation = app.get(AutomationService);
    expect(await automation.runTenant(tenantId, noon())).toBe(1);
    expect((await db.loyaltyAccount.findUniqueOrThrow({ where: { id: accountId } })).balance).toBe(6);
    const msg = await db.customerMessage.findFirstOrThrow({ where: { customerId } });
    expect(msg).toMatchObject({ scenario: "DORMANT", bonus: 2 });
    // Le bonus ne repousse pas l'expiration de façon répétée : une seule relance par période d'inactivité.
    expect(await automation.runTenant(tenantId, noon(20))).toBe(0);
  });

  it("email avec consentement (pas d'iPhone), lien de désinscription qui fonctionne", async () => {
    const { client, tenantId, programId } = await stampShop();
    const email = `${uniq("cliente")}@test.fove`;
    const { customerId } = await cardWith(client, programId, { balance: 9, lastActivityDaysAgo: 3, email, consent: true });
    await enable(client, "NEAR_REWARD", { title: "Coucou {prenom}", body: "Plus que {reste} chez {commerce} !" });
    expect(await app.get(AutomationService).runTenant(tenantId, noon())).toBe(1);
    expect((await db.customerMessage.findFirstOrThrow({ where: { customerId } })).channel).toBe("EMAIL");
    const mail = await lastEmail(email);
    expect(mail?.subject).toMatch(/^Coucou Awa · Commerce /);
    const link = /\/api\/public\/unsubscribe\/[^\s"<]+/.exec(mail!.text)![0];
    const res = await request(app.getHttpServer()).get(link);
    expect(res.status).toBe(200);
    expect((await db.customer.findUniqueOrThrow({ where: { id: customerId } })).marketingEmailConsent).toBe(false);
    expect((await request(app.getHttpServer()).get(`/api/public/unsubscribe/${customerId}/faux`)).text).toContain("Lien invalide");
  });

  it("offre Gratuite : pas d'activation, rien d'automatique", async () => {
    const owner = await ownerWithTenant(app, { plan: "free" });
    expect((await enable(owner.client, "NEAR_REWARD")).status).toBe(402);
    const rules = (await owner.client.get("/api/app/automations")).body;
    expect(rules.available).toBe(false);
    expect(rules.rules.find((r: { kind: string }) => r.kind === "NEAR_REWARD").defaults.title).toBe("Plus qu'un passage !");
  });
});
