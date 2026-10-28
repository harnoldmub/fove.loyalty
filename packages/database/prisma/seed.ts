/**
 * Seed idempotent : permissions, rôles système, offres d'abonnement et super
 * admin initial. Les prix sont des valeurs de départ, modifiables ensuite
 * depuis l'administration FOVE (jamais lus en dur par le code).
 */
import { createHash, randomBytes, scryptSync } from "node:crypto";
import { PERMISSIONS, ROLE_PERMISSIONS, TENANT_ROLES } from "@fove/shared";
import { createPrismaClient } from "../src/index";

const prisma = createPrismaClient(process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL);

const ROLE_NAMES = { OWNER: "Propriétaire", MANAGER: "Manager", CASHIER: "Caissier", VIEWER: "Lecteur" } as const;

const PLANS = [
  {
    code: "starter",
    name: "Starter",
    description: "Un établissement, un programme, l'essentiel pour fidéliser.",
    priceMonthlyCents: 1290,
    priceYearlyCents: 12900,
    features: { api: false, widget: true, integrations: false, exports: true },
    limits: { customers: 500, establishments: 1, staff: 3, programs: 1 },
    sortOrder: 1,
  },
  {
    code: "business",
    name: "Business",
    description: "Plusieurs points de vente, l'API et le widget.",
    priceMonthlyCents: 2490,
    priceYearlyCents: 24900,
    features: { api: true, widget: true, integrations: true, exports: true },
    limits: { customers: 5000, establishments: 5, staff: 15, programs: 3 },
    sortOrder: 2,
  },
  {
    code: "premium",
    name: "Premium",
    description: "Volumes illimités et intégrations e-commerce.",
    priceMonthlyCents: 4990,
    priceYearlyCents: 49900,
    features: { api: true, widget: true, integrations: true, exports: true },
    limits: { customers: null, establishments: null, staff: null, programs: null },
    sortOrder: 3,
  },
];

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function seedReferenceData(): Promise<void> {
  for (const key of PERMISSIONS) {
    await prisma.permission.upsert({ where: { key }, update: {}, create: { key, description: key } });
  }
  for (const key of TENANT_ROLES) {
    const id = createHash("sha256").update(`role:${key}`).digest("hex");
    const uuid = `${id.slice(0, 8)}-${id.slice(8, 12)}-4${id.slice(13, 16)}-a${id.slice(17, 20)}-${id.slice(20, 32)}`;
    await prisma.role.upsert({
      where: { id: uuid },
      update: { permissions: [...ROLE_PERMISSIONS[key]], name: ROLE_NAMES[key] },
      create: { id: uuid, key, name: ROLE_NAMES[key], permissions: [...ROLE_PERMISSIONS[key]], isSystem: true },
    });
  }
  for (const plan of PLANS) {
    await prisma.subscriptionPlan.upsert({ where: { code: plan.code }, update: {}, create: plan });
  }
}

async function main() {
  await seedReferenceData();
  const email = process.env.SEED_SUPERADMIN_EMAIL;
  const password = process.env.SEED_SUPERADMIN_PASSWORD;
  if (email && password) {
    await prisma.user.upsert({
      where: { email: email.toLowerCase() },
      update: { isSuperAdmin: true },
      create: {
        email: email.toLowerCase(),
        name: "Administration FOVE",
        passwordHash: hashPassword(password),
        emailVerifiedAt: new Date(),
        isSuperAdmin: true,
      },
    });
    console.log(`Super admin prêt : ${email}`);
  }
  console.log("Seed terminé.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
