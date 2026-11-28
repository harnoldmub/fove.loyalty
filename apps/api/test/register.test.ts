import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { addMember, agent, createCustomerWithCard, createPointsProgram, db, ownerWithTenant, resetDatabase, signIn, startApp, type Client } from "./helpers";

/** Code caisse (docs/chantier-code-caisse.md, C1). */
let app: NestExpressApplication;

beforeAll(async () => {
  await resetDatabase();
  app = await startApp({ STRIPE_SECRET_KEY: undefined });
});
afterAll(async () => {
  await app.close();
});

/** Commerce avec un caissier (code 2580), une carte client et une tablette passée en caisse. */
async function shopWithRegister() {
  const owner = await ownerWithTenant(app);
  const program = await createPointsProgram(owner.client, { name: "Café", mode: "STAMPS", stampsTarget: 10, stampsPerPurchase: 1 });
  const { accountId, customerId } = await createCustomerWithCard(owner.client, program.id);
  const est = (await owner.client.post("/api/app/establishments", { name: "Comptoir" })).body as { id: string };
  const cashier = await addMember(app, owner.client, "CASHIER");
  expect((await cashier.put("/api/app/me/cashier-pin", { pin: "2580" })).status).toBe(200);
  expect((await owner.client.put("/api/app/me/cashier-pin", { pin: "1357" })).status).toBe(200);
  const cashierMembership = await db.tenantMembership.findFirstOrThrow({ where: { tenantId: owner.tenantId, role: { key: "CASHIER" } } });

  // La tablette : le propriétaire s'y connecte puis l'active comme caisse.
  const tablet = agent(app);
  await signIn(tablet, owner.email);
  expect((await tablet.post("/api/app/register/activate", { name: "Caisse comptoir", establishmentId: est.id })).status).toBe(201);
  return { owner, tablet, accountId, customerId, est, cashierMembership };
}

const unlock = (tablet: Client, membershipId: string, pin: string) => tablet.post("/api/app/register/unlock", { membershipId, pin });

describe("code caisse", () => {
  it("code à 4 chiffres, pas trop facile", async () => {
    const owner = await ownerWithTenant(app);
    expect((await owner.client.put("/api/app/me/cashier-pin", { pin: "123" })).status).toBe(400);
    expect((await owner.client.put("/api/app/me/cashier-pin", { pin: "1111" })).status).toBe(400);
    expect((await owner.client.put("/api/app/me/cashier-pin", { pin: "4826" })).status).toBe(200);
    expect((await owner.client.get("/api/auth/me")).body.cashierPinSet).toBe(true);
    const membership = await db.tenantMembership.findFirstOrThrow({ where: { tenantId: owner.tenantId } });
    expect(membership.cashierPinHash).not.toContain("4826");
  });
});

describe("caisse", () => {
  it("session limitée aux fonctions de caisse, quel que soit le compte qui l'a activée", async () => {
    const { tablet } = await shopWithRegister();
    expect((await tablet.get("/api/app/billing")).body.error.code).toBe("register_mode");
    expect((await tablet.patch("/api/app/tenant", { name: "Piraté" })).body.error.code).toBe("register_mode");
    expect((await tablet.get("/api/app/team")).body.error.code).toBe("register_mode");
    const me = (await tablet.get("/api/auth/me")).body;
    expect(me.register).toMatchObject({ name: "Caisse comptoir", unlocked: false });
    expect(me.permissions).toEqual([]);
  });

  it("« Qui encaisse ? » puis opérations au nom du caissier, avec la caisse et son établissement", async () => {
    const { tablet, accountId, est, cashierMembership } = await shopWithRegister();
    const state = (await tablet.get("/api/app/register")).body;
    expect(state.cashiers.map((c: { role: string }) => c.role).sort()).toEqual(["CASHIER", "OWNER"]);
    expect(state.current).toBeNull();

    expect((await tablet.post("/api/app/transactions/earn", { accountId, amount: null, idempotencyKey: "k-locked" })).body.error.code).toBe("register_locked");
    expect((await unlock(tablet, cashierMembership.id, "0000")).status).toBe(400);
    expect((await unlock(tablet, cashierMembership.id, "2580")).status).toBe(200);
    const earn = await tablet.post("/api/app/transactions/earn", { accountId, amount: null, idempotencyKey: "k-earn-0001" });
    expect(earn.status).toBe(201);
    const tx = await db.loyaltyTransaction.findFirstOrThrow({ where: { accountId, kind: "EARN" } });
    expect(tx.actorUserId).toBe(cashierMembership.userId);
    expect(tx.registerDeviceId).not.toBeNull();
    expect(tx.establishmentId).toBe(est.id);

    // Annulation ouverte au caissier sur la caisse ; réglage manuel du solde, jamais.
    expect((await tablet.post(`/api/app/transactions/${tx.id}/reverse`, { reason: "Erreur de caisse", idempotencyKey: "k-reverse-001" })).status).toBeLessThan(300);
    expect((await tablet.post("/api/app/transactions/adjust", { accountId, delta: 5, reason: "x", idempotencyKey: "k-adjust-001" })).body.error.code).toBe("register_mode");
    expect((await tablet.get("/api/auth/me")).body.register.cashier.name).toBe("Membre");
  });

  it("verrouillage automatique après le délai, et 5 erreurs bloquent le code 15 minutes", async () => {
    const { tablet, accountId, cashierMembership } = await shopWithRegister();
    await unlock(tablet, cashierMembership.id, "2580");
    await db.session.updateMany({ where: { registerMembershipId: cashierMembership.id }, data: { registerActiveAt: new Date(Date.now() - 6 * 60_000) } });
    expect((await tablet.post("/api/app/transactions/earn", { accountId, amount: null, idempotencyKey: "k-late-0001" })).body.error.code).toBe("register_locked");

    for (let i = 0; i < 5; i++) expect((await unlock(tablet, cashierMembership.id, "9999")).status).toBe(400);
    const locked = await unlock(tablet, cashierMembership.id, "2580");
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe("pin_locked");
  });

  it("code réinitialisé par le propriétaire : le collaborateur disparaît de la caisse", async () => {
    const { owner, tablet, cashierMembership } = await shopWithRegister();
    expect((await owner.client.delete(`/api/app/team/members/${cashierMembership.id}/cashier-pin`)).status).toBe(204);
    const state = (await tablet.get("/api/app/register")).body;
    expect(state.cashiers.some((c: { membershipId: string }) => c.membershipId === cashierMembership.id)).toBe(false);
  });

  it("caisse retirée : l'appareil est déconnecté", async () => {
    const { owner, tablet } = await shopWithRegister();
    const list = (await owner.client.get("/api/app/registers")).body as { id: string; name: string }[];
    expect(list[0]!.name).toBe("Caisse comptoir");
    expect((await owner.client.delete(`/api/app/registers/${list[0]!.id}`)).status).toBe(204);
    expect((await tablet.get("/api/app/register")).status).toBe(401);
  });

  it("un caissier ne peut pas activer une caisse", async () => {
    const owner = await ownerWithTenant(app);
    const cashier = await addMember(app, owner.client, "CASHIER");
    expect((await cashier.post("/api/app/register/activate", { name: "Caisse" })).status).toBe(403);
  });
});

describe("surveillance des annulations", () => {
  it("deux annulations de récompense par le même caissier pour le même client : point à vérifier et email au propriétaire", async () => {
    const { owner, tablet, accountId, cashierMembership } = await shopWithRegister();
    const program = await db.loyaltyAccount.findUniqueOrThrow({ where: { id: accountId }, select: { programId: true } });
    const reward = (await owner.client.post("/api/app/rewards", { programId: program.programId, name: "Café offert", cost: 10 })).body as { id: string };
    await db.loyaltyAccount.update({ where: { id: accountId }, data: { balance: 10 } });
    await unlock(tablet, cashierMembership.id, "2580");

    const useAndCancel = async (n: number) => {
      const red = await tablet.post("/api/app/redemptions", { accountId, rewardId: reward.id, idempotencyKey: `redeem-key-${n}` });
      expect(red.status).toBe(201);
      const id = (red.body.redemption?.id ?? red.body.id) as string;
      expect((await tablet.post(`/api/app/redemptions/${id}/cancel`, { reason: "Erreur" })).status).toBeLessThan(300);
    };
    await useAndCancel(1);
    expect((await owner.client.get("/api/app/alerts")).body.alerts).toHaveLength(0);
    await useAndCancel(2);

    const summary = (await owner.client.get("/api/app/alerts")).body;
    expect(summary.alerts).toHaveLength(1);
    expect(summary.alerts[0].details).toMatchObject({ cashier: "Membre", count: 2 });
    expect(summary.cancellationsThisWeek).toBe(2);
    const mail = await db.emailOutbox.findFirstOrThrow({ where: { to: owner.email, subject: { contains: "annulations répétées" } } });
    expect(mail.text).toContain("Membre");

    // Une troisième annulation ne redonne pas d'alerte (une par couple sur 30 jours).
    await useAndCancel(3);
    expect((await owner.client.get("/api/app/alerts")).body.alerts).toHaveLength(1);

    // Historique filtré : caissier et caisse indiqués.
    const list = (await owner.client.get("/api/app/transactions?kind=CANCELLATIONS")).body.data as { kind: string; actorName: string; registerName: string }[];
    expect(list).toHaveLength(3);
    expect(list.every((t) => t.kind === "REDEMPTION_REVERSAL" && t.actorName === "Membre" && t.registerName === "Caisse comptoir")).toBe(true);

    expect((await owner.client.post(`/api/app/alerts/${summary.alerts[0].id}/resolve`)).status).toBe(204);
    expect((await owner.client.get("/api/app/alerts")).body.alerts).toHaveLength(0);
  });
});
