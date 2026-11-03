import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { db, ownerWithTenant, resetDatabase, setPlan, startApp } from "./helpers";

let app: NestExpressApplication;
const runJobs = () => request(app.getHttpServer()).post("/api/jobs/run").set("x-cron-secret", process.env.CRON_SECRET!);

beforeAll(async () => {
  await resetDatabase();
  app = await startApp();
});
afterAll(() => app.close());

/** Entreprise abonnée à Essentiel en mode simulé (sans paiement réel). */
async function paidOwner() {
  const o = await ownerWithTenant(app, { plan: "free" });
  await db.user.update({ where: { email: o.email }, data: { emailVerifiedAt: new Date() } });
  expect((await o.client.post("/api/app/billing/checkout", { planCode: "starter", interval: "YEAR" })).status).toBe(201);
  return o;
}

const subOf = (tenantId: string) => db.subscription.findUniqueOrThrow({ where: { tenantId } });

describe("résiliation d'un abonnement", () => {
  it("garde les droits jusqu'à la fin de la période, puis passe au Gratuit", async () => {
    const o = await paidOwner();
    expect((await o.client.post("/api/app/billing/cancel")).status).toBe(204);
    expect((await subOf(o.tenantId)).cancelAtPeriodEnd).toBe(true);
    let billing = (await o.client.get("/api/app/billing")).body;
    expect(billing.currentPlan.code).toBe("starter");
    expect((await o.client.get("/api/app/tenant")).body.features.walletCampaigns).toBe(true);

    // Fin de période : effet immédiat, puis la tâche planifiée range l'abonnement.
    await db.subscription.update({ where: { tenantId: o.tenantId }, data: { currentPeriodEnd: new Date(Date.now() - 1000) } });
    billing = (await o.client.get("/api/app/billing")).body;
    expect(billing.currentPlan.code).toBe("free");
    expect(billing.limits).toEqual({ customers: 3, establishments: 1, staff: 1, programs: 1 });
    const job = await runJobs();
    expect(job.status).toBe(200);
    expect(job.body.subscriptions.ended).toBeGreaterThanOrEqual(1);
    expect((await subOf(o.tenantId)).status).toBe("CANCELED");
  });

  it("peut être annulée tant que la période n'est pas terminée", async () => {
    const o = await paidOwner();
    await o.client.post("/api/app/billing/cancel");
    expect((await o.client.post("/api/app/billing/resume")).status).toBe(204);
    const sub = await subOf(o.tenantId);
    expect(sub.cancelAtPeriodEnd).toBe(false);
    expect(sub.status).toBe("ACTIVE");
    const again = await o.client.post("/api/app/billing/resume");
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe("nothing_to_resume");
  });

  it("refuse de résilier le Gratuit ou un contrat géré par FOVE", async () => {
    const free = await ownerWithTenant(app, { plan: "free" });
    const res = await free.client.post("/api/app/billing/cancel");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("nothing_to_cancel");

    const custom = await ownerWithTenant(app, { plan: "custom" });
    const contract = await custom.client.post("/api/app/billing/cancel");
    expect(contract.status).toBe(400);
    expect(contract.body.error.code).toBe("contract_managed");
    expect((await subOf(custom.tenantId)).cancelAtPeriodEnd).toBe(false);
  });
});

describe("échéances gérées par la tâche planifiée", () => {
  it("un contrat sur-mesure arrivé à son terme repasse au Gratuit", async () => {
    const o = await ownerWithTenant(app, { plan: "free" });
    await setPlan(o.tenantId, "custom", { currentPeriodEnd: new Date(Date.now() - 1000), limitsOverride: { customers: 50 } });
    expect((await o.client.get("/api/app/tenant")).body.limits.customers).toBe(3);
    await runJobs();
    expect((await subOf(o.tenantId)).status).toBe("CANCELED");
  });

  it("un abonnement simulé non résilié est renouvelé, comme par Stripe", async () => {
    const o = await paidOwner();
    await db.subscription.update({ where: { tenantId: o.tenantId }, data: { currentPeriodEnd: new Date(Date.now() - 1000) } });
    await runJobs();
    const sub = await subOf(o.tenantId);
    expect(sub.status).toBe("ACTIVE");
    expect(sub.currentPeriodEnd!.getTime()).toBeGreaterThan(Date.now() + 300 * 86_400_000);
  });
});
