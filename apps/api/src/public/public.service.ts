import { Injectable } from "@nestjs/common";
import QRCode from "qrcode";
import type { Request, Response } from "express";
import { ClientAccountService } from "../client-account/client-account.service";
import { contactMessageSchema, normalizeEmail, normalizePhone } from "@fove/shared";
import type { z } from "zod";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";
import { randomDigits, sha256 } from "../common/crypto";
import { badRequest, notFound } from "../common/errors";
import { PlanService } from "../billing/plan.service";
import { EmailService } from "../notifications/email.service";
import { WhatsAppService } from "../notifications/whatsapp.service";
import { CardsService, cardUrl } from "../cards/cards.service";
import { tenantLocale, type Locale } from "../i18n/locale";
import { recoverCardMessage } from "../i18n/notifications";
import { cardLinkSubject, otpMessage } from "../i18n/emails";

const OTP_TTL_MS = 10 * 60_000;
const OTP_MAX_ATTEMPTS = 5;

/**
 * Parcours publics : page d'inscription (QR du commerce) et carte numérique
 * (lien secret). L'inscription elle-même passe par le compte client FOVE
 * (`client-account/client-enrollment.service.ts`). Aucune de ces routes ne peut créditer de points.
 */
@Injectable()
export class PublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlanService,
    private readonly email: EmailService,
    private readonly whatsapp: WhatsAppService,
    private readonly audit: AuditService,
    private readonly cards: CardsService,
    private readonly clientAccounts: ClientAccountService,
  ) { }

  /** Lien d'inscription d'un commerce, par jeton de QR ou par adresse publique. */
  async link(tokenOrSlug: string) {
    const include = {
      program: { include: { rewards: { where: { active: true, archivedAt: null }, orderBy: { cost: "asc" as const }, take: 6 } } },
      establishment: { select: { name: true } },
      tenant: { include: { settings: true } },
    };

    let link = await this.prisma.client.enrollmentLink.findUnique({
      where: { token: tokenOrSlug },
      include,
    });

    if (!link) {
      const normalizedSlug = tokenOrSlug.toLowerCase();
      link = await this.prisma.client.enrollmentLink.findFirst({
        where: {
          tenant: { slug: normalizedSlug, status: "ACTIVE" },
          active: true,
          program: { active: true },
        },
        orderBy: [{ establishmentId: "asc" }, { createdAt: "asc" }],
        include,
      });

      if (!link) {
        const program = await this.prisma.client.loyaltyProgram.findFirst({
          where: {
            tenant: { slug: normalizedSlug, status: "ACTIVE" },
            active: true,
          },
          orderBy: { createdAt: "asc" },
        });
        if (program) {
          link = await this.prisma.client.enrollmentLink.create({
            data: {
              tenantId: program.tenantId,
              programId: program.id,
              token: crypto.randomUUID().replaceAll("-", "").slice(0, 16),
            },
            include,
          });
        }
      }
    }

    if (!link || !link.active || !link.program.active || link.tenant.status !== "ACTIVE") throw notFound("Programme");
    return link;
  }

  async joinPage(token: string) {
    const link = await this.link(token);
    const s = link.tenant.settings;
    return {
      tenant: { name: link.tenant.name, logoUrl: s?.logoUrl ?? null, primaryColor: s?.primaryColor ?? "#1F4FFF", privacyPolicyUrl: s?.privacyPolicyUrl ?? null, country: s?.country ?? "CD" },
      establishment: link.establishment?.name ?? null,
      program: {
        name: link.program.name,
        mode: link.program.mode,
        currency: link.program.currency,
        spendStep: link.program.spendStep.toString(),
        pointsPerStep: link.program.pointsPerStep,
        stampsTarget: link.program.stampsTarget,
        terms: link.program.terms,
        verification: link.program.enrollmentVerification,
        rewards: link.program.rewards.map((r) => ({ name: r.name, cost: r.cost })),
      },
    };
  }

  /**
   * « Retrouver ma carte » par email ou téléphone. Le lien part uniquement vers
   * l'email enregistré sur la fiche, jamais affiché à l'écran, et n'est pas
   * renouvelé : une demande malveillante ne peut pas couper la carte du vrai client.
   * Réponse identique que le client existe ou non.
   */
  async recover(token: string, identifier: string) {
    const link = await this.link(token);
    const value = identifier.trim();
    const isEmail = value.includes("@");
    const lookup = isEmail ? normalizeEmail(value) : normalizePhone(value, link.tenant.settings?.country ?? "CD");
    if (!lookup) return;
    const identity = await this.prisma.client.customerIdentity.findUnique({
      where: { tenantId_kind_value: { tenantId: link.tenantId, kind: isEmail ? "EMAIL" : "PHONE", value: lookup } },
      include: { customer: { select: { email: true, phone: true, firstName: true } } },
    });
    if (!identity) return;
    const email = identity.customer.email;
    const phone = identity.customer.phone;
    if (!email && !phone) return;
    const account = await this.prisma.client.loyaltyAccount.findFirst({
      where: { tenantId: link.tenantId, programId: link.programId, customerId: identity.customerId, status: { not: "CLOSED" } },
    });
    if (!account) return;
    const url = await this.cards.linkFor(account.id, link.tenantId);
    const locale = tenantLocale(link.tenant.settings);
    const text = recoverCardMessage(locale, { firstName: identity.customer.firstName, programName: link.program.name, url });
    await this.audit.log({ tenantId: link.tenantId, action: "account.link_emailed", targetType: "account", targetId: account.id });
    if (email) {
      await this.email.send({
        to: email,
        subject: cardLinkSubject(locale, link.tenant.name),
        text,
      });
    }
    if (phone && this.whatsapp.isConfigured() && (await this.plans.features(link.tenantId)).whatsappAuto) {
      await this.whatsapp.send(phone, text);
    }
  }

  private async account(accessToken: string) {
    if (!accessToken.startsWith("fvc_") || accessToken.length > 80) throw notFound("Carte");
    const account = await this.prisma.client.loyaltyAccount.findUnique({
      where: { accessTokenHash: sha256(accessToken) },
      include: {
        customer: { select: { firstName: true, lastName: true, email: true, clientAccount: { select: { email: true } } } },
        program: true,
        tenant: { include: { settings: true } },
      },
    });
    if (!account || account.status === "CLOSED") throw notFound("Carte");
    return account;
  }

  async card(accessToken: string) {
    const account = await this.account(accessToken);
    const [rewards, transactions] = await Promise.all([
      this.prisma.client.reward.findMany({
        where: { tenantId: account.tenantId, programId: account.programId, active: true, archivedAt: null },
        orderBy: { cost: "asc" },
        select: { id: true, name: true, description: true, conditions: true, kind: true, value: true, cost: true },
      }),
      this.prisma.client.loyaltyTransaction.findMany({
        where: { tenantId: account.tenantId, accountId: account.id },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, kind: true, delta: true, balanceAfter: true, createdAt: true, reason: true },
      }),
    ]);
    const s = account.tenant.settings;
    const next = rewards.find((r) => r.cost > account.balance) ?? null;
    return {
      tenant: { name: account.tenant.name, logoUrl: s?.logoUrl ?? null, primaryColor: s?.primaryColor ?? "#1F4FFF" },
      program: {
        name: account.program.name,
        mode: account.program.mode,
        stampsTarget: account.program.stampsTarget,
        currency: account.program.currency,
        terms: account.program.terms,
        rule: this.cards.rule(account.program, rewards[0]?.name, tenantLocale(s)),
      },
      customer: { firstName: account.customer.firstName, lastInitial: account.customer.lastName.slice(0, 1) },
      card: {
        number: account.cardNumber,
        qr: account.qrToken,
        status: account.status,
        balance: account.balance,
        lifetimeEarned: account.lifetimeEarned,
        memberSince: account.createdAt,
      },
      nextReward: next ? { name: next.name, cost: next.cost, remaining: next.cost - account.balance } : null,
      rewards: rewards.map((r) => ({ ...r, available: account.balance >= r.cost })),
      transactions,
      verification: account.status === "PENDING_VERIFICATION" ? account.program.enrollmentVerification : null,
      googleWallet: this.cards.wallet.isConfigured() && account.status === "ACTIVE",
      appleWallet: this.cards.appleWallet.isConfigured() && account.status === "ACTIVE",
      poweredBy: !(await this.plans.features(account.tenantId)).removeBranding,
    };
  }

  async getTenantBySlug(slug: string) {
    return this.prisma.client.tenant.findFirst({
      where: { slug: slug.toLowerCase(), status: "ACTIVE" },
      include: { settings: true },
    });
  }

  async cardQrSvg(accessToken: string): Promise<string> {
    const account = await this.account(accessToken);
    return QRCode.toString(account.qrToken, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  }

  private async sendOtp(tenantId: string, accountId: string, email: string, tenantName: string, locale: Locale) {
    const code = randomDigits(6);
    await this.prisma.client.otpChallenge.create({
      data: { tenantId, accountId, channel: "EMAIL", target: email, codeHash: sha256(`${accountId}:${code}`), expiresAt: new Date(Date.now() + OTP_TTL_MS) },
    });
    await this.email.send({ to: email, ...otpMessage(locale, tenantName, code) });
  }

  async resendCode(accessToken: string, req: Request) {
    const account = await this.account(accessToken);
    if (account.status !== "PENDING_VERIFICATION" || account.program.enrollmentVerification !== "EMAIL_OTP" || !account.customer.email) {
      throw badRequest("not_pending", "Aucune validation en attente");
    }
    // Carte rattachée à un compte FOVE : c'est la confirmation du compte qui l'active.
    if (account.customer.clientAccount) return this.clientAccounts.requestCode(account.customer.clientAccount.email, req, "confirm");
    const recent = await this.prisma.client.otpChallenge.count({ where: { accountId: account.id, createdAt: { gt: new Date(Date.now() - 60_000) } } });
    if (recent > 0) throw badRequest("too_soon", "Patientez une minute avant de redemander un code");
    await this.sendOtp(account.tenantId, account.id, account.customer.email, account.tenant.name, tenantLocale(account.tenant.settings));
  }

  async verify(accessToken: string, code: string, req: Request, res: Response) {
    const account = await this.account(accessToken);
    if (account.status !== "PENDING_VERIFICATION") return { status: account.status };
    if (account.customer.clientAccount) {
      await this.clientAccounts.verifyCode(account.customer.clientAccount.email, code, req, res);
      const after = await this.prisma.client.loyaltyAccount.findUniqueOrThrow({ where: { id: account.id }, select: { status: true } });
      return { status: after.status };
    }
    const challenge = await this.prisma.client.otpChallenge.findFirst({
      where: { accountId: account.id, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!challenge || challenge.attempts >= OTP_MAX_ATTEMPTS) throw badRequest("code_expired", "Code expiré : demandez-en un nouveau");
    if (challenge.codeHash !== sha256(`${account.id}:${code}`)) {
      await this.prisma.client.otpChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
      throw badRequest("invalid_code", "Code incorrect");
    }
    await this.prisma.client.$transaction([
      this.prisma.client.otpChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } }),
      this.prisma.client.loyaltyAccount.update({ where: { id: account.id }, data: { status: "ACTIVE" } }),
      this.prisma.client.customerIdentity.updateMany({
        where: { tenantId: account.tenantId, customerId: account.customerId, kind: "EMAIL", value: challenge.target },
        data: { verifiedAt: new Date() },
      }),
    ]);
    return { status: "ACTIVE" };
  }

  /**
   * Réception d'une demande de contact ou de démonstration depuis le site vitrine.
   * Alimente le CRM interne (/admin/messages) et envoie une alerte email à l'équipe FOVE.
   */
  async submitContact(input: z.infer<typeof contactMessageSchema>, ip: string | null) {
    if (input.website) throw badRequest("rejected", "Envoi refusé");
    const msg = await this.prisma.client.contactMessage.create({
      data: {
        name: input.name,
        email: normalizeEmail(input.email),
        phone: input.phone,
        companyName: input.companyName,
        subject: input.subject,
        message: input.message,
        source: input.source,
      },
    });
    await this.audit.log({
      action: "public.contact_submitted",
      targetType: "contact_message",
      targetId: msg.id,
      ip,
      metadata: { subject: input.subject, companyName: input.companyName },
    });
    await this.email.send({
      to: "contact@fove.digital",
      subject: `[FOVE Contact] ${input.subject ?? "Demande"} — ${input.name}${input.companyName ? ` (${input.companyName})` : ""}`,
      text: `Nouveau message reçu sur fove.digital :\n\nNom : ${input.name}\nEmail : ${input.email}\nTéléphone : ${input.phone ?? "Non renseigné"}\nEntreprise : ${input.companyName ?? "Non renseignée"}\nSujet : ${input.subject ?? "Demande d'information"}\n\nMessage :\n${input.message}\n\nConsultez et traitez cette demande dans l'espace Super-Admin : /admin/messages`,
    });
    return { id: msg.id, status: msg.status };
  }
}

export async function enrollmentQrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: "svg", margin: 2, errorCorrectionLevel: "M" });
}

