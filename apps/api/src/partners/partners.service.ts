import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@fove/database";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";
import { PricingService } from "../billing/pricing.service";
import { EmailService } from "../notifications/email.service";
import { loadConfig } from "../config";
import { convertCents } from "@fove/shared";
import { badRequest, forbidden, notFound } from "../common/errors";
import { sha256 } from "../common/crypto";
import type { AuthState } from "../common/context";
import type {
  PartnerApplyDto,
  PartnerLeadDto,
  PartnerLeadUpdateDto,
  PartnerPayoutRequestDto,
  PartnerProfileUpdateDto,
  AdminPartnerUpdateDto,
  AdminPayoutActionDto,
  AdminSettingsUpdateDto,
} from "./partners.dto";
import { localeForCountry, normalizeLocale, type Locale } from "../i18n/locale";
import { escapeHtml, partnerApprovedMessage, partnerEmails } from "../i18n/emails";

@Injectable()
export class PartnersService {
  private readonly logger = new Logger("PartnersService");

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly pricing: PricingService,
  ) {}

  /**
   * Commissions arrivées au bout du délai de validation : disponibles, et converties dans la
   * monnaie de versement du partenaire au taux comptable du jour (taux figé sur la commission).
   */
  async releaseDueCommissions(partnerId?: string, now = new Date()): Promise<number> {
    const due = await this.prisma.client.partnerCommission.findMany({
      where: { status: "PENDING", availableAt: { lte: now }, ...(partnerId ? { partnerId } : {}) },
      include: { partner: { select: { payoutCurrency: true } } },
    });
    for (const c of due) await this.convertForPayout(c, c.partner.payoutCurrency, { status: "AVAILABLE" });
    return due.length;
  }

  private async convertForPayout(c: { id: string; commissionAmountCents: number; currency: string }, payoutCurrency: string, extra: Prisma.PartnerCommissionUpdateInput = {}) {
    const converted = await this.pricing.convert(c.commissionAmountCents, c.currency, payoutCurrency);
    // Sans taux pour cette monnaie, la commission reste dans sa monnaie (l'équipe FOVE complète la table des taux).
    const data = converted
      ? { payoutCurrency, payoutAmountCents: converted.cents, fxRate: converted.rate }
      : { payoutCurrency: c.currency, payoutAmountCents: c.commissionAmountCents, fxRate: 1 };
    await this.prisma.client.partnerCommission.update({ where: { id: c.id }, data: { ...data, ...extra } });
    return data;
  }

  /**
   * Récupère ou initialise les réglages du programme partenaire.
   */
  /** Langue des emails d'un partenaire : celle de son compte, sinon celle de son pays. */
  private async partnerLocale(partner: { userId: string | null; country: string | null }): Promise<Locale> {
    const user = partner.userId ? await this.prisma.client.user.findUnique({ where: { id: partner.userId }, select: { locale: true } }) : null;
    return normalizeLocale(user?.locale) ?? localeForCountry(partner.country);
  }

  async getSettings() {
    let settings = await this.prisma.client.partnerSettings.findUnique({
      where: { id: "default" },
    });
    if (!settings) {
      settings = await this.prisma.client.partnerSettings.create({
        data: {
          id: "default",
          defaultCommissionRatePercent: 20.0,
          cookieAttributionDays: 30,
          conversionWindowDays: 90,
          validationDelayDays: 30,
          minimumPayoutThresholdCents: 5000,
          firstPaymentOnly: true,
          autoApproveApplications: false,
        },
      });
    }
    return settings;
  }

  /**
   * 1. Soumission d'une candidature partenaire.
   */
  async apply(dto: PartnerApplyDto, ip?: string, requestLocale?: Locale | null) {
    // Vérification de doublon
    const existing = await this.prisma.client.partner.findFirst({
      where: { email: dto.email.toLowerCase() },
    });

    if (existing) {
      if (existing.status === "PENDING" || existing.status === "UNDER_REVIEW") {
        throw badRequest("application_pending", "Une candidature avec cette adresse email est déjà en cours d'examen.");
      }
      if (existing.status === "APPROVED" || existing.status === "ACTIVE") {
        throw badRequest("already_partner", "Cette adresse email correspond déjà à un partenaire FOVE actif. Connectez-vous à votre espace.");
      }
    }

    const settings = await this.getSettings();

    // Génération d'un code unique lisible
    const baseCode = (dto.company || dto.name)
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 10);
    const randomSuffix = Math.floor(100 + Math.random() * 900);
    const code = `${baseCode || "PARTNER"}${randomSuffix}`;

    // Liaison avec un compte utilisateur FOVE si déjà inscrit
    // Seul un compte à l'email confirmé est lié : l'adresse saisie dans la candidature n'est pas prouvée.
    const existingUser = await this.prisma.client.user.findFirst({
      where: { email: dto.email.toLowerCase(), emailVerifiedAt: { not: null } },
    });

    const isAutoApproved = settings.autoApproveApplications;
    const initialStatus = isAutoApproved ? "APPROVED" : "PENDING";

    const partner = await this.prisma.client.partner.create({
      data: {
        userId: existingUser?.id ?? null,
        name: dto.name,
        email: dto.email.toLowerCase(),
        phone: dto.phone,
        company: dto.company || null,
        country: dto.country,
        city: dto.city,
        partnerType: dto.partnerType,
        websiteUrl: dto.websiteUrl || null,
        promotionStrategy: dto.promotionStrategy,
        networkSizeEstimate: dto.networkSizeEstimate || null,
        code,
        commissionRatePercent: settings.defaultCommissionRatePercent,
        status: initialStatus,
        minimumPayoutThresholdCents: settings.minimumPayoutThresholdCents,
      },
    });

    if (existingUser && isAutoApproved) {
      await this.prisma.client.user.update({
        where: { id: existingUser.id },
        data: { isPartner: true },
      });
    }

    // Email de confirmation au candidat
    try {
      const locale = requestLocale ?? localeForCountry(dto.country);
      const t = partnerEmails(locale);
      await this.email.send({
        to: dto.email,
        subject: t.receivedSubject,
        text: t.received(dto.name, code),
        // Version mise en forme disponible en français ; texte seul dans les autres langues.
        html: locale !== "fr" ? undefined : `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #111; max-width: 580px; margin: 0 auto; padding: 24px;">
            <h2 style="margin-bottom: 12px; color: #000;">Candidature reçue · Programme Partenaires FOVE</h2>
            <p>Bonjour <strong>${escapeHtml(dto.name)}</strong>,</p>
            <p>Nous avons bien reçu votre candidature pour rejoindre le programme de partenaires commerciaux de FOVE.</p>
            <div style="background-color: #f7f7f8; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <p style="margin: 0; font-size: 14px;"><strong>Code envisagé :</strong> <code>${code}</code></p>
              <p style="margin: 4px 0 0; font-size: 14px;"><strong>Profil :</strong> ${dto.partnerType}</p>
              <p style="margin: 4px 0 0; font-size: 14px;"><strong>Territoire :</strong> ${escapeHtml(dto.city)}, ${escapeHtml(dto.country)}</p>
            </div>
            <p>Notre équipe commerciale étudie vos informations. Dès approbation, vous recevrez vos accès complets et votre lien commercial.</p>
            <p style="margin-top: 24px; font-size: 13px; color: #666;">L'équipe FOVE · <a href="https://fove.digital" style="color: #1F4FFF;">https://fove.digital</a></p>
          </div>
        `,
      });
    } catch (e) {
      this.logger.error("Erreur envoi email candidature candidat", e);
    }

    // Email de notification à l'administrateur
    const adminEmail = loadConfig().EMAIL_FROM || "contact@fove.digital";
    try {
      await this.email.send({
        to: adminEmail,
        subject: `[Nouveau Partenaire] Candidature de ${dto.name} (${dto.company || "Indépendant"})`,
        text: `Nouvelle candidature partenaire :\n\nNom: ${dto.name}\nEmail: ${dto.email}\nTéléphone: ${dto.phone}\nEntreprise: ${dto.company ?? "—"}\nType: ${dto.partnerType}\nPays: ${dto.country} / ${dto.city}\nStratégie: ${dto.promotionStrategy}\n\nExaminez la candidature dans le back-office :\n${loadConfig().APP_URL}/admin/finance/commissions`,
      });
    } catch (e) {
      this.logger.error("Erreur envoi notification admin candidature", e);
    }

    await this.audit.log({
      action: "partner.application_submitted",
      targetType: "partner",
      targetId: partner.id,
      ip,
      metadata: { code, partnerType: dto.partnerType, country: dto.country },
    });

    return {
      success: true,
      partnerId: partner.id,
      code: partner.code,
      status: partner.status,
    };
  }

  /**
   * 2. Enregistrement d'un clic sur un lien commercial partenaire (/p/:code).
   */
  async trackClick(code: string, req: { ip?: string; userAgent?: string; referrer?: string; utmSource?: string; utmMedium?: string; utmCampaign?: string }) {
    const partner = await this.prisma.client.partner.findFirst({
      where: {
        code: code.toUpperCase(),
        status: { in: ["APPROVED", "ACTIVE"] },
      },
      select: { id: true, code: true },
    });

    if (!partner) {
      return { found: false, targetUrl: "/tarifs" };
    }

    const ipHash = req.ip ? sha256(req.ip + "fove_salt").slice(0, 32) : null;

    // Enregistrement du clic
    await this.prisma.client.partnerClick.create({
      data: {
        partnerId: partner.id,
        code: partner.code,
        ipHash,
        userAgent: req.userAgent?.slice(0, 255) || null,
        referrer: req.referrer?.slice(0, 255) || null,
        utmSource: req.utmSource?.slice(0, 100) || null,
        utmMedium: req.utmMedium?.slice(0, 100) || null,
        utmCampaign: req.utmCampaign?.slice(0, 100) || null,
      },
    });

    await this.prisma.client.partner.update({
      where: { id: partner.id },
      data: { totalClicksCount: { increment: 1 } },
    });

    return {
      found: true,
      partnerCode: partner.code,
      targetUrl: `/tarifs?utm_source=partner&utm_campaign=${encodeURIComponent(partner.code)}`,
    };
  }

  /**
   * 3. Attribution d'un commerçant (Tenant) à un partenaire.
   */
  async attributeTenant(tenantId: string, partnerCode: string, source = "COOKIE") {
    if (!partnerCode) return null;

    const partner = await this.prisma.client.partner.findFirst({
      where: {
        code: partnerCode.toUpperCase(),
        status: { in: ["APPROVED", "ACTIVE"] },
      },
    });

    if (!partner) return null;

    // Règle anti-auto-affiliation : l'utilisateur qui a créé l'entreprise ne peut pas être le partenaire lui-même
    if (partner.userId) {
      const isMember = await this.prisma.client.tenantMembership.findFirst({
        where: { tenantId, userId: partner.userId },
      });
      if (isMember) {
        this.logger.warn(`Auto-affiliation bloquée : le partenaire ${partner.id} est membre du tenant ${tenantId}`);
        return null;
      }
    }

    // Vérifie si déjà attribué (empêche double attribution)
    const existing = await this.prisma.client.acquisitionAttribution.findUnique({
      where: { tenantId },
    });
    if (existing) return existing;

    const attribution = await this.prisma.client.acquisitionAttribution.create({
      data: {
        tenantId,
        partnerId: partner.id,
        code: partner.code,
        attributionSource: source,
        conversionStatus: "REGISTERED",
      },
    });

    // Rapprochement automatique avec un prospect enregistré si les informations correspondent
    const tenant = await this.prisma.client.tenant.findUnique({
      where: { id: tenantId },
      include: { settings: true },
    });

    if (tenant) {
      await this.prisma.client.partnerLead.updateMany({
        where: {
          partnerId: partner.id,
          status: { in: ["NEW", "CONTACTED", "INTERESTED"] },
          OR: [
            { businessName: { equals: tenant.name, mode: "insensitive" } },
            tenant.settings?.contactEmail ? { email: { equals: tenant.settings.contactEmail, mode: "insensitive" } } : {},
          ],
        },
        data: {
          status: "REGISTERED",
          registeredTenantId: tenant.id,
        },
      });
    }

    return attribution;
  }

  /**
   * 4. Génération de commission lors d'un paiement confirmé par le serveur.
   */
  async handlePaymentConfirmed(payment: {
    id: string;
    tenantId: string;
    invoiceId?: string | null;
    amountCents: number;
    feeCents: number;
    netCents: number;
    currency: string;
  }) {
    if (payment.amountCents <= 0) return;

    // Recherche de l'attribution
    const attribution = await this.prisma.client.acquisitionAttribution.findUnique({
      where: { tenantId: payment.tenantId },
      include: { partner: true },
    });

    if (!attribution || !attribution.partner) return;
    const partner = attribution.partner;

    if (partner.status !== "APPROVED" && partner.status !== "ACTIVE") {
      this.logger.warn(`Commission ignorée : le partenaire ${partner.code} a le statut ${partner.status}`);
      return;
    }

    const settings = await this.getSettings();

    // Règle 1er paiement seulement si configuré
    if (settings.firstPaymentOnly) {
      const existingCommission = await this.prisma.client.partnerCommission.findFirst({
        where: {
          tenantId: payment.tenantId,
          partnerId: partner.id,
          status: { in: ["PENDING", "CONFIRMED", "AVAILABLE", "PAID"] },
        },
      });
      if (existingCommission) {
        this.logger.log(`Commission récurrente ignorée pour ${payment.tenantId} (règle premier paiement uniquement)`);
        return;
      }
    }

    // Calcul de la commission sur le montant net (après taxes et remises)
    const rate = Number(partner.commissionRatePercent);
    const commissionAmount = Math.round(payment.netCents * (rate / 100));

    if (commissionAmount <= 0) return;

    const availableAt = new Date(Date.now() + settings.validationDelayDays * 86_400_000);

    const commission = await this.prisma.client.partnerCommission.create({
      data: {
        partnerId: partner.id,
        tenantId: payment.tenantId,
        paymentId: payment.id,
        invoiceId: payment.invoiceId ?? null,
        amountBaseCents: payment.netCents,
        commissionRatePercent: partner.commissionRatePercent,
        commissionAmountCents: commissionAmount,
        currency: payment.currency,
        status: "PENDING",
        availableAt,
      },
    });

    // Mise à jour de l'attribution et du lead
    await this.prisma.client.acquisitionAttribution.update({
      where: { id: attribution.id },
      data: {
        conversionStatus: "CONVERTED",
        firstPaymentAt: attribution.firstPaymentAt ?? new Date(),
      },
    });

    await this.prisma.client.partner.update({
      where: { id: partner.id },
      data: { totalConversionsCount: { increment: 1 } },
    });

    await this.prisma.client.partnerLead.updateMany({
      where: {
        partnerId: partner.id,
        registeredTenantId: payment.tenantId,
      },
      data: { status: "CONVERTED" },
    });

    // Email de notification de commission au partenaire
    try {
      const t = partnerEmails(await this.partnerLocale(partner));
      const amount = `${(commissionAmount / 100).toFixed(2)} ${payment.currency}`;
      await this.email.send({
        to: partner.email,
        subject: t.commissionSubject(amount),
        text: t.commission(partner.name, amount, String(rate), settings.validationDelayDays, `${loadConfig().APP_URL}/partner`),
      });
    } catch (e) {
      this.logger.error("Erreur envoi notification commission au partenaire", e);
    }

    return commission;
  }

  /**
   * 5. Annulation d'une commission lors d'un remboursement.
   */
  async handlePaymentRefunded(paymentId: string) {
    const commissions = await this.prisma.client.partnerCommission.findMany({
      where: { paymentId, status: { in: ["PENDING", "CONFIRMED", "AVAILABLE"] } },
    });

    for (const comm of commissions) {
      await this.prisma.client.partnerCommission.update({
        where: { id: comm.id },
        data: { status: "CANCELLED" },
      });
      this.logger.warn(`Commission ${comm.id} annulée suite au remboursement du paiement ${paymentId}`);
    }
  }

  /**
   * 6. Résolution du profil partenaire de l'utilisateur connecté.
   */
  async getPartnerByUserId(userId: string) {
    let partner = await this.prisma.client.partner.findFirst({
      where: { userId },
    });

    if (!partner) {
      // Rattachement par email : seulement si l'email du compte est confirmé (sinon n'importe qui
      // créerait un compte avec l'adresse d'un partenaire pour prendre son profil et ses versements),
      // et seulement un profil encore libre (jamais celui d'un autre compte).
      const user = await this.prisma.client.user.findUnique({ where: { id: userId } });
      if (user?.emailVerifiedAt) {
        const byEmail = await this.prisma.client.partner.findFirst({
          where: { email: { equals: user.email, mode: "insensitive" }, userId: null },
        });
        if (byEmail) {
          const linked = await this.prisma.client.partner.updateMany({ where: { id: byEmail.id, userId: null }, data: { userId } });
          if (linked.count === 1) {
            await this.prisma.client.user.update({ where: { id: userId }, data: { isPartner: true } });
            partner = { ...byEmail, userId };
          }
        }
      }
    }

    if (!partner) throw forbidden("Vous ne disposez pas d'un profil partenaire FOVE validé");
    return partner;
  }

  /**
   * 7. Tableau de bord complet de l'espace partenaire.
   */
  async getDashboard(userId: string) {
    const partner = await this.getPartnerByUserId(userId);
    await this.releaseDueCommissions(partner.id);

    const [clicks, attributions, commissions, payouts, leads] = await Promise.all([
      this.prisma.client.partnerClick.findMany({
        where: { partnerId: partner.id },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      this.prisma.client.acquisitionAttribution.findMany({
        where: { partnerId: partner.id },
        include: {
          tenant: {
            include: {
              subscription: {
                include: { plan: true },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.client.partnerCommission.findMany({
        where: { partnerId: partner.id },
        include: {
          tenant: { select: { name: true, slug: true } },
          invoice: { select: { number: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.client.partnerPayout.findMany({
        where: { partnerId: partner.id },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.client.partnerLead.findMany({
        where: { partnerId: partner.id },
        orderBy: { updatedAt: "desc" },
      }),
    ]);

    // Montants dans la monnaie de versement : taux figé pour les commissions disponibles ou versées,
    // estimation au taux du jour pour celles en attente.
    const rates = await this.pricing.rates();
    const inPayout = (c: (typeof commissions)[number]) =>
      c.payoutAmountCents !== null && c.payoutCurrency === partner.payoutCurrency
        ? c.payoutAmountCents
        : (convertCents(c.commissionAmountCents, c.currency, partner.payoutCurrency, rates) ?? 0);

    // Calculs agrégés
    const totalClicks = partner.totalClicksCount || clicks.length;
    const totalSignups = attributions.length;
    const paidClients = attributions.filter((a) => a.conversionStatus === "CONVERTED").length;
    const conversionRatePercent = totalClicks > 0 ? (paidClients / totalClicks) * 100 : 0;

    const pendingCommissionsCents = commissions
      .filter((c) => c.status === "PENDING")
      .reduce((s, c) => s + inPayout(c), 0);

    const availableCommissionsCents = commissions
      .filter((c) => c.status === "AVAILABLE")
      .reduce((s, c) => s + inPayout(c), 0);

    const paidCommissionsCents = commissions
      .filter((c) => c.status === "PAID")
      .reduce((s, c) => s + inPayout(c), 0);

    const totalEarnedCents = pendingCommissionsCents + availableCommissionsCents + paidCommissionsCents;

    const appUrl = loadConfig().APP_URL;
    const partnerLink = `${appUrl}/p/${partner.code}`;

    return {
      partner: {
        id: partner.id,
        name: partner.name,
        code: partner.code,
        email: partner.email,
        phone: partner.phone,
        company: partner.company,
        partnerType: partner.partnerType,
        commissionRatePercent: Number(partner.commissionRatePercent),
        status: partner.status,
        payoutInfo: partner.payoutInfo,
        minimumPayoutThresholdCents: partner.minimumPayoutThresholdCents,
        payoutCurrency: partner.payoutCurrency,
        partnerLink,
      },
      kpi: {
        totalClicks,
        totalSignups,
        paidClients,
        conversionRatePercent,
        pendingCommissionsCents,
        availableCommissionsCents,
        paidCommissionsCents,
        totalEarnedCents,
        currency: partner.payoutCurrency,
        canRequestPayout: availableCommissionsCents >= partner.minimumPayoutThresholdCents,
      },
      attributions: attributions.map((a) => ({
        id: a.id,
        tenantName: a.tenant.name,
        tenantSlug: a.tenant.slug,
        planName: a.tenant.subscription?.plan?.name ?? "Gratuit",
        conversionStatus: a.conversionStatus,
        registeredAt: a.createdAt,
        firstPaymentAt: a.firstPaymentAt,
      })),
      commissions: commissions.map((c) => ({
        id: c.id,
        tenantName: c.tenant.name,
        invoiceNumber: c.invoice?.number ?? "—",
        amountBaseCents: c.amountBaseCents,
        commissionAmountCents: c.commissionAmountCents,
        ratePercent: Number(c.commissionRatePercent),
        currency: c.currency,
        payoutAmountCents: inPayout(c),
        payoutCurrency: partner.payoutCurrency,
        status: c.status,
        availableAt: c.availableAt,
        createdAt: c.createdAt,
      })),
      payouts,
      leads,
    };
  }

  /**
   * 8. Gestion des prospects (Leads) par le partenaire.
   */
  async createLead(userId: string, dto: PartnerLeadDto) {
    const partner = await this.getPartnerByUserId(userId);

    // Vérification anti-appropriation : si le prospect existe déjà comme client chez FOVE
    if (dto.email) {
      const existingClient = await this.prisma.client.tenantSettings.findFirst({
        where: { contactEmail: { equals: dto.email, mode: "insensitive" } },
      });
      if (existingClient) {
        throw badRequest("already_client", "Cette entreprise est déjà inscrite sur la plateforme.");
      }
    }

    return this.prisma.client.partnerLead.create({
      data: {
        partnerId: partner.id,
        businessName: dto.businessName,
        contactName: dto.contactName || null,
        email: dto.email || null,
        phone: dto.phone || null,
        city: dto.city || null,
        country: dto.country || null,
        sector: dto.sector || null,
        notes: dto.notes || null,
        status: dto.status,
      },
    });
  }

  async updateLead(userId: string, leadId: string, dto: PartnerLeadUpdateDto) {
    const partner = await this.getPartnerByUserId(userId);
    const lead = await this.prisma.client.partnerLead.findFirst({
      where: { id: leadId, partnerId: partner.id },
    });
    if (!lead) throw notFound("Prospect introuvable");

    // Champs choisis un par un : un objet venu de la requête n'est jamais passé tel quel à Prisma
    // (sinon il pourrait écrire dans les tables liées, jusqu'au compte utilisateur).
    const data: Prisma.PartnerLeadUpdateInput = {};
    if (dto.businessName !== undefined) data.businessName = dto.businessName;
    if (dto.contactName !== undefined) data.contactName = dto.contactName || null;
    if (dto.email !== undefined) data.email = dto.email || null;
    if (dto.phone !== undefined) data.phone = dto.phone || null;
    if (dto.city !== undefined) data.city = dto.city || null;
    if (dto.country !== undefined) data.country = dto.country || null;
    if (dto.sector !== undefined) data.sector = dto.sector || null;
    if (dto.notes !== undefined) data.notes = dto.notes || null;
    if (dto.status !== undefined) data.status = dto.status;

    return this.prisma.client.partnerLead.update({ where: { id: leadId }, data });
  }

  /**
   * 9. Demande de retrait / versement par le partenaire.
   */
  async requestPayout(userId: string, dto: PartnerPayoutRequestDto) {
    const partner = await this.getPartnerByUserId(userId);
    await this.releaseDueCommissions(partner.id);
    const currency = partner.payoutCurrency;

    // Vérification du solde disponible réel, dans la monnaie de versement.
    const availableCommissions = await this.prisma.client.partnerCommission.findMany({
      where: {
        partnerId: partner.id,
        status: "AVAILABLE",
      },
    });

    const totalAvailableCents = availableCommissions.reduce((s, c) => s + (c.payoutCurrency === currency ? (c.payoutAmountCents ?? 0) : 0), 0);

    if (totalAvailableCents < partner.minimumPayoutThresholdCents) {
      throw badRequest(
        "threshold_not_reached",
        `Le montant minimum de retrait est de ${(partner.minimumPayoutThresholdCents / 100).toFixed(2)} ${currency}. Solde disponible : ${(totalAvailableCents / 100).toFixed(2)} ${currency}.`
      );
    }

    if (dto.amountCents > totalAvailableCents) {
      throw badRequest("insufficient_balance", "Le montant demandé excède votre solde disponible.");
    }

    // Mise à jour des coordonnées de paiement dans le profil
    await this.prisma.client.partner.update({
      where: { id: partner.id },
      data: { payoutInfo: dto.payoutDetails },
    });

    // Création de la demande de virement
    const payout = await this.prisma.client.partnerPayout.create({
      data: {
        partnerId: partner.id,
        amountCents: dto.amountCents,
        currency,
        method: dto.method,
        status: "PENDING",
      },
    });

    // Notification administrateur
    const adminEmail = loadConfig().EMAIL_FROM || "contact@fove.digital";
    try {
      await this.email.send({
        to: adminEmail,
        subject: `[Demande de retrait partenaire] ${partner.name} (${(dto.amountCents / 100).toFixed(2)} ${currency})`,
        text: `Le partenaire ${partner.name} (${partner.code}) a demandé un versement de ${(dto.amountCents / 100).toFixed(2)} ${currency}.\n\nMéthode : ${dto.method}\nCoordonnées : ${JSON.stringify(dto.payoutDetails, null, 2)}\n\nValidez ou traitez le paiement dans le back-office :\n${loadConfig().APP_URL}/admin/finance/commissions`,
      });
    } catch (e) {
      this.logger.error("Erreur notification admin retrait partenaire", e);
    }

    return payout;
  }

  /**
   * 10. Mise à jour des coordonnées du profil partenaire.
   */
  async updateProfile(userId: string, dto: PartnerProfileUpdateDto) {
    const partner = await this.getPartnerByUserId(userId);
    const updated = await this.prisma.client.partner.update({
      where: { id: partner.id },
      data: {
        phone: dto.phone ?? partner.phone,
        company: dto.company ?? partner.company,
        payoutInfo: dto.payoutInfo ?? (partner.payoutInfo as any),
        payoutCurrency: dto.payoutCurrency ?? partner.payoutCurrency,
      },
    });
    if (dto.payoutCurrency && dto.payoutCurrency !== partner.payoutCurrency) await this.reconvertAvailable(partner.id, dto.payoutCurrency);
    return updated;
  }

  /**
   * Changement de monnaie de versement : les commissions disponibles non versées sont reconverties
   * au taux du jour ; une demande de versement en attente garde sa monnaie.
   */
  private async reconvertAvailable(partnerId: string, payoutCurrency: string) {
    const available = await this.prisma.client.partnerCommission.findMany({ where: { partnerId, status: "AVAILABLE", payoutId: null } });
    for (const c of available) await this.convertForPayout(c, payoutCurrency);
  }

  // --- ACTIONS ADMINISTRATEUR ------------------------------------------------

  async adminListPartners(filter?: { status?: string }) {
    const where: any = {};
    if (filter?.status && filter.status !== "ALL") {
      where.status = filter.status;
    }

    return this.prisma.client.partner.findMany({
      where,
      include: {
        _count: {
          select: {
            clicks: true,
            attributions: true,
            commissions: true,
            payouts: true,
            leads: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async adminApprove(partnerId: string, auth: AuthState) {
    const partner = await this.prisma.client.partner.findUnique({
      where: { id: partnerId },
    });
    if (!partner) throw notFound("Partenaire introuvable");

    // Rapprochement avec un User existant
    let user = partner.userId
      ? await this.prisma.client.user.findUnique({ where: { id: partner.userId } })
      : await this.prisma.client.user.findFirst({ where: { email: partner.email.toLowerCase(), emailVerifiedAt: { not: null } } });

    if (user) {
      await this.prisma.client.user.update({
        where: { id: user.id },
        data: { isPartner: true },
      });
      await this.prisma.client.partner.update({
        where: { id: partner.id },
        data: {
          status: "APPROVED",
          userId: user.id,
        },
      });
    } else {
      await this.prisma.client.partner.update({
        where: { id: partner.id },
        data: { status: "APPROVED" },
      });
    }

    // Email d'approbation officiel
    const loginUrl = `${loadConfig().APP_URL}/login`;
    const partnerUrl = `${loadConfig().APP_URL}/partner`;
    try {
      const locale = await this.partnerLocale(partner);
      const translated = partnerApprovedMessage(locale, {
        name: partner.name,
        code: partner.code,
        publicLink: `${loadConfig().APP_URL}/p/${partner.code}`,
        dashboardUrl: partnerUrl,
      });
      await this.email.send({
        to: partner.email,
        subject: translated.subject,
        text: translated.text,
        html: locale !== "fr" ? translated.html : `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #111; max-width: 580px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #000;">Félicitations · Votre partenariat FOVE est approuvé !</h2>
            <p>Bonjour <strong>${escapeHtml(partner.name)}</strong>,</p>
            <p>Votre statut de partenaire commercial FOVE est désormais actif. Vous pouvez dès à présent recommander FOVE et percevoir vos commissions.</p>
            <div style="background-color: #f7f7f8; border-left: 4px solid #C7FF3D; border-radius: 4px; padding: 16px; margin: 20px 0;">
              <p style="margin: 0; font-size: 14px;"><strong>Votre code partenaire :</strong> <code style="font-size: 16px; font-weight: bold;">${partner.code}</code></p>
              <p style="margin: 6px 0 0; font-size: 14px;"><strong>Votre lien de recommandation :</strong><br/><a href="${loadConfig().APP_URL}/p/${partner.code}" style="color: #1F4FFF; font-weight: 500;">${loadConfig().APP_URL}/p/${partner.code}</a></p>
              <p style="margin: 6px 0 0; font-size: 14px;"><strong>Taux de commission :</strong> ${Number(partner.commissionRatePercent)}% sur les abonnements éligibles</p>
            </div>
            <div style="margin: 24px 0;">
              <a href="${partnerUrl}" style="display: inline-block; background-color: #000; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 14px;">Accéder à mon espace partenaire</a>
            </div>
            <p style="font-size: 13px; color: #666;">Si vous n'aviez pas encore de compte utilisateur FOVE, connectez-vous avec cette adresse email (${escapeHtml(partner.email)}).</p>
          </div>
        `,
      });
    } catch (e) {
      this.logger.error("Erreur envoi email approbation partenaire", e);
    }

    await this.audit.log({
      actorUserId: auth.user.id,
      action: "partner.approved",
      targetType: "partner",
      targetId: partner.id,
    });

    return { success: true };
  }

  async adminReject(partnerId: string, reason: string, auth: AuthState) {
    const partner = await this.prisma.client.partner.findUnique({ where: { id: partnerId } });
    if (!partner) throw notFound("Partenaire introuvable");

    await this.prisma.client.partner.update({
      where: { id: partnerId },
      data: {
        status: "REJECTED",
        rejectionReason: reason,
      },
    });

    try {
      await this.email.send({
        to: partner.email,
        subject: partnerEmails(await this.partnerLocale(partner)).rejectedSubject,
        text: partnerEmails(await this.partnerLocale(partner)).rejected(partner.name, reason),
      });
    } catch (e) {
      this.logger.error("Erreur envoi email rejet partenaire", e);
    }

    await this.audit.log({
      actorUserId: auth.user.id,
      action: "partner.rejected",
      targetType: "partner",
      targetId: partner.id,
      metadata: { reason },
    });

    return { success: true };
  }

  async adminUpdatePartner(partnerId: string, dto: AdminPartnerUpdateDto, auth: AuthState) {
    const partner = await this.prisma.client.partner.update({
      where: { id: partnerId },
      data: {
        status: dto.status,
        commissionRatePercent: dto.commissionRatePercent !== undefined ? dto.commissionRatePercent : undefined,
        minimumPayoutThresholdCents: dto.minimumPayoutThresholdCents !== undefined ? dto.minimumPayoutThresholdCents : undefined,
        rejectionReason: dto.rejectionReason !== undefined ? dto.rejectionReason : undefined,
        payoutCurrency: dto.payoutCurrency,
        collectionEnabled: dto.collectionEnabled,
        collectionCapEurCents: dto.collectionCapEurCents,
      },
    });
    if (dto.payoutCurrency) await this.reconvertAvailable(partner.id, dto.payoutCurrency);

    await this.audit.log({
      actorUserId: auth.user.id,
      action: "partner.updated",
      targetType: "partner",
      targetId: partner.id,
      metadata: { ...dto },
    });

    return partner;
  }

  async adminProcessPayout(payoutId: string, dto: AdminPayoutActionDto, auth: AuthState) {
    const payout = await this.prisma.client.partnerPayout.findUnique({
      where: { id: payoutId },
      include: { partner: true },
    });

    if (!payout) throw notFound("Demande de virement introuvable");

    if (dto.status === "PAID") {
      // Marque les commissions disponibles les plus anciennes comme payées jusqu'à concurrence du montant
      const availableCommissions = await this.prisma.client.partnerCommission.findMany({
        where: {
          partnerId: payout.partnerId,
          status: "AVAILABLE",
        },
        orderBy: { createdAt: "asc" },
      });

      let remaining = payout.amountCents;
      for (const c of availableCommissions) {
        if (remaining <= 0) break;
        await this.prisma.client.partnerCommission.update({
          where: { id: c.id },
          data: {
            status: "PAID",
            paidAt: new Date(),
            payoutId: payout.id,
          },
        });
        remaining -= c.payoutCurrency === payout.currency ? (c.payoutAmountCents ?? 0) : c.commissionAmountCents;
      }

      await this.prisma.client.partnerPayout.update({
        where: { id: payoutId },
        data: {
          status: "PAID",
          reference: dto.reference || null,
          proofFileUrl: dto.proofFileUrl || null,
          approvedByUserId: auth.user.id,
          paidAt: new Date(),
        },
      });

      // Notification de virement effectué
      try {
        await this.email.send({
          to: payout.partner.email,
          ...(await (async () => {
            const t = partnerEmails(await this.partnerLocale(payout.partner));
            const amount = `${(payout.amountCents / 100).toFixed(2)} ${payout.currency}`;
            return { subject: t.payoutSubject(amount), text: t.payout(payout.partner.name, amount, dto.reference ?? t.bankTransfer) };
          })()),
        });
      } catch (e) {
        this.logger.error("Erreur envoi notification virement effectué", e);
      }
    } else {
      // Rejet
      await this.prisma.client.partnerPayout.update({
        where: { id: payoutId },
        data: {
          status: "FAILED",
          reference: dto.rejectionReason || "Demande rejetée",
        },
      });
    }

    await this.audit.log({
      actorUserId: auth.user.id,
      action: `partner.payout_${dto.status.toLowerCase()}`,
      targetType: "partner_payout",
      targetId: payout.id,
      metadata: { ...dto },
    });

    return { success: true };
  }

  async adminUpdateSettings(dto: AdminSettingsUpdateDto, auth: AuthState) {
    const settings = await this.prisma.client.partnerSettings.upsert({
      where: { id: "default" },
      create: { id: "default", ...dto },
      update: dto,
    });

    await this.audit.log({
      actorUserId: auth.user.id,
      action: "partner.settings_updated",
      targetType: "partner_settings",
      targetId: "default",
      metadata: { ...dto },
    });

    return settings;
  }
}
