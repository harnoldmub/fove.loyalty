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
  PartnerProfileUpdateDto,
  AdminPartnerUpdateDto,
  AdminPayoutActionDto,
  AdminSettingsUpdateDto,
} from "./partners.dto";
import { INTL_LOCALE, localeForCountry, normalizeLocale, type Locale } from "../i18n/locale";
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
   * 9. Versements mensuels (décision du 26 novembre 2026) : le 1er du mois, les commissions devenues
   * disponibles avant le mois en cours sont regroupées en un versement par partenaire, dans sa monnaie
   * de versement, s'il atteint le seuil (sinon report au mois suivant). FOVE le paie avant le 10 et
   * prend les frais de transfert à sa charge. Plus de demande de virement par le partenaire.
   */
  async scheduleMonthlyPayouts(now = new Date()): Promise<number> {
    const db = this.prisma.client;
    await this.releaseDueCommissions(undefined, now);
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const due = await db.partnerCommission.findMany({
      where: { status: "AVAILABLE", payoutId: null, availableAt: { lt: monthStart }, partner: { status: { in: ["APPROVED", "ACTIVE"] } } },
      include: { partner: true, tenant: { select: { name: true } } },
      orderBy: { availableAt: "asc" },
    });
    const byPartner = new Map<string, typeof due>();
    for (const c of due) byPartner.set(c.partnerId, [...(byPartner.get(c.partnerId) ?? []), c]);

    let created = 0;
    for (const [partnerId, list] of byPartner) {
      const partner = list[0]!.partner;
      const reference = `VERS-${monthStart.toISOString().slice(0, 7)}-${partner.code}`;
      // Un seul versement mensuel par partenaire (la tâche tourne toutes les 5 minutes).
      if (await db.partnerPayout.count({ where: { partnerId, reference } })) continue;
      const currency = partner.payoutCurrency;
      // Commission convertie dans une autre monnaie (changement de monnaie de versement) : reconvertie.
      for (const c of list.filter((c) => c.payoutCurrency !== currency || c.payoutAmountCents === null)) {
        const data = await this.convertForPayout(c, currency);
        Object.assign(c, data);
      }
      const commissions = list.filter((c) => c.payoutCurrency === currency);
      const amountCents = commissions.reduce((sum, c) => sum + (c.payoutAmountCents ?? 0), 0);
      if (amountCents <= 0 || amountCents < partner.minimumPayoutThresholdCents) continue;
      const method = typeof (partner.payoutInfo as { method?: unknown } | null)?.method === "string" ? String((partner.payoutInfo as { method: string }).method) : "Virement";
      const payout = await db.$transaction(async (tx) => {
        const p = await tx.partnerPayout.create({ data: { partnerId, amountCents, currency, method, status: "PENDING", reference, paidAt: null } });
        await tx.partnerCommission.updateMany({ where: { id: { in: commissions.map((c) => c.id) } }, data: { payoutId: p.id } });
        return p;
      });
      created += 1;
      await this.audit.log({ action: "partner.payout_scheduled", targetType: "partner_payout", targetId: payout.id, metadata: { partner: partner.code, amountCents, currency, commissions: commissions.length } });
      try {
        const locale = await this.partnerLocale(partner);
        const t = partnerEmails(locale);
        const money = (cents: number, cur: string) => new Intl.NumberFormat(INTL_LOCALE[locale], { style: "currency", currency: cur }).format(cents / 100);
        const lines = commissions.map((c) => `- ${c.tenant.name} : ${money(c.payoutAmountCents ?? 0, currency)}`).join("\n");
        await this.email.send({ to: partner.email, subject: t.scheduledSubject(money(amountCents, currency)), text: t.scheduled(partner.name, money(amountCents, currency), lines, `${loadConfig().APP_URL}/partner`) });
      } catch (e) {
        this.logger.error("Erreur envoi récapitulatif de versement", e);
      }
    }
    return created;
  }

  /** Versements à faire et faits (admin) : les plus récents d'abord, filtrables par état. */
  adminListPayouts(status?: string) {
    return this.prisma.client.partnerPayout.findMany({
      where: status && status !== "ALL" ? { status } : {},
      include: { partner: { select: { id: true, name: true, code: true, email: true, payoutInfo: true } }, commissions: { select: { id: true, payoutAmountCents: true, tenant: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  /**
   * Clients apportés avec leur abonnement, leur échéance et l'état de leur paiement (référence en
   * attente, payé, échu) : le partenaire accompagne le paiement sans jamais encaisser.
   */
  async partnerClients(userId: string) {
    const partner = await this.getPartnerByUserId(userId);
    const now = new Date();
    const attributions = await this.prisma.client.acquisitionAttribution.findMany({
      where: { partnerId: partner.id },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            subscription: { select: { status: true, provider: true, currentPeriodEnd: true, provisionalUntil: true, plan: { select: { code: true, name: true, kind: true } } } },
            invoices: { where: { status: "OPEN", paymentReference: { not: null } }, select: { paymentReference: true, amountDueCents: true, currency: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return attributions.map((a) => {
      const sub = a.tenant.subscription;
      const pending = a.tenant.invoices[0] ?? null;
      const running = sub && sub.plan.kind !== "FREE" && sub.status !== "CANCELED" && sub.status !== "INCOMPLETE" && (!sub.currentPeriodEnd || sub.currentPeriodEnd > now);
      const payment = pending ? (sub?.provisionalUntil ? "provisional" : "pending") : running ? "paid" : sub && sub.plan.kind !== "FREE" ? "expired" : "free";
      return {
        tenantId: a.tenant.id,
        name: a.tenant.name,
        planName: sub && sub.plan.kind !== "FREE" ? sub.plan.name : null,
        periodEnd: running ? (sub!.provisionalUntil ?? sub!.currentPeriodEnd) : null,
        payment,
        pending: pending ? { reference: pending.paymentReference, amountCents: pending.amountDueCents, currency: pending.currency } : null,
        registeredAt: a.createdAt,
      };
    });
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

  /**
   * Profil partenaire validé (candidature approuvée ou création par l'admin) : rattaché au compte FOVE
   * au même email confirmé s'il existe, puis email d'invitation (code, lien, accès à l'espace partenaire
   * en se connectant avec cette adresse).
   */
  async welcome(partnerId: string) {
    const partner = await this.prisma.client.partner.findUniqueOrThrow({ where: { id: partnerId } });
    const user = partner.userId
      ? await this.prisma.client.user.findUnique({ where: { id: partner.userId } })
      : await this.prisma.client.user.findFirst({ where: { email: partner.email.toLowerCase(), emailVerifiedAt: { not: null } } });
    if (user) {
      await this.prisma.client.user.update({ where: { id: user.id }, data: { isPartner: true } });
      if (!partner.userId) await this.prisma.client.partner.updateMany({ where: { id: partner.id, userId: null }, data: { userId: user.id } });
    }
    try {
      const appUrl = loadConfig().APP_URL;
      await this.email.send({
        to: partner.email,
        ...partnerApprovedMessage(await this.partnerLocale(partner), {
          name: partner.name,
          code: partner.code,
          publicLink: `${appUrl}/p/${partner.code}`,
          dashboardUrl: `${appUrl}/partner`,
        }),
      });
    } catch (e) {
      this.logger.error("Erreur envoi email d'invitation partenaire", e);
    }
  }

  async adminApprove(partnerId: string, auth: AuthState) {
    const partner = await this.prisma.client.partner.findUnique({
      where: { id: partnerId },
    });
    if (!partner) throw notFound("Partenaire introuvable");

    await this.prisma.client.partner.update({ where: { id: partner.id }, data: { status: "APPROVED" } });
    await this.welcome(partner.id);

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

    if (payout.status !== "PENDING") throw badRequest("payout_closed", "Ce versement est déjà traité");

    if (dto.status === "PAID") {
      // Les commissions regroupées dans ce versement passent à « versées ».
      await this.prisma.client.partnerCommission.updateMany({ where: { payoutId: payout.id }, data: { status: "PAID", paidAt: new Date() } });

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
      // Rejet (coordonnées erronées…) : les commissions reviennent au prochain versement mensuel.
      await this.prisma.client.partnerCommission.updateMany({ where: { payoutId: payout.id }, data: { payoutId: null } });
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
