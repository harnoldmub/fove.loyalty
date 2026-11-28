import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { agent, db, resetDatabase, startApp, uniq, signIn, ownerWithTenant, type Client } from "./helpers";
import { totpCode, totpStep } from "../src/auth/totp";
import { decrypt } from "../src/common/crypto";

/** Double authentification des admins (docs/securite.md, lot S2). */
let app: NestExpressApplication;

beforeAll(async () => {
  await resetDatabase();
  app = await startApp({ STRIPE_SECRET_KEY: undefined, ADMIN_MFA: "required" });
});
afterAll(async () => {
  await app.close();
  process.env.ADMIN_MFA = "off";
});

async function admin(data: object = { isSuperAdmin: true }) {
  const email = `${uniq("admin")}@fove.test`;
  const user = await db.user.create({ data: { email, name: "Admin", emailVerifiedAt: new Date(), ...data } });
  const client = agent(app);
  await signIn(client, email);
  return { client, user, email };
}

/** Code de l'application pour un pas donné (par défaut le pas courant). */
async function appCode(userId: string, offset = 0) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const secret = decrypt((user.totpSecret ?? user.totpPendingSecret)!, process.env.APP_ENCRYPTION_KEY!);
  return totpCode(secret.replace(/\s/g, ""), totpStep(Date.now()) + offset);
}

async function enroll(client: Client, userId: string) {
  expect((await client.post("/api/auth/mfa/setup")).status).toBe(201);
  const res = await client.post("/api/auth/mfa/setup/confirm", { code: await appCode(userId) });
  expect(res.status).toBe(200);
  return res.body.recoveryCodes as string[];
}

describe("double authentification des admins", () => {
  it("activation obligatoire avant l'administration, puis accès", async () => {
    const { client, user } = await admin();
    const blocked = await client.get("/api/admin/stats");
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("mfa_setup_required");
    expect((await client.get("/api/auth/mfa")).body).toMatchObject({ required: true, enabled: false, verified: false });

    const setup = await client.post("/api/auth/mfa/setup");
    expect(setup.body.uri).toMatch(/^otpauth:\/\/totp\/FOVE%3A/);
    expect(setup.body.qrSvg).toContain("<svg");
    expect((await client.post("/api/auth/mfa/setup/confirm", { code: "000000" })).status).toBe(400);
    const codes = (await client.post("/api/auth/mfa/setup/confirm", { code: await appCode(user.id) })).body.recoveryCodes as string[];
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    // Codes de secours jamais stockés en clair.
    const stored = await db.userRecoveryCode.findMany({ where: { userId: user.id } });
    expect(stored.every((r) => !codes.includes(r.codeHash))).toBe(true);
    expect((await client.get("/api/admin/stats")).status).toBe(200);
    expect((await client.get("/api/admin/finance/overview")).status).toBe(200);
  });

  it("nouvelle session : code de l'application exigé, sans rejeu possible", async () => {
    const { client, user, email } = await admin();
    await enroll(client, user.id);
    const other = agent(app);
    await signIn(other, email);
    expect((await other.get("/api/admin/stats")).body.error.code).toBe("mfa_required");
    // Le code utilisé pour l'activation ne resert pas.
    expect((await other.post("/api/auth/mfa/verify", { code: await appCode(user.id) })).status).toBe(400);
    const next = await appCode(user.id, 1);
    expect((await other.post("/api/auth/mfa/verify", { code: next })).status).toBe(200);
    expect((await other.get("/api/admin/stats")).status).toBe(200);

    // Passé 12 h, le code est redemandé.
    await db.session.updateMany({ where: { userId: user.id }, data: { mfaVerifiedAt: new Date(Date.now() - 13 * 3_600_000) } });
    expect((await other.get("/api/admin/stats")).body.error.code).toBe("mfa_required");
  });

  it("code de secours : utilisable une seule fois", async () => {
    const { client, user, email } = await admin();
    const codes = await enroll(client, user.id);
    const a = agent(app);
    await signIn(a, email);
    expect((await a.post("/api/auth/mfa/verify", { code: codes[0]!.toLowerCase() })).status).toBe(200);
    const b = agent(app);
    await signIn(b, email);
    expect((await b.post("/api/auth/mfa/verify", { code: codes[0] })).status).toBe(400);
    expect((await a.get("/api/auth/mfa")).body.recoveryCodesLeft).toBe(9);
  });

  it("5 erreurs : blocage de 15 minutes", async () => {
    const { client, user, email } = await admin();
    await enroll(client, user.id);
    const other = agent(app);
    await signIn(other, email);
    for (let i = 0; i < 5; i++) expect((await other.post("/api/auth/mfa/verify", { code: "111111" })).status).toBe(400);
    const locked = await other.post("/api/auth/mfa/verify", { code: await appCode(user.id, 1) });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe("mfa_locked");
  });

  it("associé : même exigence sur la finance ; commerçant : non concerné", async () => {
    const { client } = await admin({ adminRole: "ASSOCIATE" });
    expect((await client.get("/api/admin/finance/overview")).body.error.code).toBe("mfa_setup_required");
    const owner = await ownerWithTenant(app);
    expect((await owner.client.get("/api/app/tenant")).status).toBe(200);
    expect((await owner.client.get("/api/auth/mfa")).body).toMatchObject({ required: false, verified: true });
    expect((await owner.client.post("/api/auth/mfa/setup")).status).toBe(403);
  });
});
