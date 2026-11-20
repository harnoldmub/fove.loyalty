import { HttpStatus, Injectable } from "@nestjs/common";
import type { Request, Response } from "express";
import { normalizeEmail } from "@fove/shared";
import { randomDigits, safeEqual, sha256 } from "../common/crypto";
import { AppError, badRequest } from "../common/errors";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";
import { EmailService } from "../notifications/email.service";
import { clientLoginCodeMessage } from "../i18n/emails";
import { normalizeLocale, requestLocale, requestLocaleOrNull } from "../i18n/locale";
import { ClientSessionService, type ClientAccountView } from "./client-session.service";

const CODE_TTL_MS = 10 * 60_000;
const CODE_MAX_ATTEMPTS = 5;
const RESEND_DELAY_MS = 60_000;
const HOUR_MS = 3_600_000;
const MAX_CODES_PER_EMAIL_HOUR = 5;
// Large : un Wi-Fi de commerce ou un réseau mobile partage une même adresse entre beaucoup de clients.
const MAX_CODES_PER_IP_HOUR = 60;

const codeHash = (email: string, code: string) => sha256(`client:${email}:${code}`);

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

  /** Envoie un code de connexion. Même réponse que l'email ait un compte ou non. */
  async requestCode(emailRaw: string, req: Request): Promise<void> {
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
    await this.email.send({ to: email, ...clientLoginCodeMessage(locale, code) });
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
      account = await db.clientAccount.create({ data: { email, emailVerifiedAt: new Date(), locale: requestLocaleOrNull(req) } });
      created = true;
    } else if (!account.emailVerifiedAt) {
      // Compte créé sans preuve de l'email (parcours au scan) : quelqu'un d'autre a pu le créer.
      // Le vrai titulaire reprend la main, les sessions ouvertes jusqu'ici sont fermées.
      account = await db.clientAccount.update({ where: { id: account.id }, data: { emailVerifiedAt: new Date() } });
      await this.sessions.revokeAll(account.id);
    }

    await this.sessions.create(account.id, req, res);
    await this.audit.log({ action: created ? "client.signup" : "client.login", targetType: "ClientAccount", targetId: account.id, metadata: { method: "email_code" }, ip: req.ip });
    return { created, account: view(account) };
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
}

function view(a: ClientAccountView): ClientAccountView {
  return { id: a.id, email: a.email, emailVerifiedAt: a.emailVerifiedAt, firstName: a.firstName, lastName: a.lastName, phone: a.phone, locale: a.locale };
}
