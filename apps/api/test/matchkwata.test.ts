import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { FoveClient, FoveError } from "@fove/sdk";
import { createPointsProgram, db, ownerWithTenant, resetDatabase, startApp, type Client } from "./helpers";

/**
 * Intégration Match Kwata, testée contre une simulation fidèle de la boutique :
 * mêmes formes de données que son schéma Prisma (User, Order PAID/REFUNDED),
 * appels réels via le SDK sur l'API FOVE démarrée. Aucune base Match Kwata
 * n'est touchée.
 */
let app: NestExpressApplication;
let owner: Client;
let fove: FoveClient;
let programId: string;

/** Événements tels que la boutique Match Kwata les émettrait (statut PAID → points). */
const mkUser = { id: "6f1c2a8e-mk-user-0001", email: "cliente@matchkwata.test", firstName: "Grâce", lastName: "M.", phone: null, newsletterOptIn: true };
const mkOrder = (n: number, total: string) => ({
  id: `mk-order-${n}`,
  orderNumber: `MK-2026-${String(n).padStart(5, "0")}`,
  status: "PAID" as const,
  currency: "EUR",
  total,
  user: mkUser,
});

function toFove(order: ReturnType<typeof mkOrder>) {
  return {
    programId,
    externalOrderId: order.id,
    orderNumber: order.orderNumber,
    customer: {
      externalId: order.user.id,
      email: order.user.email,
      phone: order.user.phone,
      firstName: order.user.firstName,
      lastName: order.user.lastName,
      marketingEmailConsent: order.user.newsletterOptIn,
    },
    amount: order.total,
    currency: order.currency,
    paidAt: new Date().toISOString(),
  };
}

beforeAll(async () => {
  await resetDatabase();
  app = await startApp();
  await app.listen(0);
  const o = await ownerWithTenant(app, { slug: "match-kwata" });
  owner = o.client;
  await db.user.update({ where: { email: o.email }, data: { emailVerifiedAt: new Date() } });
  programId = (await createPointsProgram(owner, { name: "Match Kwata Club", currency: "EUR", spendStep: "1", pointsPerStep: 1 })).id;
  await owner.post("/api/app/integrations/connections", { provider: "MATCH_KWATA", name: "Boutique", programId });
  const key = await owner.post("/api/app/integrations/keys", { name: "Match Kwata serveur", kind: "SECRET", scopes: ["integrations:write", "customers:read", "loyalty:read"] });
  const url = await app.getUrl();
  fove = new FoveClient({ apiKey: key.body.key, baseUrl: url.replace("[::1]", "localhost") });
});
afterAll(() => app.close());

describe("connecteur Match Kwata", () => {
  it("une commande payée crée le client, la carte et crédite les points", async () => {
    const result = await fove.orderPaid(toFove(mkOrder(1, "125.90")));
    expect(result.customerCreated).toBe(true);
    expect(result.pointsEarned).toBe(125);
    // La boutique peut proposer « Voir ma carte » sur sa page de confirmation.
    expect(result).toHaveProperty("cardUrl");
    expect(result.balance).toBe(125);
  });

  it("le renvoi d'une même commande ne crédite jamais deux fois", async () => {
    const again = await fove.orderPaid(toFove(mkOrder(1, "125.90")));
    expect(again.replayed).toBe(true);
    expect(again.balance).toBe(125);
    expect(await db.loyaltyTransaction.count({ where: { externalOrderId: "mk-order-1" } })).toBe(1);
  });

  it("une deuxième commande rattache le même client par référence externe", async () => {
    const r = await fove.orderPaid(toFove(mkOrder(2, "40.00")));
    expect(r.customerCreated).toBe(false);
    expect(r.balance).toBe(165);
    expect(await db.customer.count({ where: { tenant: { slug: "match-kwata" } } })).toBe(1);
  });

  it("rattache un client existant par email, jamais par nom", async () => {
    await owner.post("/api/app/customers", { firstName: "Papy", lastName: "Kalala", email: "papy@matchkwata.test", phone: null });
    const linked = await fove.linkCustomer({ externalId: "mk-user-papy", email: "papy@matchkwata.test", firstName: "Papy" });
    expect(linked.matchedBy).toBe("email");
    const homonym = await fove.linkCustomer({ externalId: "mk-user-papy-2", email: "autre.papy@matchkwata.test", firstName: "Papy", lastName: "Kalala" });
    expect(homonym.created).toBe(true);
    expect(homonym.customerId).not.toBe(linked.customerId);
  });

  it("un remboursement partiel retire des points proportionnels, une seule fois", async () => {
    const order = await fove.orderPaid(toFove(mkOrder(3, "100.00")));
    expect(order.balance).toBe(265);
    const partial = await fove.orderRefunded({ programId, externalOrderId: "mk-order-3", externalRefundId: "re_1", amount: "25.00" });
    expect(partial.pointsRemoved).toBe(25);
    const replay = await fove.orderRefunded({ programId, externalOrderId: "mk-order-3", externalRefundId: "re_1", amount: "25.00" });
    expect(replay.replayed).toBe(true);
    const rest = await fove.orderRefunded({ programId, externalOrderId: "mk-order-3", externalRefundId: "re_2", amount: "100.00" });
    expect(rest.pointsRemoved).toBe(75);
    expect(rest.balance).toBe(165);
  });

  it("arrondit le retrait au point supérieur et reste cumulatif", async () => {
    const order = await fove.orderPaid(toFove(mkOrder(5, "125.90")));
    const before = order.balance;
    const small = await fove.orderRefunded({ programId, externalOrderId: "mk-order-5", externalRefundId: "re_a", amount: "0.50" });
    expect(small.pointsRemoved).toBe(1);
    const rest = await fove.orderRefunded({ programId, externalOrderId: "mk-order-5", externalRefundId: "re_b", amount: "125.40" });
    expect(rest.pointsRemoved).toBe(124);
    expect(rest.balance).toBe(before - 125);
  });

  it("refuse une devise différente de celle du programme", async () => {
    const bad = { ...toFove(mkOrder(4, "10000")), currency: "CDF" };
    await expect(fove.orderPaid(bad)).rejects.toMatchObject({ code: "currency_mismatch" } satisfies Partial<FoveError>);
  });

  it("trace chaque synchronisation pour le suivi des intégrations", async () => {
    const logs = await db.integrationSyncLog.findMany({ where: { tenant: { slug: "match-kwata" } } });
    expect(logs.some((l) => l.status === "ok" && l.kind === "order.paid")).toBe(true);
    expect(logs.some((l) => l.status === "error" && l.externalId === "mk-order-4")).toBe(true);
  });

  it("recherche un client par référence Match Kwata", async () => {
    const customer = await fove.findCustomer({ externalId: mkUser.id });
    expect((customer as { email: string }).email).toBe(mkUser.email);
  });
});
