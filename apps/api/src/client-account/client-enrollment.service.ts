import { HttpStatus, Injectable } from "@nestjs/common";
import type { Request, Response } from "express";
import type { z } from "zod";
import { normalizeEmail, normalizePhone, type clientJoinSchema, type clientJoinSignupSchema } from "@fove/shared";
import type { Prisma } from "@fove/database";
import { AppError, badRequest, conflict, isUniqueViolation } from "../common/errors";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";
import type { TenantContext } from "../common/context";
import { CustomersService } from "../customers/customers.service";
import { createCard } from "../loyalty/cards";
import { CardsService } from "../cards/cards.service";
import { QuotaAlertService } from "../billing/quota-alert.service";
import { WebhooksService } from "../notifications/webhooks.service";
import { PublicService } from "../public/public.service";
import { requestLocaleOrNull } from "../i18n/locale";
import { ClientAccountService, termsAccepted } from "./client-account.service";
import { ClientSessionService } from "./client-session.service";

type Link = Awaited<ReturnType<PublicService["link"]>>;
type JoinInput = z.infer<typeof clientJoinSchema>;
type SignupInput = z.infer<typeof clientJoinSignupSchema>;
interface Account {
  id: string;
  email: string;
  emailVerifiedAt: Date | null;
  firstName: string;
  lastName: string;
  phone: string | null;
}

/** Situation du visiteur sur la page d'inscription d'un commerce. */
export type JoinState =
  | { state: "anonymous" }
  | { state: "has_card"; cardPath: string }
  | { state: "can_join"; profile: { firstName: string; lastName: string; phone: string | null; email: string }; verified: boolean }
  | { state: "needs_confirmation"; email: string };

interface Enrolled {
  accountId: string;
  customerId: string;
  customerCreated: boolean;
  cardCreated: boolean;
  status: string;
}

const ACCOUNT_SELECT = { id: true, email: true, emailVerifiedAt: true, firstName: true, lastName: true, phone: true } as const;

function publicCtx(tenantId: string): TenantContext {
  return { tenantId, readOnly: false, actor: { type: "system", label: "public-enrollment" } };
}

const confirmationRequired = () =>
  new AppError(HttpStatus.FORBIDDEN, "confirmation_required", "Confirmez votre email pour ajouter cette carte");

/**
 * Inscription au scan du QR d'un commerce avec le compte client FOVE (sous-lot A2).
 * Règles : docs/chantier-compte-fove.md, sections 3.1 et 4.
 * - Rattachement uniquement sur l'email vérifié du compte, jamais sur le téléphone.
 * - Un compte non confirmé peut toujours revenir chez le même commerce, mais doit confirmer
 *   son email pour un 2e commerce ou pour reprendre une fiche existante.
 */
@Injectable()
export class ClientEnrollmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publicService: PublicService,
    private readonly customers: CustomersService,
    private readonly cards: CardsService,
    private readonly accounts: ClientAccountService,
    private readonly sessions: ClientSessionService,
    private readonly audit: AuditService,
    private readonly webhooks: WebhooksService,
    private readonly quotaAlerts: QuotaAlertService,
  ) {}

  async state(token: string, req: Request, res: Response): Promise<JoinState> {
    const link = await this.publicService.link(token);
    const session = await this.sessions.resolve(req, res);
    if (!session) return { state: "anonymous" };
    const account = await this.prisma.client.clientAccount.findUniqueOrThrow({ where: { id: session.account.id }, select: ACCOUNT_SELECT });
    return this.stateFor(link, account);
  }

  /** Rejoindre le programme en étant connecté. */
  async join(token: string, accountId: string, input: JoinInput, req: Request) {
    const link = await this.publicService.link(token);
    const account = await this.prisma.client.clientAccount.findUniqueOrThrow({ where: { id: accountId }, select: ACCOUNT_SELECT });
    const state = await this.stateFor(link, account);
    if (state.state === "has_card") return { state: "joined" as const, cardPath: state.cardPath, status: "EXISTING" };
    if (state.state === "needs_confirmation") throw confirmationRequired();

    const enrolled = await this.run(link, (tx) => this.enrollInTx(tx, link, account, input));
    if (enrolled.cardCreated && enrolled.status === "PENDING_VERIFICATION" && link.program.enrollmentVerification === "EMAIL_OTP") {
      // Le code de confirmation du compte active aussi la carte.
      await this.accounts.requestCode(account.email, req, "confirm").catch(() => undefined);
    }
    return this.finish(link, enrolled, req, account.email);
  }

  /**
   * « Créer ma carte » sans être connecté. Email nouveau : compte créé non confirmé, connecté sur
   * cet appareil, carte utilisable tout de suite. Email déjà connu (compte FOVE ou fiche chez ce
   * commerce) : un code part, à saisir avant de créer ou retrouver la carte (décision du 24/11/2026).
   */
  async signup(token: string, input: SignupInput, req: Request, res: Response) {
    if (input.website) throw badRequest("rejected", "Inscription refusée");
    const link = await this.publicService.link(token);
    const email = normalizeEmail(input.email);

    const [knownAccount, knownHere] = await Promise.all([
      this.prisma.client.clientAccount.findUnique({ where: { email }, select: { id: true } }),
      this.prisma.client.customerIdentity.findUnique({ where: { tenantId_kind_value: { tenantId: link.tenantId, kind: "EMAIL", value: email } } }),
    ]);
    if (knownAccount || knownHere) return this.sendCode(email, req);

    let account: Account;
    let enrolled: Enrolled;
    try {
      ({ account, enrolled } = await this.run(link, async (tx) => {
        const created = await tx.clientAccount.create({
          data: { email, firstName: input.firstName, lastName: input.lastName, locale: requestLocaleOrNull(req), ...termsAccepted() },
          select: ACCOUNT_SELECT,
        });
        await this.audit.log({ action: "client.signup", targetType: "ClientAccount", targetId: created.id, metadata: { method: "enrollment" }, ip: req.ip }, tx);
        return { account: created, enrolled: await this.enrollInTx(tx, link, created, input) };
      }));
    } catch (error) {
      // Course entre deux inscriptions avec le même email : on bascule sur le code.
      if (isUniqueViolation(error) && (await this.prisma.client.clientAccount.findUnique({ where: { email } }))) return this.sendCode(email, req);
      throw error;
    }

    await this.sessions.create(account.id, req, res);
    await this.accounts.requestCode(email, req, "confirm").catch(() => undefined);
    return this.finish(link, enrolled, req, email);
  }

  private async sendCode(email: string, req: Request) {
    try {
      await this.accounts.requestCode(email, req);
    } catch (error) {
      // Un code vient déjà de partir : le client le saisit.
      if (!(error instanceof AppError && error.code === "too_soon")) throw error;
    }
    return { state: "code_sent" as const, email };
  }

  private async stateFor(link: Link, account: Account): Promise<JoinState> {
    const db = this.prisma.client;
    const fiche = await db.customer.findUnique({ where: { tenantId_clientAccountId: { tenantId: link.tenantId, clientAccountId: account.id } }, select: { id: true } });
    if (fiche) {
      const card = await db.loyaltyAccount.findFirst({
        where: { tenantId: link.tenantId, customerId: fiche.id, programId: link.programId, status: { not: "CLOSED" } },
        select: { id: true },
      });
      // Une carte chez ce commerce : jamais bloquée, même sans email confirmé.
      if (card) return { state: "has_card", cardPath: await this.cardPath(card.id, link.tenantId) };
    } else if (!account.emailVerifiedAt) {
      const [elsewhere, emailFicheHere] = await Promise.all([
        db.customer.count({ where: { clientAccountId: account.id } }),
        db.customerIdentity.findUnique({ where: { tenantId_kind_value: { tenantId: link.tenantId, kind: "EMAIL", value: account.email } } }),
      ]);
      if (elsewhere > 0 || emailFicheHere) return { state: "needs_confirmation", email: account.email };
    }
    return {
      state: "can_join",
      profile: { firstName: account.firstName, lastName: account.lastName, phone: account.phone, email: account.email },
      verified: Boolean(account.emailVerifiedAt),
    };
  }

  private async enrollInTx(tx: Prisma.TransactionClient, link: Link, account: Account, input: JoinInput): Promise<Enrolled> {
    const tenantId = link.tenantId;
    const program = link.program;
    let firstName = input.firstName || account.firstName;
    let lastName = input.lastName || account.lastName;

    // 1. Fiche déjà rattachée au compte, sinon fiche du commerce avec l'email vérifié du compte (4.2).
    let customer = await tx.customer.findUnique({ where: { tenantId_clientAccountId: { tenantId, clientAccountId: account.id } } });
    let customerCreated = false;
    if (!customer && account.emailVerifiedAt) {
      const byEmail = await tx.customerIdentity.findUnique({ where: { tenantId_kind_value: { tenantId, kind: "EMAIL", value: account.email } } });
      if (byEmail) {
        const owned = await tx.customer.updateMany({ where: { id: byEmail.customerId, tenantId, clientAccountId: null, anonymizedAt: null }, data: { clientAccountId: account.id } });
        if (owned.count === 1) customer = await tx.customer.findUnique({ where: { id: byEmail.customerId } });
      }
    }

    // Téléphone facultatif : l'email du compte identifie toujours la fiche.
    const country = link.tenant.settings?.country ?? "CD";
    let phone: string | null = null;
    if (input.phone) {
      phone = normalizePhone(input.phone, country);
      if (!phone) throw badRequest("invalid_phone", "Numéro de téléphone invalide");
    }

    // 2. Sinon nouvelle fiche. Un téléphone déjà connu chez ce commerce appartient peut-être à
    //    quelqu'un d'autre (numéro réattribué) : la fiche est créée sans lui.
    if (!customer) {
      if (!firstName) throw badRequest("first_name_required", "Indiquez votre prénom");
      const phoneTaken = phone ? await tx.customerIdentity.findUnique({ where: { tenantId_kind_value: { tenantId, kind: "PHONE", value: phone } } }) : null;
      const created = await this.customers.createInTx(
        tx,
        publicCtx(tenantId),
        {
          firstName,
          lastName,
          phone: phoneTaken ? null : phone,
          email: account.email,
          externalRef: null,
          marketingEmailConsent: input.marketingConsent,
          marketingSmsConsent: input.marketingConsent && Boolean(phone) && !phoneTaken,
          termsAcceptedAt: new Date(),
        },
        "QR_ENROLLMENT",
      );
      customer = await tx.customer.update({ where: { id: created.id }, data: { clientAccountId: account.id } });
      customerCreated = true;
    } else {
      // Fiche reprise : son nom complète un compte encore anonyme.
      firstName ||= customer.firstName;
      lastName ||= customer.lastName;
    }

    // 3. Mémoire du compte : téléphone et nom pré-remplis la prochaine fois.
    const memory: Prisma.ClientAccountUpdateInput = {};
    if (!account.phone && phone) memory.phone = phone;
    if (!account.firstName) memory.firstName = firstName;
    if (!account.lastName && lastName) memory.lastName = lastName;
    if (Object.keys(memory).length) await tx.clientAccount.update({ where: { id: account.id }, data: memory });

    // 4. Carte du programme, sauf si la fiche en a déjà une.
    const existing = await tx.loyaltyAccount.findFirst({ where: { tenantId, customerId: customer!.id, programId: program.id, status: { not: "CLOSED" } } });
    if (existing) return { accountId: existing.id, customerId: customer!.id, customerCreated, cardCreated: false, status: existing.status };

    // 4.4 : « code par email » = compte confirmé ; « en magasin » inchangé.
    const status =
      program.enrollmentVerification === "IN_STORE" || (program.enrollmentVerification === "EMAIL_OTP" && !account.emailVerifiedAt) ? "PENDING_VERIFICATION" : "ACTIVE";
    const card = await createCard(tx, { tenantId, programId: program.id, customerId: customer!.id, status }, link.tenant.name);
    await tx.enrollmentLink.update({ where: { id: link.id }, data: { enrollCount: { increment: 1 } } });
    return { accountId: card.accountId, customerId: customer!.id, customerCreated, cardCreated: true, status };
  }

  /** Transaction avec la traduction des refus (quota du commerce, doublon concurrent). */
  private async run<T>(link: Link, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.client.$transaction(fn);
    } catch (error) {
      if (error instanceof AppError && (error.code === "quota_exceeded" || error.code === "email_not_verified")) {
        // Le client ne voit ni l'offre ni le compte du commerçant ; le commerçant est prévenu.
        if (error.code === "quota_exceeded") await this.quotaAlerts.customerBlocked(link.tenantId);
        else await this.quotaAlerts.unverifiedBlocked(link.tenantId);
        throw conflict("enrollment_closed", "Les inscriptions sont momentanément fermées. Demandez votre carte directement au commerçant.");
      }
      if (error instanceof AppError && error.code === "customer_exists") {
        throw conflict("already_enrolled", "Vous êtes déjà inscrit(e). Utilisez « Retrouver ma carte » ou demandez au commerçant.");
      }
      throw error;
    }
  }

  private async finish(link: Link, enrolled: Enrolled, req: Request, email: string) {
    const tenantId = link.tenantId;
    if (enrolled.cardCreated) {
      await this.audit.log({ tenantId, action: "customer.self_enrolled", targetType: "account", targetId: enrolled.accountId, metadata: { clientAccount: true }, ip: req.ip ?? null });
    }
    if (enrolled.customerCreated) {
      await this.webhooks.emit(tenantId, "customer.created", { id: enrolled.customerId, externalRef: null });
      await this.quotaAlerts.afterCustomerCreated(tenantId);
    } else {
      await this.audit.log({ tenantId, action: "client.customer_linked", targetType: "customer", targetId: enrolled.customerId, ip: req.ip ?? null });
    }
    if (enrolled.cardCreated) {
      await this.webhooks.emit(tenantId, "loyalty_account.created", { id: enrolled.accountId, customerId: enrolled.customerId, programId: link.programId });
    }
    return { state: "joined" as const, cardPath: await this.cardPath(enrolled.accountId, tenantId), status: enrolled.status, email };
  }

  private async cardPath(accountId: string, tenantId: string) {
    return new URL(await this.cards.linkFor(accountId, tenantId)).pathname;
  }
}
