import { Injectable } from "@nestjs/common";
import type { Request, Response } from "express";
import { normalizeEmail, type SignupInput } from "@fove/shared";
import { loadConfig } from "../config";
import { DUMMY_PASSWORD_HASH, hashPassword, randomToken, sha256, verifyPassword } from "../common/crypto";
import { badRequest, conflict, forbidden, isUniqueViolation, unauthorized } from "../common/errors";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";
import { EmailService } from "../notifications/email.service";
import type { AuthState } from "../common/context";
import { SessionService } from "./session.service";

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly email: EmailService,
    private readonly audit: AuditService,
  ) {}

  async signup(input: SignupInput, req: Request, res: Response) {
    const email = normalizeEmail(input.email);
    try {
      const user = await this.prisma.client.user.create({
        data: { email, name: input.name, passwordHash: await hashPassword(input.password) },
      });
      await this.sendVerification(user.id, user.email);
      await this.sessions.create(user.id, req, res);
      await this.audit.log({ actorUserId: user.id, action: "auth.signup", ip: req.ip });
      return { id: user.id };
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict("email_taken", "Un compte existe déjà avec cet email");
      throw error;
    }
  }

  async login(emailRaw: string, password: string, req: Request, res: Response) {
    const email = normalizeEmail(emailRaw);
    const user = await this.prisma.client.user.findUnique({ where: { email } });
    if (!user) {
      await verifyPassword(password, DUMMY_PASSWORD_HASH);
      throw unauthorized("Email ou mot de passe incorrect");
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw forbidden("Trop de tentatives : compte bloqué quelques minutes");
    }
    if (!(await verifyPassword(password, user.passwordHash))) {
      const failed = user.failedLoginCount + 1;
      await this.prisma.client.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: failed >= MAX_FAILED_LOGINS ? 0 : failed,
          lockedUntil: failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
        },
      });
      if (failed >= MAX_FAILED_LOGINS) await this.audit.log({ actorUserId: user.id, action: "auth.locked", ip: req.ip });
      throw unauthorized("Email ou mot de passe incorrect");
    }
    await this.prisma.client.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });
    const membership = await this.prisma.client.tenantMembership.findFirst({
      where: { userId: user.id, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
    });
    await this.sessions.create(user.id, req, res, membership?.tenantId ?? null);
    await this.audit.log({ actorUserId: user.id, action: "auth.login", ip: req.ip });
    return { id: user.id };
  }

  async me(auth: AuthState) {
    const memberships = await this.prisma.client.tenantMembership.findMany({
      where: { userId: auth.user.id, status: "ACTIVE" },
      include: { tenant: { include: { settings: true } }, role: true },
      orderBy: { createdAt: "asc" },
    });
    const active = memberships.find((m) => m.tenantId === auth.activeTenantId);
    return {
      user: auth.user,
      activeTenantId: auth.activeTenantId,
      support: auth.supportGrantId !== null,
      role: active?.role.key ?? (auth.supportGrantId ? "SUPPORT" : null),
      permissions: active?.role.permissions ?? [],
      tenants: memberships.map((m) => ({
        id: m.tenant.id,
        name: m.tenant.name,
        slug: m.tenant.slug,
        status: m.tenant.status,
        role: m.role.key,
        logoUrl: m.tenant.settings?.logoUrl ?? null,
        primaryColor: m.tenant.settings?.primaryColor ?? "#1F4FFF",
        onboardingCompleted: Boolean(m.tenant.settings?.onboardingCompletedAt),
      })),
    };
  }

  async switchTenant(auth: AuthState, tenantId: string) {
    const membership = await this.prisma.client.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId: auth.user.id } },
    });
    if (!membership || membership.status !== "ACTIVE") throw forbidden("Vous n'êtes pas membre de cette entreprise");
    await this.prisma.client.session.update({
      where: { id: auth.sessionId },
      data: { activeTenantId: tenantId, supportGrantId: null },
    });
  }

  async sendVerification(userId: string, email: string): Promise<void> {
    const token = randomToken("", 32);
    await this.prisma.client.authToken.create({
      data: { type: "EMAIL_VERIFY", tokenHash: sha256(token), userId, expiresAt: new Date(Date.now() + 2 * 86_400_000) },
    });
    const link = `${loadConfig().APP_URL}/verify-email?token=${token}`;
    await this.email.send({
      to: email,
      subject: "Confirmez votre adresse email — FOVE",
      text: `Bienvenue sur FOVE.\n\nConfirmez votre adresse en ouvrant ce lien (valable 48 h) :\n${link}\n\nSi vous n'êtes pas à l'origine de cette inscription, ignorez ce message.`,
      html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirmez votre adresse email</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f9fafb; margin: 0; padding: 24px; color: #111827;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb; overflow: hidden;">
    <tr>
      <td style="padding: 32px 32px 24px;">
        <h2 style="font-size: 20px; font-weight: 700; margin-top: 0; margin-bottom: 16px; color: #0d1322;">Bienvenue sur FOVE</h2>
        <p style="font-size: 15px; line-height: 24px; color: #4b5563; margin-top: 0; margin-bottom: 24px;">
          Confirmez votre adresse email en cliquant sur le bouton ci-dessous pour activer toutes les fonctionnalités de votre commerce (valable 48 h) :
        </p>
        <table border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
          <tr>
            <td align="center" style="border-radius: 8px;" bgcolor="#2C55F5">
              <a href="${link}" target="_blank" rel="noopener noreferrer" style="font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; display: inline-block;">
                Confirmer mon adresse email
              </a>
            </td>
          </tr>
        </table>
        <p style="font-size: 13px; line-height: 20px; color: #6b7280; margin-bottom: 8px;">
          Si le bouton ne fonctionne pas, copiez-collez l'adresse suivante dans votre navigateur :
        </p>
        <p style="font-size: 12px; line-height: 18px; color: #2C55F5; word-break: break-all; margin-top: 0; margin-bottom: 24px;">
          <a href="${link}" style="color: #2C55F5;">${link}</a>
        </p>
        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 24px 0;">
        <p style="font-size: 12px; line-height: 18px; color: #9ca3af; margin: 0;">
          Si vous n'êtes pas à l'origine de cette inscription, vous pouvez ignorer cet email.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`,
    });
  }

  async resendVerification(auth: AuthState) {
    if (auth.user.emailVerifiedAt) return;
    const recent = await this.prisma.client.authToken.count({
      where: { userId: auth.user.id, type: "EMAIL_VERIFY", createdAt: { gt: new Date(Date.now() - 60_000) } },
    });
    if (recent > 0) throw badRequest("too_soon", "Patientez une minute avant de renvoyer l'email");
    await this.sendVerification(auth.user.id, auth.user.email);
  }

  private async consumeToken(type: "EMAIL_VERIFY" | "PASSWORD_RESET", token: string) {
    const record = await this.prisma.client.authToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!record || record.type !== type || record.usedAt || record.expiresAt < new Date()) {
      throw badRequest("invalid_token", "Lien invalide ou expiré");
    }
    const { count } = await this.prisma.client.authToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (count === 0) throw badRequest("invalid_token", "Lien déjà utilisé");
    return record;
  }

  async verifyEmail(token: string) {
    const record = await this.consumeToken("EMAIL_VERIFY", token);
    await this.prisma.client.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } });
  }

  async forgotPassword(emailRaw: string) {
    const user = await this.prisma.client.user.findUnique({ where: { email: normalizeEmail(emailRaw) } });
    // Réponse identique que l'email existe ou non.
    if (!user) return;
    const token = randomToken("", 32);
    await this.prisma.client.authToken.create({
      data: { type: "PASSWORD_RESET", tokenHash: sha256(token), userId: user.id, expiresAt: new Date(Date.now() + 3_600_000) },
    });
    const resetUrl = `${loadConfig().APP_URL}/reset-password?token=${token}`;
    await this.email.send({
      to: user.email,
      subject: "Réinitialisation de votre mot de passe — FOVE",
      text: `Bonjour,\n\nVous avez demandé la réinitialisation de votre mot de passe pour votre compte FOVE.\n\nPour choisir un nouveau mot de passe, ouvrez ce lien (valable 1 heure) :\n${resetUrl}\n\nSi vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email en toute sécurité.\n\nL'équipe FOVE`,
      html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Réinitialisation de votre mot de passe</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f9fafb; margin: 0; padding: 24px; color: #111827;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb; overflow: hidden;">
    <tr>
      <td style="padding: 32px 32px 24px;">
        <h2 style="font-size: 20px; font-weight: 700; margin-top: 0; margin-bottom: 16px; color: #0d1322;">Réinitialisation de mot de passe</h2>
        <p style="font-size: 15px; line-height: 24px; color: #4b5563; margin-top: 0; margin-bottom: 24px;">
          Bonjour,<br><br>
          Vous avez demandé à réinitialiser le mot de passe de votre compte <strong>FOVE</strong>. Cliquez sur le bouton ci-dessous pour choisir votre nouveau mot de passe (ce lien est valable 1 heure) :
        </p>
        <table border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
          <tr>
            <td align="center" style="border-radius: 8px;" bgcolor="#2C55F5">
              <a href="${resetUrl}" target="_blank" rel="noopener noreferrer" style="font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; display: inline-block;">
                Réinitialiser mon mot de passe
              </a>
            </td>
          </tr>
        </table>
        <p style="font-size: 13px; line-height: 20px; color: #6b7280; margin-bottom: 8px;">
          Si le bouton ne fonctionne pas, copiez-collez l'adresse suivante dans votre navigateur :
        </p>
        <p style="font-size: 12px; line-height: 18px; color: #2C55F5; word-break: break-all; margin-top: 0; margin-bottom: 24px;">
          <a href="${resetUrl}" style="color: #2C55F5;">${resetUrl}</a>
        </p>
        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 24px 0;">
        <p style="font-size: 12px; line-height: 18px; color: #9ca3af; margin: 0;">
          Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email. Votre mot de passe actuel reste inchangé.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`,
    });
  }

  async resetPassword(token: string, password: string) {
    const record = await this.consumeToken("PASSWORD_RESET", token);
    await this.prisma.client.user.update({
      where: { id: record.userId },
      data: { passwordHash: await hashPassword(password), failedLoginCount: 0, lockedUntil: null, emailVerifiedAt: new Date() },
    });
    await this.sessions.revokeAllForUser(record.userId);
    await this.audit.log({ actorUserId: record.userId, action: "auth.password_reset" });
  }
}
