/**
 * Seed idempotent : permissions, rôles système, offres d'abonnement et super
 * admin initial. Les prix sont des valeurs de départ, modifiables ensuite
 * depuis l'administration FOVE (jamais lus en dur par le code).
 */
import { createHash, randomBytes, scryptSync } from "node:crypto";
import { DEFAULT_PLANS, PERMISSIONS, ROLE_PERMISSIONS, TENANT_ROLES } from "@fove/shared";
import { createPrismaClient } from "../src/index";

const prisma = createPrismaClient(process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL);

const ROLE_NAMES = { OWNER: "Propriétaire", MANAGER: "Manager", CASHIER: "Caissier", VIEWER: "Lecteur" } as const;

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
  for (const plan of DEFAULT_PLANS) {
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
