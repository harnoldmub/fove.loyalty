import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { addMember, agent, db, lastEmail, ownerWithTenant, resetDatabase, setPlan, startApp, uniq } from "./helpers";

/** Limite de collaborateurs de l'offre : invitations, acceptation, réactivation, remplacement. */
let app: NestExpressApplication;

beforeAll(async () => {
  await resetDatabase();
  app = await startApp({ STRIPE_SECRET_KEY: undefined });
});
afterAll(async () => {
  await app.close();
});

const invite = (client: ReturnType<typeof agent>, email = `${uniq("staff")}@test.fove`) => client.post("/api/app/team/invitations", { email, role: "CASHIER", establishmentIds: [] });
const token = async (email: string) => /token=([A-Za-z0-9_-]+)/.exec((await lastEmail(email))!.text)![1]!;

describe("limite de collaborateurs (Essentiel : 3, propriétaire compris)", () => {
  it("les invitations en attente réservent une place", async () => {
    const { client, tenantId } = await ownerWithTenant(app);
    await setPlan(tenantId, "starter");
    expect((await invite(client)).status).toBe(201);
    expect((await invite(client)).status).toBe(201);
    const third = await invite(client);
    expect(third.status).toBe(402);
    expect(third.body.error.code).toBe("quota_exceeded");
  });

  it("acceptation refusée quand le commerce est plein (offre changée entre-temps)", async () => {
    const { client, tenantId } = await ownerWithTenant(app);
    const emails = [0, 1, 2].map(() => `${uniq("staff")}@test.fove`);
    for (const e of emails) expect((await invite(client, e)).status).toBe(201);
    await setPlan(tenantId, "starter");
    for (const [i, e] of emails.entries()) {
      const res = await agent(app).post("/api/auth/invitations/accept", { token: await token(e), name: `Caissier ${i}` });
      if (i < 2) expect(res.status).toBe(201);
      else {
        expect(res.status).toBe(402);
        expect(res.body.error.code).toBe("staff_full");
      }
    }
    expect(await db.tenantMembership.count({ where: { tenantId, status: "ACTIVE" } })).toBe(3);
  });

  it("réactiver un collaborateur reprend une place : refusé si elle est prise", async () => {
    const { client, tenantId } = await ownerWithTenant(app);
    await setPlan(tenantId, "starter");
    await addMember(app, client, "CASHIER");
    await addMember(app, client, "CASHIER");
    const [first] = await db.tenantMembership.findMany({ where: { tenantId, role: { key: "CASHIER" } }, orderBy: { createdAt: "asc" } });
    expect((await client.post(`/api/app/team/members/${first!.id}/status`, { status: "DISABLED" })).status).toBe(204);
    expect((await invite(client)).status).toBe(201);
    const back = await client.post(`/api/app/team/members/${first!.id}/status`, { status: "ACTIVE" });
    expect(back.status).toBe(402);
  });

  it("« Remplacer » : l'ancien est désactivé, le nouveau invité avec le même rôle et les mêmes établissements", async () => {
    const { client, tenantId } = await ownerWithTenant(app);
    await setPlan(tenantId, "starter");
    const est = (await client.post("/api/app/establishments", { name: "Comptoir" })).body as { id: string };
    await addMember(app, client, "CASHIER", [est.id]);
    await addMember(app, client, "MANAGER");
    const cashier = await db.tenantMembership.findFirstOrThrow({ where: { tenantId, role: { key: "CASHIER" } } });

    // Personne déjà dans l'équipe : refus, l'ancien garde sa place.
    const owner = await db.tenantMembership.findFirstOrThrow({ where: { tenantId, role: { key: "OWNER" } }, include: { user: true } });
    expect((await client.post(`/api/app/team/members/${cashier.id}/replace`, { email: owner.user.email })).status).toBe(409);
    expect((await db.tenantMembership.findUniqueOrThrow({ where: { id: cashier.id } })).status).toBe("ACTIVE");

    const email = `${uniq("nouveau")}@test.fove`;
    expect((await client.post(`/api/app/team/members/${cashier.id}/replace`, { email })).status).toBe(201);
    expect((await db.tenantMembership.findUniqueOrThrow({ where: { id: cashier.id } })).status).toBe("DISABLED");
    const invitation = await db.invitation.findFirstOrThrow({ where: { tenantId, email }, include: { role: true } });
    expect(invitation.role.key).toBe("CASHIER");
    expect(invitation.establishmentIds).toEqual([est.id]);
    // Le remplaçant rejoint l'équipe : 3 actifs, limite respectée.
    expect((await agent(app).post("/api/auth/invitations/accept", { token: await token(email), name: "Nouveau" })).status).toBe(201);
    expect(await db.tenantMembership.count({ where: { tenantId, status: "ACTIVE" } })).toBe(3);
  });
});
