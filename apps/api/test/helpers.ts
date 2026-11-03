import { resolve } from "node:path";
import { config } from "dotenv";
import request from "supertest";
import type { NestExpressApplication } from "@nestjs/platform-express";

config({ path: resolve(__dirname, "../../../.env"), quiet: true });
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.APP_URL = "http://localhost:5290";
process.env.EMAIL_PROVIDER = "console";
delete process.env.STRIPE_SECRET_KEY;
delete process.env.STRIPE_WEBHOOK_SECRET;

import { createPrismaClient } from "@fove/database";
import { ROLE_PERMISSIONS, TENANT_ROLES, PERMISSIONS } from "@fove/shared";
import { createHash } from "node:crypto";
import { resetConfigCache } from "../src/config";
import { createApp } from "../src/bootstrap";

export const db = createPrismaClient(process.env.TEST_DATABASE_URL);

const PAID = { exports: true, widget: true, walletCampaigns: true, whatsappAuto: true, removeBranding: true };
const NONE = { customers: null, establishments: null, staff: null, programs: null };
/** Quotas réduits pour tester les limites sans créer des centaines de clients. */
export const PLANS = [
  { code: "free", kind: "FREE" as const, name: "Gratuit", priceMonthlyCents: 0, priceYearlyCents: 0, trialDays: 0, features: { api: false, widget: true, integrations: false, exports: true, walletCampaigns: false, whatsappAuto: false, removeBranding: false }, limits: { customers: 3, establishments: 1, staff: 1, programs: 1 }, sortOrder: 0 },
  { code: "starter", name: "Starter", priceMonthlyCents: 1290, priceYearlyCents: 12900, features: { ...PAID, api: false, integrations: false }, limits: { customers: 3, establishments: 1, staff: 3, programs: 1 }, sortOrder: 1 },
  { code: "business", name: "Business", priceMonthlyCents: 2490, priceYearlyCents: 24900, features: { ...PAID, api: true, integrations: true }, limits: { customers: 5000, establishments: 5, staff: 15, programs: 3 }, sortOrder: 2, stripePriceMonthlyId: "price_business_m" },
  { code: "premium", name: "Premium", priceMonthlyCents: 4990, priceYearlyCents: 49900, features: { ...PAID, api: true, integrations: true }, limits: NONE, sortOrder: 3 },
  { code: "custom", kind: "CUSTOM" as const, name: "Sur-mesure", priceMonthlyCents: 0, priceYearlyCents: 0, trialDays: 0, features: { ...PAID, api: true, integrations: true }, limits: NONE, sortOrder: 4 },
];

export async function resetDatabase() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
  for (const key of PERMISSIONS) await db.permission.create({ data: { key, description: key } });
  for (const key of TENANT_ROLES) {
    const h = createHash("sha256").update(`role:${key}`).digest("hex");
    const id = `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
    await db.role.create({ data: { id, key, name: key, permissions: [...ROLE_PERMISSIONS[key]], isSystem: true } });
  }
  for (const plan of PLANS) await db.subscriptionPlan.create({ data: plan });
}

export async function startApp(env: Record<string, string | undefined> = {}): Promise<NestExpressApplication> {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetConfigCache();
  const app = await createApp();
  await app.init();
  return app;
}

export type Agent = ReturnType<typeof request.agent>;

/** Client HTTP avec cookie de session et en-tête anti-CSRF. */
export function agent(app: NestExpressApplication) {
  const a = request.agent(app.getHttpServer());
  return {
    raw: a,
    get: (url: string) => a.get(url),
    post: (url: string, body?: object) => a.post(url).set("x-fove-csrf", "1").send(body ?? {}),
    patch: (url: string, body?: object) => a.patch(url).set("x-fove-csrf", "1").send(body ?? {}),
    delete: (url: string) => a.delete(url).set("x-fove-csrf", "1"),
  };
}
export type Client = ReturnType<typeof agent>;

let counter = 0;
export function uniq(prefix: string) {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter}`;
}

/**
 * Inscrit un propriétaire et crée son entreprise. Une entreprise démarre sur
 * l'offre Gratuite ; par défaut on la passe en Business pour tester les
 * fonctions sans se heurter aux quotas.
 */
export async function ownerWithTenant(app: NestExpressApplication, opts: { slug?: string; plan?: string } = {}) {
  const client = agent(app);
  const email = `${uniq("owner")}@test.fove`;
  const signup = await client.post("/api/auth/signup", { name: "Owner Test", email, password: "motdepasse123", acceptTerms: true });
  if (signup.status !== 201) throw new Error(`signup ${signup.status} ${JSON.stringify(signup.body)}`);
  const slug = opts.slug ?? uniq("shop-");
  const tenant = await client.post("/api/app/tenants", { name: `Commerce ${slug}`, slug });
  if (tenant.status !== 201) throw new Error(`tenant ${tenant.status} ${JSON.stringify(tenant.body)}`);
  const tenantId = tenant.body.id as string;
  if ((opts.plan ?? "business") !== "free") await setPlan(tenantId, opts.plan ?? "business");
  return { client, email, tenantId };
}

/** Attribue directement une offre active (comme l'admin), sans passer par la facturation. */
export async function setPlan(tenantId: string, code: string, data: object = {}) {
  const plan = await db.subscriptionPlan.findUniqueOrThrow({ where: { code } });
  await db.subscription.update({ where: { tenantId }, data: { planId: plan.id, status: "ACTIVE", provider: "MANUAL", ...data } });
}

export async function createPointsProgram(client: Client, overrides: object = {}) {
  const res = await client.post("/api/app/programs", { name: "Points", mode: "POINTS", currency: "CDF", spendStep: "1000", pointsPerStep: 1, ...overrides });
  if (res.status !== 201) throw new Error(`program ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { id: string };
}

export async function createCustomerWithCard(client: Client, programId: string, phone = randomPhone()) {
  const res = await client.post("/api/app/customers", { firstName: "Awa", lastName: "Test", phone, programId });
  if (res.status !== 201) throw new Error(`customer ${res.status} ${JSON.stringify(res.body)}`);
  const customer = await client.get(`/api/app/customers/${res.body.customer.id}`);
  return { customerId: res.body.customer.id as string, accountId: customer.body.accounts[0].id as string, cardUrl: res.body.cardUrl as string, phone };
}

export function randomPhone() {
  return `+24381${Math.floor(1000000 + Math.random() * 8999999)}`;
}

export async function earn(client: Client, accountId: string, amount: string | null, key = uniq("k-")) {
  return client.post("/api/app/transactions/earn", { accountId, amount, idempotencyKey: key });
}

export async function lastEmail(to: string) {
  return db.emailOutbox.findFirst({ where: { to }, orderBy: { createdAt: "desc" } });
}

/** Ajoute un collaborateur avec un rôle donné via le parcours d'invitation. */
export async function addMember(app: NestExpressApplication, owner: Client, role: "MANAGER" | "CASHIER" | "VIEWER", establishmentIds: string[] = []) {
  const email = `${uniq(role.toLowerCase())}@test.fove`;
  const invite = await owner.post("/api/app/team/invitations", { email, role, establishmentIds });
  if (invite.status !== 201) throw new Error(`invite ${invite.status} ${JSON.stringify(invite.body)}`);
  const mail = await lastEmail(email);
  const token = /token=([A-Za-z0-9_-]+)/.exec(mail!.text)![1]!;
  const member = agent(app);
  const accept = await member.post("/api/auth/invitations/accept", { token, name: "Membre", password: "motdepasse123" });
  if (accept.status !== 201) throw new Error(`accept ${accept.status} ${JSON.stringify(accept.body)}`);
  return member;
}
