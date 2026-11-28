import { HttpStatus, Injectable } from "@nestjs/common";
import type { Request, Response } from "express";
import { normalizeEmail } from "@fove/shared";
import { randomDigits, safeEqual, sha256 } from "../common/crypto";
import { AppError, badRequest, forbidden } from "../common/errors";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";
import { EmailService } from "../notifications/email.service";
import type { AuthState } from "../common/context";
import { SessionService } from "./session.service";
import { requestLocale, requestLocaleOrNull, normalizeLocale, type Locale } from "../i18n/locale";
import { userLoginCodeMessage } from "../i18n/emails";

/** Code de connexion : validité, essais, délai entre deux codes, quotas par email et par adresse IP. */
const CODE_TTL_MS = 10 * 60_000;
const CODE_MAX_ATTEMPTS = 5;
const RESEND_DELAY_MS = 60_000;
const HOUR_MS = 3_600_000;
const MAX_CODES_PER_EMAIL_HOUR = 5;
const MAX_CODES_PER_EMAIL_DAY = 20;
// Large : un bureau ou un réseau mobile partage une même adresse entre beaucoup de personnes.
const MAX_CODES_PER_IP_HOUR = 60;

const codeHash = (email: string, code: string) => sha256(`user:${email}:${code}`);

/** Espaces d'un compte et espace d'arrivée après connexion (administration, puis commerce, puis partenaire). */
export interface Spaces {
  admin: boolean;
  merchant: boolean;
  partner: boolean;
}
export type Home = "/admin" | "/app" | "/partner";

export function homeFor(spaces: Spaces): Home {
  return spaces.admin ? "/admin" : spaces.merchant ? "/app" : spaces.partner ? "/partner" : "/app";
}

export type CodeVerifyResult = { status: "signed_in"; id: string; created: boolean; admin: boolean; home: Home } | { status: "profile_required" };

/** Accès à l'administration FOVE : son espace d'arrivée après connexion (l'espace commerçant s'ouvre à côté). */
export function isAdminUser(user: { isSuperAdmin: boolean; adminRole: string | null }): boolean {
  return user.isSuperAdmin || user.adminRole === "SUPER_ADMIN" || user.adminRole === "ASSOCIATE" || user.adminRole === "FINANCE_MANAGER";
}

/**
 * Connexion à l'espace FOVE sans mot de passe (docs/chantier-connexion-otp.md) : Google, ou code à
 * 6 chiffres envoyé par email. Le code prouve l'email ; un email inconnu crée le compte (nom et CGU).
 * Aucune réponse à la demande de code ne révèle si un email a un compte.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly email: EmailService,
    private readonly audit: AuditService,
  ) {}

  /** Envoie un code à 6 chiffres. Même réponse que l'email ait un compte ou non. */
  async requestCode(emailRaw: string, req: Request): Promise<void> {
    const email = normalizeEmail(emailRaw);
    const ip = req.ip ?? null;
    const db = this.prisma.client;
    const now = Date.now();
    const last = await db.userLoginCode.findFirst({ where: { email }, orderBy: { createdAt: "desc" } });
    if (last && now - last.createdAt.getTime() < RESEND_DELAY_MS) {
      throw badRequest("too_soon", "Patientez une minute avant de redemander un code");
    }
    const since = new Date(now - HOUR_MS);
    const [perEmail, perIp, perEmailDay] = await Promise.all([
      db.userLoginCode.count({ where: { email, createdAt: { gt: since } } }),
      ip ? db.userLoginCode.count({ where: { ip, createdAt: { gt: since } } }) : Promise.resolve(0),
      // Plafond journalier : borne le nombre d'essais possibles sur un même compte (codes gardés 24 h).
      db.userLoginCode.count({ where: { email, createdAt: { gt: new Date(now - 24 * HOUR_MS) } } }),
    ]);
    if (perEmailDay >= MAX_CODES_PER_EMAIL_DAY) {
      throw new AppError(HttpStatus.TOO_MANY_REQUESTS, "too_many_codes_today", "Trop de codes demandés aujourd'hui : réessayez demain");
    }
    if (perEmail >= MAX_CODES_PER_EMAIL_HOUR || perIp >= MAX_CODES_PER_IP_HOUR) {
      throw new AppError(HttpStatus.TOO_MANY_REQUESTS, "too_many_codes", "Trop de codes demandés : réessayez dans une heure");
    }
    const code = randomDigits(6);
    await db.userLoginCode.create({ data: { email, codeHash: codeHash(email, code), ip, expiresAt: new Date(now + CODE_TTL_MS) } });
    const user = await db.user.findUnique({ where: { email }, select: { locale: true } });
    const locale: Locale = normalizeLocale(user?.locale) ?? requestLocale(req);
    await this.email.send({ to: email, ...userLoginCodeMessage(locale, code) });
  }

  /**
   * Vérifie le code. Compte existant : connecté. Email inconnu : sans nom ni CGU, le code n'est pas
   * consommé et l'écran demande le profil ; avec, le compte est créé (email confirmé) et connecté.
   */
  async verifyCode(input: { email: string; code: string; name?: string; acceptTerms?: true }, req: Request, res: Response): Promise<CodeVerifyResult> {
    const email = normalizeEmail(input.email);
    const db = this.prisma.client;
    const challenge = await db.userLoginCode.findFirst({ where: { email, consumedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
    if (!challenge || challenge.attempts >= CODE_MAX_ATTEMPTS) throw badRequest("code_expired", "Code expiré : demandez-en un nouveau");
    if (!safeEqual(challenge.codeHash, codeHash(email, input.code))) {
      await db.userLoginCode.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
      throw badRequest("invalid_code", "Code incorrect");
    }
    let user = await db.user.findUnique({ where: { email } });
    if (!user && (!input.name || input.acceptTerms !== true)) return { status: "profile_required" };

    // Consommation atomique : deux saisies simultanées du même code n'ouvrent qu'une session.
    const consumed = await db.userLoginCode.updateMany({ where: { id: challenge.id, consumedAt: null }, data: { consumedAt: new Date() } });
    if (consumed.count !== 1) throw badRequest("code_expired", "Code expiré : demandez-en un nouveau");

    const locale = requestLocaleOrNull(req);
    let created = false;
    if (!user) {
      user = await db.user.create({ data: { email, name: input.name!, emailVerifiedAt: new Date(), locale } });
      created = true;
    } else if (!user.emailVerifiedAt || locale) {
      // Email prouvé par le code (comptes antérieurs non confirmés) ; langue de l'écran retenue pour les emails.
      user = await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: user.emailVerifiedAt ?? new Date(), ...(locale ? { locale } : {}) } });
    }
    const membership = await db.tenantMembership.findFirst({ where: { userId: user.id, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
    await this.sessions.create(user.id, req, res, membership?.tenantId ?? null);
    await this.audit.log({ actorUserId: user.id, action: created ? "auth.signup" : "auth.login", ip: req.ip });
    const spaces = await this.spaces(user);
    return { status: "signed_in", id: user.id, created, admin: spaces.admin, home: homeFor(spaces) };
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
          emailVerifiedAt: new Date(),
          locale: requestLocaleOrNull(req),
        },
      });
      created = true;
    } else if (!user.emailVerifiedAt) {
      // Compte antérieur jamais confirmé : Google prouve l'email, les sessions ouvertes avant sont fermées.
      user = await this.prisma.client.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
      await this.sessions.revokeAllForUser(user.id);
    }

    const membership = await this.prisma.client.tenantMembership.findFirst({
      where: { userId: user.id, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
    });
    await this.sessions.create(user.id, req, res, membership?.tenantId ?? null);
    await this.audit.log({ actorUserId: user.id, action: created ? "auth.signup_google" : "auth.login_google", ip: req.ip });
    const spaces = await this.spaces(user);
    return { id: user.id, created, admin: spaces.admin, home: homeFor(spaces) };
  }

  /**
   * Espaces accessibles : administration (rôle admin), commerçant (au moins une entreprise active),
   * partenaire (profil rattaché au compte, ou profil libre au même email confirmé : il sera rattaché
   * à la première visite de l'espace partenaire).
   */
  async spaces(user: { id: string; email: string; emailVerifiedAt: Date | null; isSuperAdmin: boolean; adminRole: string | null; isPartner: boolean }): Promise<Spaces> {
    const db = this.prisma.client;
    const [memberships, partner] = await Promise.all([
      db.tenantMembership.count({ where: { userId: user.id, status: "ACTIVE" } }),
      // Espace partenaire : profil validé, ou candidature en cours (l'espace l'indique). Jamais un profil
      // suspendu ou refusé, même si le compte a été marqué partenaire auparavant.
      db.partner.count({
        where: {
          status: { in: ["APPROVED", "ACTIVE", "PENDING", "UNDER_REVIEW"] },
          OR: [{ userId: user.id }, ...(user.emailVerifiedAt ? [{ userId: null, email: { equals: user.email, mode: "insensitive" as const } }] : [])],
        },
      }),
    ]);
    return { admin: isAdminUser(user), merchant: memberships > 0, partner: partner > 0 };
  }

  async me(auth: AuthState) {
    if (auth.register) return this.registerMe(auth);
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

    const spaces = await this.spaces({ ...auth.user, isPartner: auth.user.isPartner ?? false, adminRole: auth.user.adminRole ?? null });
    return {
      user: auth.user,
      spaces,
      home: homeFor(spaces),
      activeTenantId: auth.activeTenantId,
      support: auth.supportGrantId !== null,
      role: active?.role.key ?? (auth.supportGrantId ? "SUPPORT" : null),
      permissions: active?.role.permissions ?? [],
      tenants,
      register: null,
      /** Code caisse choisi dans le commerce actif (sinon l'espace invite à le choisir). */
      cashierPinSet: Boolean(active?.cashierPinHash),
    };
  }

  /**
   * Session de caisse (docs/chantier-code-caisse.md) : le commerce de la caisse seulement, avec les droits du
   * caissier déverrouillé (aucun si la caisse est verrouillée), jamais ceux du compte qui l'a activée.
   */
  private async registerMe(auth: AuthState) {
    const register = auth.register!;
    const db = this.prisma.client;
    const device = await db.registerDevice.findUniqueOrThrow({ where: { id: register.deviceId }, include: { tenant: { include: { settings: true } } } });
    const lockMs = (device.tenant.settings?.registerLockMinutes ?? 5) * 60_000;
    const unlocked = Boolean(register.membershipId && register.activeAt && Date.now() - register.activeAt.getTime() < lockMs);
    const cashier = unlocked
      ? await db.tenantMembership.findFirst({ where: { id: register.membershipId!, tenantId: device.tenantId, status: "ACTIVE" }, include: { role: true, user: { select: { id: true, name: true } } } })
      : null;
    const t = device.tenant;
    const permissions = cashier ? [...new Set([...(cashier.role.permissions as string[]), "transactions.reverse", "redemptions.cancel"])] : [];
    return {
      user: cashier ? { ...auth.user, id: cashier.user.id, name: cashier.user.name, email: "", isSuperAdmin: false, adminRole: null, isPartner: false } : { ...auth.user, name: device.name, email: "", isSuperAdmin: false, adminRole: null, isPartner: false },
      spaces: { admin: false, merchant: true, partner: false },
      home: "/app" as Home,
      activeTenantId: t.id,
      support: false,
      role: cashier?.role.key ?? null,
      permissions,
      tenants: [
        {
          id: t.id,
          name: t.name,
          slug: t.slug,
          status: t.status,
          role: cashier?.role.key ?? "CASHIER",
          logoUrl: t.settings?.logoUrl ?? null,
          primaryColor: t.settings?.primaryColor ?? "#1F4FFF",
          onboardingCompleted: true,
        },
      ],
      register: { deviceId: device.id, name: device.name, unlocked: Boolean(cashier), cashier: cashier ? { membershipId: cashier.id, name: cashier.user.name } : null, lockMinutes: lockMs / 60_000 },
      cashierPinSet: true,
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

  async setLocale(auth: AuthState, locale: Locale) {
    await this.prisma.client.user.update({ where: { id: auth.user.id }, data: { locale } });
  }
}
