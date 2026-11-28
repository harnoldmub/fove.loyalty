/**
 * Réinitialise la double authentification d'un compte admin (téléphone perdu, plus de codes de secours).
 * Usage : pnpm --filter @fove/database mfa:reset -- admin@exemple.com
 * À lancer sur le serveur (Railway) : le compte devra réactiver la double authentification à sa prochaine
 * arrivée dans l'administration. Ses sessions sont fermées.
 */
import { createPrismaClient } from "../src/index";

async function main() {
  const email = process.argv.slice(2).find((a) => a.includes("@"))?.trim().toLowerCase();
  if (!email) throw new Error("Email requis : pnpm --filter @fove/database mfa:reset -- admin@exemple.com");
  const db = createPrismaClient();
  const user = await db.user.findUnique({ where: { email } });
  if (!user) throw new Error(`Aucun compte pour ${email}`);
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { totpSecret: null, totpPendingSecret: null, totpEnabledAt: null, totpLastStep: null, totpFailures: 0, totpLockedUntil: null } }),
    db.userRecoveryCode.deleteMany({ where: { userId: user.id } }),
    db.session.deleteMany({ where: { userId: user.id } }),
    db.auditLog.create({ data: { actorUserId: null, action: "auth.mfa_reset_cli", targetType: "user", targetId: user.id, metadata: { email } } }),
  ]);
  console.log(`Double authentification réinitialisée pour ${email} (sessions fermées).`);
  await db.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
