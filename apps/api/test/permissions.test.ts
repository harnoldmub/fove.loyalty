import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { addMember, createCustomerWithCard, createPointsProgram, earn, ownerWithTenant, resetDatabase, startApp, uniq, type Client } from "./helpers";

let app: NestExpressApplication;
let owner: Client;
let programId: string;
let accountId: string;
let estA: string;
let estB: string;

beforeAll(async () => {
  await resetDatabase();
  app = await startApp();
  owner = (await ownerWithTenant(app)).client;
  programId = (await createPointsProgram(owner)).id;
  accountId = (await createCustomerWithCard(owner, programId)).accountId;
  estA = (await owner.post("/api/app/establishments", { name: "Gombe" })).body.id;
  estB = (await owner.post("/api/app/establishments", { name: "Limete" })).body.id;
});
afterAll(() => app.close());

describe("rôles et permissions", () => {
  it("le caissier crédite et utilise, mais n'annule pas et ne configure pas", async () => {
    const cashier = await addMember(app, owner, "CASHIER");
    expect((await earn(cashier, accountId, "3000")).status).toBe(201);
    const tx = (await earn(cashier, accountId, "3000")).body.transaction;
    expect((await cashier.post(`/api/app/transactions/${tx.id}/reverse`, { reason: "test", idempotencyKey: uniq("x-") })).status).toBe(403);
    expect((await cashier.post("/api/app/programs", { name: "Pirate", mode: "POINTS", currency: "CDF" })).status).toBe(403);
    expect((await cashier.patch("/api/app/tenant", { name: "Pirate" })).status).toBe(403);
    expect((await cashier.get("/api/app/team")).status).toBe(403);
    expect((await cashier.get("/api/app/billing")).status).toBe(403);
  });

  it("le lecteur consulte sans rien modifier", async () => {
    const viewer = await addMember(app, owner, "VIEWER");
    expect((await viewer.get("/api/app/customers")).status).toBe(200);
    expect((await viewer.get("/api/app/analytics/overview")).status).toBe(200);
    expect((await earn(viewer, accountId, "3000")).status).toBe(403);
    expect((await viewer.post("/api/app/customers", { firstName: "X", phone: "+243810000001" })).status).toBe(403);
  });

  it("le manager configure mais ne gère ni l'équipe ni la facturation", async () => {
    const manager = await addMember(app, owner, "MANAGER");
    expect((await manager.post("/api/app/rewards", { programId, name: "Boisson", cost: 5 })).status).toBe(201);
    expect((await manager.post("/api/app/team/invitations", { email: "x@test.fove", role: "CASHIER" })).status).toBe(403);
    expect((await manager.post("/api/app/billing/checkout", { planCode: "premium", interval: "MONTH" })).status).toBe(403);
  });

  it("un caissier limité à un établissement n'opère que dans celui-ci", async () => {
    const cashier = await addMember(app, owner, "CASHIER", [estA]);
    const base = { accountId, amount: "2000" };
    expect((await cashier.post("/api/app/transactions/earn", { ...base, idempotencyKey: uniq("e-") })).status).toBe(403);
    expect((await cashier.post("/api/app/transactions/earn", { ...base, establishmentId: estB, idempotencyKey: uniq("e-") })).status).toBe(403);
    expect((await cashier.post("/api/app/transactions/earn", { ...base, establishmentId: estA, idempotencyKey: uniq("e-") })).status).toBe(201);
  });

  it("un collaborateur désactivé perd l'accès immédiatement", async () => {
    const cashier = await addMember(app, owner, "CASHIER");
    const team = (await owner.get("/api/app/team")).body.members as { id: string; role: string }[];
    const target = team.filter((m) => m.role === "CASHIER").at(-1)!;
    expect((await owner.post(`/api/app/team/members/${target.id}/status`, { status: "DISABLED" })).status).toBe(204);
    expect((await cashier.get("/api/app/customers")).status).toBe(403);
  });

  it("le dernier propriétaire ne peut pas être rétrogradé", async () => {
    const team = (await owner.get("/api/app/team")).body.members as { id: string; role: string }[];
    const me = team.find((m) => m.role === "OWNER")!;
    expect((await owner.patch(`/api/app/team/members/${me.id}`, { role: "MANAGER" })).status).toBe(400);
  });

  it("les routes d'administration FOVE sont réservées au super admin", async () => {
    expect((await owner.get("/api/admin/tenants")).status).toBe(403);
  });
});
