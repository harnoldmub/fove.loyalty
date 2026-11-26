/**
 * Seed idempotent : permissions, rôles système, offres d'abonnement et super
 * admin initial. Les prix sont des valeurs de départ, modifiables ensuite
 * depuis l'administration FOVE (jamais lus en dur par le code).
 */
import { createHash } from "node:crypto";
import { DEFAULT_FX_RATES, DEFAULT_PLAN_PRICES, DEFAULT_PLANS, PERMISSIONS, ROLE_PERMISSIONS, TENANT_ROLES } from "@fove/shared";
import { createPrismaClient } from "../src/index";

const prisma = createPrismaClient(process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL);

const ROLE_NAMES = { OWNER: "Propriétaire", MANAGER: "Manager", CASHIER: "Caissier", VIEWER: "Lecteur" } as const;


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
    const saved = await prisma.subscriptionPlan.upsert({ where: { code: plan.code }, update: {}, create: plan });
    // Prix manquants ajoutés depuis la grille ; un prix déjà en base (modifié dans l'admin) n'est jamais écrasé.
    for (const [currency, yearlyCents] of Object.entries(DEFAULT_PLAN_PRICES[plan.code] ?? {})) {
      await prisma.planPrice.upsert({ where: { planId_currency: { planId: saved.id, currency } }, update: {}, create: { planId: saved.id, currency, yearlyCents } });
    }
  }
  for (const [currency, unitsPerEur] of Object.entries(DEFAULT_FX_RATES)) {
    await prisma.exchangeRate.upsert({ where: { currency }, update: {}, create: { currency, unitsPerEur } });
  }
}

async function main() {
  await seedReferenceData();
  // Connexion par code envoyé par email (aucun mot de passe) ; en local, le code s'affiche dans les journaux.
  const email = process.env.SEED_SUPERADMIN_EMAIL;
  if (email) {
    await prisma.user.upsert({
      where: { email: email.toLowerCase() },
      update: { isSuperAdmin: true },
      create: {
        email: email.toLowerCase(),
        name: "Administration FOVE",
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
