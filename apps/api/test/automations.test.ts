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

describe("anniversaire", () => {
  async function birthdayShop() {
    const shop = await stampShop();
    expect((await enable(shop.client, "BIRTHDAY", { giftLabel: "Un dessert offert", daysBefore: 3, daysAfter: 7 })).status).toBe(200);
    return shop;
  }

  it("cadeau exigé pour activer", async () => {
    const { client } = await stampShop();
    expect((await client.put("/api/app/automations/BIRTHDAY", { enabled: true })).status).toBe(400);
  });

  it("J-3 : cadeau créé et annonce ; jour J : « Joyeux anniversaire » ; puis utilisé une fois au scanner", async () => {
    const { client, tenantId, programId } = await birthdayShop();
    const { accountId, customerId } = await cardWith(client, programId, { balance: 2, lastActivityDaysAgo: 1 });
    // Anniversaire le 13 juin ; noon() = 10 juin à Kinshasa.
    await db.customer.update({ where: { id: customerId }, data: { birthDay: 13, birthMonth: 6 } });
    const automation = app.get(AutomationService);

    expect(await automation.runTenant(tenantId, noon(-1))).toBe(0);
    expect(await automation.runTenant(tenantId, noon())).toBe(1);
    const gift = await db.birthdayGift.findUniqueOrThrow({ where: { customerId_year: { customerId, year: 2031 } } });
    expect(gift.label).toBe("Un dessert offert");
    expect(gift.validFrom.toISOString()).toBe("2031-06-09T23:00:00.000Z");
    expect(gift.validUntil.toISOString()).toBe("2031-06-20T23:00:00.000Z");
    const soon = await db.customerMessage.findFirstOrThrow({ where: { customerId, scenario: "BIRTHDAY_SOON" } });
    expect(soon.body).toContain("Un dessert offert");
    expect(soon.body).toContain("20 juin 2031");

    expect(await automation.runTenant(tenantId, noon(3))).toBe(1);
    expect(await db.customerMessage.count({ where: { customerId, scenario: "BIRTHDAY_DAY" } })).toBe(1);

    // Au scanner : visible, utilisable une fois.
    const giftNow = await automation.activeGift(tenantId, customerId, noon(4));
    expect(giftNow?.label).toBe("Un dessert offert");
    const ctx = { tenantId, readOnly: false, actor: { type: "system" as const, label: "scheduler" as const } };
    expect(await automation.useGift(ctx, accountId, noon(4))).toMatchObject({ used: true });
    await expect(automation.useGift(ctx, accountId, noon(4))).rejects.toMatchObject({ code: "no_birthday_gift" });
    // Plus de message une fois le cadeau utilisé, et aucun nouveau cadeau la même année.
    expect(await automation.runTenant(tenantId, noon(5))).toBe(0);
    expect(await db.birthdayGift.count({ where: { customerId } })).toBe(1);
  });

  it("le cadeau n'est utilisable qu'entre J-3 et J+7", async () => {
    const { client, tenantId, programId } = await birthdayShop();
    const { customerId } = await cardWith(client, programId, { balance: 2, lastActivityDaysAgo: 1 });
    await db.customer.update({ where: { id: customerId }, data: { birthDay: 13, birthMonth: 6 } });
    const automation = app.get(AutomationService);
    await automation.runTenant(tenantId, noon());
    expect(await automation.activeGift(tenantId, customerId, noon(10))).not.toBeNull();
    expect(await automation.activeGift(tenantId, customerId, noon(11))).toBeNull();
  });
});

describe("résultats et liste « À relancer »", () => {
  it("offre Gratuite : liste des clients à relancer et des anniversaires, retirés une fois contactés", async () => {
    const owner = await ownerWithTenant(app, { plan: "free" });
    const program = await createPointsProgram(owner.client, { name: "Café", mode: "STAMPS", stampsTarget: 10, stampsPerPurchase: 1 });
    const dormant = await cardWith(owner.client, program.id, { balance: 3, lastActivityDaysAgo: 0, lastVisitDaysAgo: 100 });
    await db.customer.update({ where: { id: dormant.customerId }, data: { lastVisitAt: new Date(Date.now() - 100 * DAY), createdAt: new Date(Date.now() - 300 * DAY) } });
    const birthday = await cardWith(owner.client, program.id, { balance: 1, lastActivityDaysAgo: 0, lastVisitDaysAgo: 1 });
    const inThreeDays = new Date(Date.now() + 3 * DAY);
    await db.customer.update({ where: { id: birthday.customerId }, data: { birthDay: inThreeDays.getUTCDate(), birthMonth: inThreeDays.getUTCMonth() + 1, lastVisitAt: new Date(), createdAt: new Date(Date.now() - 300 * DAY) } });

    const list = (await owner.client.get("/api/app/automations/to-contact")).body;
    const entry = list.relaunch.find((r: { customerId: string }) => r.customerId === dormant.customerId);
    expect(entry).toMatchObject({ scenario: "DORMANT" });
    expect(entry.message).toContain("Vous nous manquez");
    expect(list.birthdays.find((b: { customerId: string }) => b.customerId === birthday.customerId)).toMatchObject({ inDays: 3 });

    expect((await owner.client.post("/api/app/automations/contacted", { customerId: dormant.customerId, scenario: "DORMANT" })).status).toBe(200);
    expect((await owner.client.post("/api/app/automations/contacted", { customerId: birthday.customerId, scenario: "BIRTHDAY_DAY" })).status).toBe(200);
    const after = (await owner.client.get("/api/app/automations/to-contact")).body;
    expect(after.relaunch.some((r: { customerId: string }) => r.customerId === dormant.customerId)).toBe(false);
    expect(after.birthdays.some((b: { customerId: string }) => b.customerId === birthday.customerId)).toBe(false);
  });

  it("taux de retour : un passage dans les 30 jours après le message", async () => {
    const { client, tenantId, programId } = await stampShop();
    const back = await cardWith(client, programId, { balance: 9, lastActivityDaysAgo: 3 });
    const gone = await cardWith(client, programId, { balance: 9, lastActivityDaysAgo: 3 });
    await enable(client, "NEAR_REWARD");
    const sentAt = new Date(Date.now() - 5 * DAY);
    for (const c of [back, gone]) {
      await db.customerMessage.create({ data: { tenantId, customerId: c.customerId, accountId: c.accountId, scenario: "NEAR_REWARD", channel: "WALLET", key: uniq("k"), title: "t", body: "b", sentAt } });
    }
    await db.loyaltyAccount.update({ where: { id: back.accountId }, data: { lastActivityAt: new Date(Date.now() - 2 * DAY) } });
    expect((await client.post("/api/app/transactions/earn", { accountId: back.accountId, amount: null, idempotencyKey: uniq("e") })).status).toBeLessThan(300);
    const stats = (await client.get("/api/app/automations/stats")).body;
    expect(stats.scenarios.find((s: { scenario: string }) => s.scenario === "NEAR_REWARD")).toMatchObject({ sent: 2, returned: 1 });
  });
});
