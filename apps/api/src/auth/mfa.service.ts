import { randomInt } from "node:crypto";
import { HttpStatus, Injectable } from "@nestjs/common";
import QRCode from "qrcode";
import { loadConfig } from "../config";
import { decrypt, encrypt, sha256 } from "../common/crypto";
import { AppError, badRequest } from "../common/errors";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";
import type { AuthState } from "../common/context";
import { isAdminUser } from "./auth.service";
import { generateTotpSecret, otpauthUri, verifyTotp } from "./totp";

/** L'administration reste ouverte 12 h après la double authentification ; ensuite, seul le code de l'application est redemandé. */
export const MFA_ADMIN_HOURS = 12;
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60_000;
const RECOVERY_CODES = 10;

/** Code de secours lisible : XXXX-XXXX (sans caractères ambigus). */
const RECOVERY_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
function recoveryCode(): string {
  const pick = () => RECOVERY_ALPHABET[randomInt(0, RECOVERY_ALPHABET.length)];
  return `${Array.from({ length: 4 }, pick).join("")}-${Array.from({ length: 4 }, pick).join("")}`;
}
const recoveryHash = (userId: string, code: string) => sha256(`recovery:${userId}:${code.replace(/[\s-]/g, "").toUpperCase()}`);

export type MfaStatus = { required: boolean; enabled: boolean; verified: boolean; lockedUntil: Date | null; recoveryCodesLeft: number };

/**
 * Double authentification des comptes admin (docs/securite.md) : application TOTP, codes de secours,
 * administration ouverte 12 h après vérification. Désactivable seulement par ADMIN_MFA=off (local, tests).
 */
@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Double authentification exigée pour ce compte (admin, et non désactivée par la configuration). */
  isRequired(user: AuthState["user"]): boolean {
    return loadConfig().ADMIN_MFA === "required" && isAdminUser({ isSuperAdmin: user.isSuperAdmin, adminRole: user.adminRole ?? null });
  }

  /** Session vérifiée depuis moins de 12 h. */
  isFresh(auth: Pick<AuthState, "mfaVerifiedAt">, now = Date.now()): boolean {
    return Boolean(auth.mfaVerifiedAt && now - auth.mfaVerifiedAt.getTime() < MFA_ADMIN_HOURS * 3_600_000);
  }

  async status(auth: AuthState): Promise<MfaStatus> {
    const user = await this.prisma.client.user.findUniqueOrThrow({ where: { id: auth.user.id }, select: { totpEnabledAt: true, totpLockedUntil: true } });
    const recoveryCodesLeft = user.totpEnabledAt ? await this.prisma.client.userRecoveryCode.count({ where: { userId: auth.user.id, usedAt: null } }) : 0;
    const required = this.isRequired(auth.user);
    return {
      required,
      enabled: Boolean(user.totpEnabledAt),
      verified: !required || (Boolean(user.totpEnabledAt) && this.isFresh(auth)),
      lockedUntil: user.totpLockedUntil && user.totpLockedUntil > new Date() ? user.totpLockedUntil : null,
      recoveryCodesLeft,
    };
  }

  /** Activation, étape 1 : nouveau secret (en attente), QR code et clé à saisir à la main. */
  async startEnrollment(auth: AuthState) {
    const user = await this.prisma.client.user.findUniqueOrThrow({ where: { id: auth.user.id } });
    if (user.totpEnabledAt) throw badRequest("mfa_already_enabled", "La double authentification est déjà activée");
    const secret = generateTotpSecret();
    await this.prisma.client.user.update({ where: { id: user.id }, data: { totpPendingSecret: encrypt(secret, loadConfig().APP_ENCRYPTION_KEY) } });
    const uri = otpauthUri(secret, user.email);
    const qrSvg = await QRCode.toString(uri, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
    return { secret: secret.match(/.{1,4}/g)!.join(" "), uri, qrSvg };
  }

  /** Activation, étape 2 : premier code juste, puis codes de secours (affichés une seule fois). */
  async confirmEnrollment(auth: AuthState, code: string) {
    const user = await this.prisma.client.user.findUniqueOrThrow({ where: { id: auth.user.id } });
    if (user.totpEnabledAt) throw badRequest("mfa_already_enabled", "La double authentification est déjà activée");
    if (!user.totpPendingSecret) throw badRequest("mfa_not_started", "Recommencez l'activation de la double authentification");
    await this.assertNotLocked(user);
    const secret = decrypt(user.totpPendingSecret, loadConfig().APP_ENCRYPTION_KEY);
    const step = verifyTotp(secret, code);
    if (step === null) return this.fail(user.id, "invalid_code");
    const codes = Array.from({ length: RECOVERY_CODES }, recoveryCode);
    const now = new Date();
    await this.prisma.client.$transaction([
      this.prisma.client.user.update({
        where: { id: user.id },
        data: { totpSecret: user.totpPendingSecret, totpPendingSecret: null, totpEnabledAt: now, totpLastStep: step, totpFailures: 0, totpLockedUntil: null },
      }),
      this.prisma.client.userRecoveryCode.deleteMany({ where: { userId: user.id } }),
      this.prisma.client.userRecoveryCode.createMany({ data: codes.map((c) => ({ userId: user.id, codeHash: recoveryHash(user.id, c) })) }),
      this.prisma.client.session.update({ where: { id: auth.sessionId }, data: { mfaVerifiedAt: now } }),
    ]);
    await this.audit.log({ actorUserId: user.id, action: "auth.mfa_enabled", targetType: "user", targetId: user.id });
    return { recoveryCodes: codes };
  }

  /** Vérification : code de l'application, ou code de secours (utilisable une fois). */
  async verify(auth: AuthState, rawCode: string, ip?: string) {
    const user = await this.prisma.client.user.findUniqueOrThrow({ where: { id: auth.user.id } });
    if (!user.totpEnabledAt || !user.totpSecret) throw new AppError(HttpStatus.FORBIDDEN, "mfa_setup_required", "Activez d'abord la double authentification");
    await this.assertNotLocked(user);
    const code = rawCode.trim();
    const now = new Date();

    if (/^\d{6}$/.test(code)) {
      const step = verifyTotp(decrypt(user.totpSecret, loadConfig().APP_ENCRYPTION_KEY), code);
      // Un code déjà utilisé (même pas de 30 s ou antérieur) est refusé : pas de rejeu.
      if (step === null || (user.totpLastStep !== null && step <= user.totpLastStep)) return this.fail(user.id, "invalid_code");
      const accepted = await this.prisma.client.user.updateMany({
        where: { id: user.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
        data: { totpLastStep: step, totpFailures: 0, totpLockedUntil: null },
      });
      if (accepted.count !== 1) return this.fail(user.id, "invalid_code");
    } else {
      const used = await this.prisma.client.userRecoveryCode.updateMany({
        where: { userId: user.id, codeHash: recoveryHash(user.id, code), usedAt: null },
        data: { usedAt: now },
      });
      if (used.count !== 1) return this.fail(user.id, "invalid_code");
      await this.prisma.client.user.update({ where: { id: user.id }, data: { totpFailures: 0, totpLockedUntil: null } });
      await this.audit.log({ actorUserId: user.id, action: "auth.mfa_recovery_used", targetType: "user", targetId: user.id, ip });
    }
    await this.prisma.client.session.update({ where: { id: auth.sessionId }, data: { mfaVerifiedAt: now } });
    await this.audit.log({ actorUserId: user.id, action: "auth.mfa_verified", targetType: "user", targetId: user.id, ip });
    return { verified: true };
  }

  /** Nouveaux codes de secours (les anciens ne marchent plus) ; exige une vérification récente. */
  async regenerateRecoveryCodes(auth: AuthState) {
    const user = await this.prisma.client.user.findUniqueOrThrow({ where: { id: auth.user.id } });
    if (!user.totpEnabledAt) throw new AppError(HttpStatus.FORBIDDEN, "mfa_setup_required", "Activez d'abord la double authentification");
    if (!this.isFresh(auth)) throw new AppError(HttpStatus.FORBIDDEN, "mfa_required", "Confirmez avec le code de votre application");
    const codes = Array.from({ length: RECOVERY_CODES }, recoveryCode);
    await this.prisma.client.$transaction([
      this.prisma.client.userRecoveryCode.deleteMany({ where: { userId: user.id } }),
      this.prisma.client.userRecoveryCode.createMany({ data: codes.map((c) => ({ userId: user.id, codeHash: recoveryHash(user.id, c) })) }),
    ]);
    await this.audit.log({ actorUserId: user.id, action: "auth.mfa_recovery_regenerated", targetType: "user", targetId: user.id });
    return { recoveryCodes: codes };
  }

  private async assertNotLocked(user: { totpLockedUntil: Date | null }) {
    if (user.totpLockedUntil && user.totpLockedUntil > new Date()) {
      throw new AppError(HttpStatus.TOO_MANY_REQUESTS, "mfa_locked", "Trop d'essais : réessayez dans 15 minutes");
    }
  }

  /** Essai manqué : au 5e, blocage de 15 minutes. */
  private async fail(userId: string, code: string): Promise<never> {
    const user = await this.prisma.client.user.update({ where: { id: userId }, data: { totpFailures: { increment: 1 } } });
    if (user.totpFailures >= MAX_FAILURES) {
      await this.prisma.client.user.update({ where: { id: userId }, data: { totpFailures: 0, totpLockedUntil: new Date(Date.now() + LOCK_MS) } });
      await this.audit.log({ actorUserId: userId, action: "auth.mfa_locked", targetType: "user", targetId: userId });
    }
    throw badRequest(code, "Code incorrect");
  }
}
