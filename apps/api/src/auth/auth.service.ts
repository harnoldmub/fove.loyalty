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
import { requestLocaleOrNull, userLocale, type Locale } from "../i18n/locale";
import { passwordResetMessage, verifyEmailMessage } from "../i18n/emails";

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
        data: { email, name: input.name, passwordHash: await hashPassword(input.password), locale: requestLocaleOrNull(req) },
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
    const locale = requestLocaleOrNull(req);
    await this.prisma.client.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, ...(locale ? { locale } : {}) },
    });
    const membership = await this.prisma.client.tenantMembership.findFirst({
      where: { userId: user.id, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
    });
    await this.sessions.create(user.id, req, res, membership?.tenantId ?? null);
    await this.audit.log({ actorUserId: user.id, action: "auth.login", ip: req.ip });
    return { id: user.id };
  }

  async loginWithGoogle(profile: { email: string; name: string }, req: Request, res: Response) {
    const email = normalizeEmail(profile.email);
    let user = await this.prisma.client.user.findUnique({ where: { email } });
    let created = false;

    if (!user) {
      user = await this.prisma.client.user.create({
        data: {
          email,
          name: profile.name.trim() || email.split("@")[0] || "Utilisateur FOVE",
          // Secret aléatoire inconnu : Google reste le moyen de connexion, sauf
          // si l'utilisateur définit ensuite un mot de passe via « mot de passe oublié ».
          passwordHash: await hashPassword(randomToken("google_", 32)),
          emailVerifiedAt: new Date(),
          locale: requestLocaleOrNull(req),
        },
      });
      created = true;
    } else if (!user.emailVerifiedAt) {
      // Compte jamais confirmé : n'importe qui a pu le créer avec cet email et en connaître le mot de passe.
      // Google prouve que l'email appartient à cette personne : on invalide ce mot de passe et toutes les
      // sessions ouvertes avant de lui confier le compte.
      user = await this.prisma.client.user.update({
        where: { id: user.id },
        data: {
          emailVerifiedAt: new Date(),
          passwordHash: await hashPassword(randomToken("google_", 32)),
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });
      await this.sessions.revokeAllForUser(user.id);
    }

    const membership = await this.prisma.client.tenantMembership.findFirst({
      where: { userId: user.id, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
    });
    await this.sessions.create(user.id, req, res, membership?.tenantId ?? null);
    await this.audit.log({ actorUserId: user.id, action: created ? "auth.signup_google" : "auth.login_google", ip: req.ip });
    return { id: user.id, created };
  }

  async me(auth: AuthState) {
    const memberships = await this.prisma.client.tenantMembership.findMany({
      where: { userId: auth.user.id, status: "ACTIVE" },
      include: { tenant: { include: { settings: true } }, role: true },
      orderBy: { createdAt: "asc" },
    });
    const active = memberships.find((m) => m.tenantId === auth.activeTenantId);
    const tenants = memberships.map((m) => ({
      id: m.tenant.id,
      name: m.tenant.name,
      slug: m.tenant.slug,
      status: m.tenant.status,
      role: m.role.key,
      logoUrl: m.tenant.settings?.logoUrl ?? null,
      primaryColor: m.tenant.settings?.primaryColor ?? "#1F4FFF",
      onboardingCompleted: Boolean(m.tenant.settings?.onboardingCompletedAt),
    }));

    if (auth.supportGrantId && auth.activeTenantId && !tenants.some((t) => t.id === auth.activeTenantId)) {
      const supported = await this.prisma.client.tenant.findUnique({
        where: { id: auth.activeTenantId },
        include: { settings: true },
      });
      if (supported) {
        tenants.unshift({
          id: supported.id,
          name: supported.name,
          slug: supported.slug,
          status: supported.status,
          role: "SUPPORT",
          logoUrl: supported.settings?.logoUrl ?? null,
          primaryColor: supported.settings?.primaryColor ?? "#1F4FFF",
          onboardingCompleted: Boolean(supported.settings?.onboardingCompletedAt),
        });
      }
    }

    return {
      user: auth.user,
      activeTenantId: auth.activeTenantId,
      support: auth.supportGrantId !== null,
      role: active?.role.key ?? (auth.supportGrantId ? "SUPPORT" : null),
      permissions: active?.role.permissions ?? [],
      tenants,
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

  async sendVerification(userId: string, email: string, locale?: Locale | null): Promise<void> {
    const token = randomToken("", 32);
    await this.prisma.client.authToken.create({
      data: { type: "EMAIL_VERIFY", tokenHash: sha256(token), userId, expiresAt: new Date(Date.now() + 2 * 86_400_000) },
    });
    const link = `${loadConfig().APP_URL}/verify-email?token=${token}`;
    const user = await this.prisma.client.user.findUnique({ where: { id: userId }, select: { locale: true } });
    await this.email.send({ to: email, ...verifyEmailMessage(locale ?? userLocale(user), link) });
  }

  async setLocale(auth: AuthState, locale: Locale) {
    await this.prisma.client.user.update({ where: { id: auth.user.id }, data: { locale } });
  }

  async resendVerification(auth: AuthState, locale?: Locale | null) {
    if (auth.user.emailVerifiedAt) return;
    const recent = await this.prisma.client.authToken.count({
      where: { userId: auth.user.id, type: "EMAIL_VERIFY", createdAt: { gt: new Date(Date.now() - 60_000) } },
    });
    if (recent > 0) throw badRequest("too_soon", "Patientez une minute avant de renvoyer l'email");
    await this.sendVerification(auth.user.id, auth.user.email, locale);
  }

  /**
   * Tâche planifiée : une seule relance, 24 h après l'inscription, pour un email
   * toujours pas confirmé. Rien n'est bloqué (l'abonnement payé reste actif) ;
   * seules les clés API et les webhooks attendent la confirmation.
   */
  async sendVerificationReminders(now = new Date()): Promise<number> {
    const users = await this.prisma.client.user.findMany({
      where: {
        emailVerifiedAt: null,
        isSuperAdmin: false,
        createdAt: { lt: new Date(now.getTime() - 86_400_000), gt: new Date(now.getTime() - 7 * 86_400_000) },
      },
      select: { id: true, email: true },
      take: 200,
    });
    let sent = 0;
    for (const user of users) {
      const already = await this.prisma.client.auditLog.count({ where: { actorUserId: user.id, action: "auth.verification_reminder" } });
      if (already > 0) continue;
      await this.sendVerification(user.id, user.email);
      await this.audit.log({ actorUserId: user.id, action: "auth.verification_reminder" });
      sent += 1;
    }
    return sent;
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

  async forgotPassword(emailRaw: string, locale?: Locale | null) {
    const user = await this.prisma.client.user.findUnique({ where: { email: normalizeEmail(emailRaw) } });
    // Réponse identique que l'email existe ou non.
    if (!user) return;
    const token = randomToken("", 32);
    await this.prisma.client.authToken.create({
      data: { type: "PASSWORD_RESET", tokenHash: sha256(token), userId: user.id, expiresAt: new Date(Date.now() + 3_600_000) },
    });
    const resetUrl = `${loadConfig().APP_URL}/reset-password?token=${token}`;
    await this.email.send({ to: user.email, ...passwordResetMessage(locale ?? userLocale(user), resetUrl) });
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
