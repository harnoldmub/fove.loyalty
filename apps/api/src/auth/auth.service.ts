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
    await this.email.send({
      to: user.email,
      subject: "Réinitialisation de votre mot de passe — FOVE",
      text: `Pour choisir un nouveau mot de passe, ouvrez ce lien (valable 1 h) :\n${loadConfig().APP_URL}/reset-password?token=${token}\n\nSi vous n'avez rien demandé, ignorez ce message.`,
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
