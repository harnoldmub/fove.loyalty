import { HttpStatus, Injectable } from "@nestjs/common";
import type { Request, Response } from "express";
import { normalizeEmail } from "@fove/shared";
import { randomDigits, safeEqual, sha256 } from "../common/crypto";
import { AppError, badRequest } from "../common/errors";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";
import { EmailService } from "../notifications/email.service";
import { clientConfirmMessage, clientInactivityMessage, clientLoginCodeMessage } from "../i18n/emails";
import { loadConfig } from "../config";
import type { GoogleProfile } from "../auth/google-oauth";
import { DEFAULT_LOCALE, INTL_LOCALE, normalizeLocale, requestLocale, requestLocaleOrNull, type Locale } from "../i18n/locale";
import { ClientSessionService, type ClientAccountView } from "./client-session.service";

/** Prévenance avant suppression d'un compte inactif, et taille des lots de la tâche planifiée. */
const INACTIVITY_NOTICE_MS = 30 * 86_400_000;
const PURGE_BATCH = 200;

const EXPORT_NOTICE: Record<Locale, string> = {
  fr: "Ce fichier contient les données de votre compte FOVE. Les données de vos cartes chez chaque commerce (fiche, historique des passages) sont détenues par ce commerce : adressez-vous à lui pour les obtenir.",
  en: "This file contains your FOVE account data. The data of your cards at each business (customer record, visit history) is held by that business: contact it to obtain it.",
  ar: "يحتوي هذا الملف على بيانات حسابك في FOVE. أما بيانات بطاقاتك لدى كل متجر (الملف، سجل الزيارات) فيحتفظ بها ذلك المتجر: تواصل معه للحصول عليها.",
  es: "Este archivo contiene los datos de tu cuenta FOVE. Los datos de tus tarjetas en cada comercio (ficha, historial de visitas) los conserva ese comercio: ponte en contacto con él para obtenerlos.",
};

const CODE_TTL_MS = 10 * 60_000;
const CODE_MAX_ATTEMPTS = 5;
const RESEND_DELAY_MS = 60_000;
const HOUR_MS = 3_600_000;
const MAX_CODES_PER_EMAIL_HOUR = 5;
// Large : un Wi-Fi de commerce ou un réseau mobile partage une même adresse entre beaucoup de clients.
const MAX_CODES_PER_IP_HOUR = 60;

const codeHash = (email: string, code: string) => sha256(`client:${email}:${code}`);

/**
 * Version des conditions d'utilisation et de la politique de confidentialité du compte client
 * (pages /compte/conditions et /compte/confidentialite). À changer à chaque nouvelle version publiée.
 */
export const CLIENT_TERMS_VERSION = "2026-11-24";

/** Les écrans de création et de connexion affichent « En continuant, vous acceptez… » : on en garde la trace. */
export const termsAccepted = () => ({ termsAcceptedAt: new Date(), termsVersion: CLIENT_TERMS_VERSION });

/**
 * Compte client FOVE : identité unique du client final, commune à tous les commerces.
 * Connexion sans mot de passe, par code à 6 chiffres envoyé par email (Google : sous-lot A4).
 * Aucune réponse ne révèle si un email a un compte.
 */
@Injectable()
export class ClientAccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: ClientSessionService,
    private readonly email: EmailService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Envoie un code à 6 chiffres. Même réponse que l'email ait un compte ou non.
   * `confirm` : email de bienvenue après une inscription au scan, avec un lien qui saisit le code.
   */
  async requestCode(emailRaw: string, req: Request, kind: "login" | "confirm" = "login"): Promise<void> {
    const email = normalizeEmail(emailRaw);
    const ip = req.ip ?? null;
    const db = this.prisma.client;
    const now = Date.now();

    const last = await db.clientLoginCode.findFirst({ where: { email }, orderBy: { createdAt: "desc" } });
    if (last && now - last.createdAt.getTime() < RESEND_DELAY_MS) {
      throw badRequest("too_soon", "Patientez une minute avant de redemander un code");
    }
    const since = new Date(now - HOUR_MS);
    const [perEmail, perIp] = await Promise.all([
      db.clientLoginCode.count({ where: { email, createdAt: { gt: since } } }),
      ip ? db.clientLoginCode.count({ where: { ip, createdAt: { gt: since } } }) : Promise.resolve(0),
    ]);
    if (perEmail >= MAX_CODES_PER_EMAIL_HOUR || perIp >= MAX_CODES_PER_IP_HOUR) {
      throw new AppError(HttpStatus.TOO_MANY_REQUESTS, "too_many_codes", "Trop de codes demandés : réessayez dans une heure");
    }

    const code = randomDigits(6);
    await db.clientLoginCode.create({ data: { email, codeHash: codeHash(email, code), ip, expiresAt: new Date(now + CODE_TTL_MS) } });
    const account = await db.clientAccount.findUnique({ where: { email }, select: { locale: true } });
    const locale = normalizeLocale(account?.locale) ?? requestLocale(req);
    const message =
      kind === "confirm"
        ? clientConfirmMessage(locale, code, `${loadConfig().APP_URL}/mes-cartes/connexion?${new URLSearchParams({ email, code })}`)
        : clientLoginCodeMessage(locale, code);
    await this.email.send({ to: email, ...message });
  }

  /**
   * Vérifie le code. Juste : l'email est confirmé et le client est connecté sur cet appareil ;
   * un email sans compte crée le compte.
   */
  async verifyCode(emailRaw: string, code: string, req: Request, res: Response): Promise<{ created: boolean; account: ClientAccountView }> {
    const email = normalizeEmail(emailRaw);
    const db = this.prisma.client;
    const challenge = await db.clientLoginCode.findFirst({
      where: { email, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!challenge || challenge.attempts >= CODE_MAX_ATTEMPTS) throw badRequest("code_expired", "Code expiré : demandez-en un nouveau");
    if (!safeEqual(challenge.codeHash, codeHash(email, code))) {
      await db.clientLoginCode.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
      throw badRequest("invalid_code", "Code incorrect");
    }
    // Consommation atomique : deux saisies simultanées du même code n'ouvrent qu'une session.
    const consumed = await db.clientLoginCode.updateMany({ where: { id: challenge.id, consumedAt: null }, data: { consumedAt: new Date() } });
    if (consumed.count !== 1) throw badRequest("code_expired", "Code expiré : demandez-en un nouveau");

    let account = await db.clientAccount.findUnique({ where: { email } });
    let created = false;
    if (!account) {
      account = await db.clientAccount.create({ data: { email, emailVerifiedAt: new Date(), locale: requestLocaleOrNull(req), ...termsAccepted() } });
      created = true;
    } else {
      account = await db.clientAccount.update({ where: { id: account.id }, data: termsAccepted() });
    }
    if (!created && !account.emailVerifiedAt) {
      // Compte créé sans preuve de l'email (parcours au scan) : quelqu'un d'autre a pu le créer.
      // Le vrai titulaire reprend la main, les sessions ouvertes jusqu'ici sont fermées.
      account = await db.clientAccount.update({ where: { id: account.id }, data: { emailVerifiedAt: new Date() } });
      await this.sessions.revokeAll(account.id);
      await this.afterEmailVerified(account.id, email);
    }

    await this.sessions.create(account.id, req, res);
    await this.audit.log({ action: created ? "client.signup" : "client.login", targetType: "ClientAccount", targetId: account.id, metadata: { method: "email_code" }, ip: req.ip });
    return { created, account: view(account) };
  }

  /**
   * « Continuer avec Google ». Google garantit l'email (email_verified) : le compte est retrouvé
   * par l'identifiant Google, sinon par l'email, sinon créé, et il est confirmé dans tous les cas.
   */
  async loginWithGoogle(profile: GoogleProfile, req: Request, res: Response): Promise<{ created: boolean }> {
    const email = normalizeEmail(profile.email);
    const db = this.prisma.client;
    let account = (await db.clientAccount.findUnique({ where: { googleSub: profile.sub } })) ?? (await db.clientAccount.findUnique({ where: { email } }));
    let created = false;

    if (!account) {
      account = await db.clientAccount.create({
        data: {
          email,
          emailVerifiedAt: new Date(),
          googleSub: profile.sub,
          firstName: (profile.givenName || profile.name).slice(0, 60),
          lastName: profile.familyName.slice(0, 60),
          locale: requestLocaleOrNull(req),
          ...termsAccepted(),
        },
      });
      created = true;
    } else {
      const wasUnverified = !account.emailVerifiedAt;
      account = await db.clientAccount.update({
        where: { id: account.id },
        data: {
          googleSub: profile.sub,
          emailVerifiedAt: account.emailVerifiedAt ?? new Date(),
          firstName: account.firstName || (profile.givenName || profile.name).slice(0, 60),
          lastName: account.lastName || profile.familyName.slice(0, 60),
          ...termsAccepted(),
        },
      });
      if (wasUnverified) {
        // Même règle que le code : le titulaire de l'email reprend la main sur un compte créé sans preuve.
        await this.sessions.revokeAll(account.id);
        await this.afterEmailVerified(account.id, account.email);
      }
    }

    await this.sessions.create(account.id, req, res);
    await this.audit.log({ action: created ? "client.signup" : "client.login", targetType: "ClientAccount", targetId: account.id, metadata: { method: "google" }, ip: req.ip });
    return { created };
  }

  /**
   * Email prouvé : les cartes en attente d'un programme « code par email » rattachées au compte
   * s'activent (le code du compte remplace celui de la carte), et l'email des fiches est marqué vérifié.
   */
  private async afterEmailVerified(accountId: string, email: string) {
    const db = this.prisma.client;
    const fiches = await db.customer.findMany({ where: { clientAccountId: accountId }, select: { id: true, tenantId: true } });
    if (fiches.length === 0) return;
    const customerIds = fiches.map((f) => f.id);
    await db.$transaction([
      db.loyaltyAccount.updateMany({
        where: { customerId: { in: customerIds }, status: "PENDING_VERIFICATION", program: { enrollmentVerification: "EMAIL_OTP" } },
        data: { status: "ACTIVE" },
      }),
      db.customerIdentity.updateMany({ where: { customerId: { in: customerIds }, kind: "EMAIL", value: email, verifiedAt: null }, data: { verifiedAt: new Date() } }),
    ]);
    await this.audit.log({ action: "client.email_verified", targetType: "ClientAccount", targetId: accountId });
  }

  async updateProfile(accountId: string, input: { firstName: string; lastName: string; phone: string | null }): Promise<ClientAccountView> {
    const account = await this.prisma.client.clientAccount.update({
      where: { id: accountId },
      data: { firstName: input.firstName, lastName: input.lastName, phone: input.phone || null },
    });
    return view(account);
  }

  async logout(sessionId: string | null, res: Response): Promise<void> {
    if (sessionId) await this.sessions.revoke(sessionId);
    this.sessions.clearCookie(res);
  }

  /**
   * Suppression RGPD du compte FOVE. Les fiches et cartes restent chez chaque commerçant,
   * responsable de ses données, et sont seulement détachées du compte.
   */
  async deleteAccount(accountId: string, req: Request, res: Response): Promise<void> {
    const db = this.prisma.client;
    const account = await db.clientAccount.findUniqueOrThrow({ where: { id: accountId }, select: { email: true } });
    await db.$transaction([
      db.customer.updateMany({ where: { clientAccountId: accountId }, data: { clientAccountId: null } }),
      db.clientLoginCode.deleteMany({ where: { email: account.email } }),
      db.clientAccount.delete({ where: { id: accountId } }),
    ]);
    this.sessions.clearCookie(res);
    // Pas d'email dans le journal : le compte supprimé n'y laisse que son identifiant.
    await this.audit.log({ action: "client.account_deleted", targetType: "ClientAccount", targetId: accountId, ip: req.ip });
  }

  /**
   * Droits d'accès et de portabilité : tout ce que Dizayna détient sur le compte, en JSON.
   * Les fiches chez chaque commerce relèvent du commerçant : seul ce que « Mes cartes » montre
   * déjà y figure (commerce, programme, numéro de carte, solde).
   */
  async exportData(accountId: string, req: Request) {
    const db = this.prisma.client;
    const account = await db.clientAccount.findUniqueOrThrow({ where: { id: accountId } });
    const [sessions, fiches, dismissed, journal] = await Promise.all([
      db.clientSession.findMany({
        where: { clientAccountId: accountId },
        orderBy: { createdAt: "desc" },
        select: { userAgent: true, ip: true, createdAt: true, lastSeenAt: true, expiresAt: true },
      }),
      db.customer.findMany({
        where: { clientAccountId: accountId },
        select: {
          tenant: { select: { name: true } },
          accounts: { where: { status: { not: "CLOSED" } }, select: { cardNumber: true, balance: true, status: true, createdAt: true, program: { select: { name: true } } } },
        },
      }),
      db.clientDismissedCustomer.findMany({ where: { clientAccountId: accountId }, select: { createdAt: true, customer: { select: { tenant: { select: { name: true } } } } } }),
      db.auditLog.findMany({
        where: { targetType: "ClientAccount", targetId: accountId },
        orderBy: { createdAt: "asc" },
        select: { action: true, createdAt: true, ip: true, metadata: true },
      }),
    ]);
    await this.audit.log({ action: "client.data_exported", targetType: "ClientAccount", targetId: accountId, ip: req.ip });
    return {
      exportedAt: new Date().toISOString(),
      controller: "Dizayna (FOVE)",
      notice: EXPORT_NOTICE[requestLocale(req)],
      account: {
        email: account.email,
        emailVerifiedAt: account.emailVerifiedAt,
        firstName: account.firstName,
        lastName: account.lastName,
        phone: account.phone,
        locale: account.locale,
        googleId: account.googleSub,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
        lastActiveAt: account.lastActiveAt,
        termsAcceptedAt: account.termsAcceptedAt,
        termsVersion: account.termsVersion,
      },
      sessions,
      businesses: fiches.map((f) => f.tenant.name),
      cards: fiches.flatMap((f) =>
        f.accounts.map((a) => ({ business: f.tenant.name, program: a.program.name, cardNumber: a.cardNumber, balance: a.balance, status: a.status, since: a.createdAt })),
      ),
      dismissedCards: dismissed.map((d) => ({ business: d.customer.tenant.name, at: d.createdAt })),
      securityLog: journal,
    };
  }

  /**
   * Comptes inactifs (tâche planifiée) : ni connexion, ni carte rattachée utilisée en caisse depuis
   * CLIENT_ACCOUNT_INACTIVE_MONTHS mois. Le client est prévenu par email 30 jours avant ; se connecter
   * annule la suppression. La suppression détache les cartes, qui restent chez les commerces.
   */
  async purgeInactive(now = new Date()): Promise<{ warned: number; deleted: number }> {
    const months = loadConfig().CLIENT_ACCOUNT_INACTIVE_MONTHS;
    if (months === 0) return { warned: 0, deleted: 0 };
    const db = this.prisma.client;
    const cutoff = new Date(now);
    cutoff.setMonth(cutoff.getMonth() - months);
    const warnCutoff = new Date(cutoff.getTime() + INACTIVITY_NOTICE_MS);
    const inactiveSince = (date: Date) => ({
      lastActiveAt: { lt: date },
      customers: { none: { accounts: { some: { lastActivityAt: { gte: date } } } } },
    });

    // 1. Prévenance, 30 jours avant. Une prévenance plus ancienne que la période d'inactivité ne compte plus.
    const toWarn = await db.clientAccount.findMany({
      where: { ...inactiveSince(warnCutoff), OR: [{ inactivityWarnedAt: null }, { inactivityWarnedAt: { lt: warnCutoff } }] },
      select: { id: true, email: true, locale: true },
      take: PURGE_BATCH,
    });
    const deletionDate = new Date(now.getTime() + INACTIVITY_NOTICE_MS);
    for (const account of toWarn) {
      const locale = normalizeLocale(account.locale) ?? DEFAULT_LOCALE;
      const date = new Intl.DateTimeFormat(INTL_LOCALE[locale], { dateStyle: "long" }).format(deletionDate);
      const link = `${loadConfig().APP_URL}/mes-cartes/connexion?${new URLSearchParams({ email: account.email })}`;
      await db.clientAccount.update({ where: { id: account.id }, data: { inactivityWarnedAt: now } });
      await this.email.send({ to: account.email, ...clientInactivityMessage(locale, date, link) });
      await this.audit.log({ action: "client.inactivity_warned", targetType: "ClientAccount", targetId: account.id });
    }

    // 2. Suppression : inactif depuis la limite, prévenu il y a au moins 30 jours, et après sa dernière activité.
    const toDelete = await db.clientAccount.findMany({
      where: { ...inactiveSince(cutoff), inactivityWarnedAt: { lte: new Date(now.getTime() - INACTIVITY_NOTICE_MS), gte: cutoff } },
      select: { id: true, email: true },
      take: PURGE_BATCH,
    });
    for (const account of toDelete) {
      await db.$transaction([
        db.customer.updateMany({ where: { clientAccountId: account.id }, data: { clientAccountId: null } }),
        db.clientLoginCode.deleteMany({ where: { email: account.email } }),
        db.clientAccount.delete({ where: { id: account.id } }),
      ]);
      await this.audit.log({ action: "client.account_deleted_inactive", targetType: "ClientAccount", targetId: account.id });
    }
    return { warned: toWarn.length, deleted: toDelete.length };
  }
}

function view(a: ClientAccountView): ClientAccountView {
  return { id: a.id, email: a.email, emailVerifiedAt: a.emailVerifiedAt, firstName: a.firstName, lastName: a.lastName, phone: a.phone, locale: a.locale };
}
