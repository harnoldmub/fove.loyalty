import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import type { AuthState } from "../../common/context";
import { badRequest, notFound, forbidden } from "../../common/errors";
import { loadConfig } from "../../config";
import type {
  ExpenseCreateDto,
  FinanceFilterDto,
  PartnerCreateDto,
  PaymentsFilterDto,
  ReconcileDto,
  RefundCreateDto,
  SalesFilterDto,
} from "./finance.dto";

export interface DateRange {
  from: Date;
  to: Date;
  previousFrom: Date;
  previousTo: Date;
  label: string;
}

@Injectable()
export class FinanceService {
  private readonly logger = new Logger("FinanceService");

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calcule les dates de début et fin pour la période demandée ainsi que la période N-1 équivalente.
   */
  parseRange(filter: FinanceFilterDto): DateRange {
    const now = new Date();
    let from: Date;
    let to: Date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    let label = "Ce mois";

    switch (filter.range) {
      case "today": {
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        label = "Aujourd'hui";
        break;
      }
      case "yesterday": {
        const y = new Date(now);
        y.setDate(y.getDate() - 1);
        from = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 0, 0, 0, 0);
        to = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59, 999);
        label = "Hier";
        break;
      }
      case "7d": {
        from = new Date(now);
        from.setDate(from.getDate() - 7);
        from.setHours(0, 0, 0, 0);
        label = "7 derniers jours";
        break;
      }
      case "30d": {
        from = new Date(now);
        from.setDate(from.getDate() - 30);
        from.setHours(0, 0, 0, 0);
        label = "30 derniers jours";
        break;
      }
      case "last_month": {
        from = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
        to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        label = "Mois précédent";
        break;
      }
      case "quarter": {
        const qMonth = Math.floor(now.getMonth() / 3) * 3;
        from = new Date(now.getFullYear(), qMonth, 1, 0, 0, 0, 0);
        label = "Ce trimestre";
        break;
      }
      case "year": {
        from = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
        label = "Cette année";
        break;
      }
      case "all": {
        from = new Date(2025, 0, 1, 0, 0, 0, 0);
        label = "Depuis le lancement";
        break;
      }
      case "custom": {
        from = filter.from ? new Date(filter.from) : new Date(now.getFullYear(), now.getMonth(), 1);
        to = filter.to ? new Date(filter.to) : now;
        label = "Période personnalisée";
        break;
      }
      case "month":
      default: {
        from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        label = "Ce mois";
        break;
      }
    }

    const durationMs = to.getTime() - from.getTime();
    const previousTo = new Date(from.getTime() - 1);
    const previousFrom = new Date(previousTo.getTime() - durationMs);

    return { from, to, previousFrom, previousTo, label };
  }

  /**
   * Vue d'ensemble financière : calcul exact du CA, encaissements, charges, abonnements et résultat.
   */
  async overview(filter: FinanceFilterDto) {
    const range = this.parseRange(filter);

    // 1. Ventes et Factures sur la période
    const currentInvoices = await this.prisma.client.invoice.findMany({
      where: { createdAt: { gte: range.from, lte: range.to } },
    });
    const prevInvoices = await this.prisma.client.invoice.findMany({
      where: { createdAt: { gte: range.previousFrom, lte: range.previousTo } },
    });

    const invoicedSubtotalCents = currentInvoices.reduce((s, i) => s + i.amountSubtotalCents, 0);
    const invoicedTaxCents = currentInvoices.reduce((s, i) => s + i.amountTaxCents, 0);
    const invoicedDiscountCents = currentInvoices.reduce((s, i) => s + i.amountDiscountCents, 0);
    const invoicedTotalCents = currentInvoices.reduce((s, i) => s + i.amountTotalCents, 0);
    const prevInvoicedTotalCents = prevInvoices.reduce((s, i) => s + i.amountTotalCents, 0);

    // 2. Encaissements réels (Paiements)
    const currentPayments = await this.prisma.client.payment.findMany({
      where: { createdAt: { gte: range.from, lte: range.to } },
    });
    const prevPayments = await this.prisma.client.payment.findMany({
      where: { createdAt: { gte: range.previousFrom, lte: range.previousTo } },
    });

    const succeededPayments = currentPayments.filter((p) => p.status === "SUCCEEDED" || p.status === "PARTIALLY_REFUNDED");
    const grossCollectedCents = succeededPayments.reduce((s, p) => s + p.amountCents, 0);
    const feesCents = succeededPayments.reduce((s, p) => s + p.feeCents, 0);
    const refundedCents = succeededPayments.reduce((s, p) => s + p.amountRefundedCents, 0);
    const netCollectedCents = grossCollectedCents - feesCents - refundedCents;

    const prevSucceeded = prevPayments.filter((p) => p.status === "SUCCEEDED" || p.status === "PARTIALLY_REFUNDED");
    const prevGrossCollectedCents = prevSucceeded.reduce((s, p) => s + p.amountCents, 0);
    const prevNetCollectedCents = prevGrossCollectedCents - prevSucceeded.reduce((s, p) => s + p.feeCents, 0) - prevSucceeded.reduce((s, p) => s + p.amountRefundedCents, 0);

    const pendingPayments = currentPayments.filter((p) => p.status === "PENDING" || p.status === "PROCESSING");
    const pendingAmountCents = pendingPayments.reduce((s, p) => s + p.amountCents, 0);
    const failedPayments = currentPayments.filter((p) => p.status === "FAILED");
    const failedAmountCents = failedPayments.reduce((s, p) => s + p.amountCents, 0);

    // 3. Dépenses opérationnelles
    const currentExpenses = await this.prisma.client.expense.findMany({
      where: { expenseDate: { gte: range.from, lte: range.to }, status: "PAID" },
    });
    const prevExpenses = await this.prisma.client.expense.findMany({
      where: { expenseDate: { gte: range.previousFrom, lte: range.previousTo }, status: "PAID" },
    });
    const expensesTotalCents = currentExpenses.reduce((s, e) => s + e.amountCents, 0);
    const prevExpensesTotalCents = prevExpenses.reduce((s, e) => s + e.amountCents, 0);

    // 4. Commissions partenaires
    const currentCommissions = await this.prisma.client.partnerCommission.findMany({
      where: { createdAt: { gte: range.from, lte: range.to } },
    });
    const commissionsDueCents = currentCommissions
      .filter((c) => c.status === "PENDING" || c.status === "CONFIRMED" || c.status === "AVAILABLE")
      .reduce((s, c) => s + c.commissionAmountCents, 0);
    const commissionsPaidCents = currentCommissions
      .filter((c) => c.status === "PAID")
      .reduce((s, c) => s + c.commissionAmountCents, 0);

    // 5. Parrainages
    const currentReferrals = await this.prisma.client.referralReward.findMany({
      where: { createdAt: { gte: range.from, lte: range.to } },
    });
    const referralCreditsUsedCents = currentReferrals.reduce((s, r) => s + r.creditUsedCents, 0);

    // 6. Abonnements et métriques SaaS
    const allSubs = await this.prisma.client.subscription.findMany({
      include: { plan: true },
    });
    const activePaidSubs = allSubs.filter((s) => s.status === "ACTIVE" && s.plan.kind !== "FREE");
    const trialingSubs = allSubs.filter((s) => s.status === "TRIALING");
    const pastDueSubs = allSubs.filter((s) => s.status === "PAST_DUE");
    const canceledSubs = allSubs.filter((s) => s.status === "CANCELED");

    // Calcul du MRR normalisé (mensuel + annuel/12)
    let mrrCents = 0;
    for (const sub of activePaidSubs) {
      if (sub.contractPriceYearlyCents !== null && sub.contractPriceYearlyCents !== undefined) {
        mrrCents += Math.round(sub.contractPriceYearlyCents / 12);
      } else if (sub.provider === "MANUAL" && (sub.contractPriceYearlyCents === 0 || sub.contractPriceYearlyCents === null)) {
        // Offre accordée gratuitement / geste commercial / contrat direct à 0 €
        mrrCents += 0;
      } else if (sub.interval === "YEAR") {
        mrrCents += Math.round(sub.plan.priceYearlyCents / 12);
      } else {
        mrrCents += sub.plan.priceMonthlyCents;
      }
    }
    const arrCents = mrrCents * 12;

    // Résultat net estimé
    const estimatedProfitCents = netCollectedCents - expensesTotalCents - commissionsPaidCents;
    const prevEstimatedProfitCents = prevNetCollectedCents - prevExpensesTotalCents;

    const calcChange = (curr: number, prev: number) => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return Math.round(((curr - prev) / prev) * 100);
    };

    return {
      period: {
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        label: range.label,
        currency: filter.currency ?? "USD",
      },
      revenue: {
        subtotalCents: invoicedSubtotalCents,
        taxCents: invoicedTaxCents,
        discountCents: invoicedDiscountCents,
        totalInvoicedCents: invoicedTotalCents,
        invoicedChangePercent: calcChange(invoicedTotalCents, prevInvoicedTotalCents),
      },
      collected: {
        grossCents: grossCollectedCents,
        feesCents,
        refundedCents,
        netCents: netCollectedCents,
        collectedChangePercent: calcChange(netCollectedCents, prevNetCollectedCents),
        pendingCents: pendingAmountCents,
        pendingCount: pendingPayments.length,
        failedCents: failedAmountCents,
        failedCount: failedPayments.length,
      },
      expenses: {
        totalCents: expensesTotalCents,
        changePercent: calcChange(expensesTotalCents, prevExpensesTotalCents),
        count: currentExpenses.length,
      },
      commissions: {
        dueCents: commissionsDueCents,
        paidCents: commissionsPaidCents,
        count: currentCommissions.length,
      },
      referrals: {
        creditsUsedCents: referralCreditsUsedCents,
        count: currentReferrals.length,
      },
      profitability: {
        estimatedProfitCents,
        profitChangePercent: calcChange(estimatedProfitCents, prevEstimatedProfitCents),
        isProvisional: true, // mention légale obligatoire
      },
      subscriptions: {
        activePaidCount: activePaidSubs.length,
        trialingCount: trialingSubs.length,
        pastDueCount: pastDueSubs.length,
        canceledCount: canceledSubs.length,
        mrrCents,
        arrCents,
        arpuCents: activePaidSubs.length > 0 ? Math.round(mrrCents / activePaidSubs.length) : 0,
      },
    };
  }

  /**
   * Séries temporelles pour les graphiques interactifs avec comparaison N-1.
   */
  async charts(filter: FinanceFilterDto) {
    const range = this.parseRange(filter);
    const invoices = await this.prisma.client.invoice.findMany({
      where: { createdAt: { gte: range.from, lte: range.to } },
      select: { createdAt: true, amountTotalCents: true, status: true },
    });
    const payments = await this.prisma.client.payment.findMany({
      where: { createdAt: { gte: range.from, lte: range.to } },
      select: { createdAt: true, amountCents: true, netCents: true, status: true, provider: true },
    });
    const expenses = await this.prisma.client.expense.findMany({
      where: { expenseDate: { gte: range.from, lte: range.to }, status: "PAID" },
      select: { expenseDate: true, amountCents: true, category: true },
    });
    const plans = await this.prisma.client.subscriptionPlan.findMany({
      select: { id: true, code: true, name: true },
    });
    const lines = await this.prisma.client.invoiceLine.findMany({
      where: { invoice: { createdAt: { gte: range.from, lte: range.to } } },
      select: { planId: true, amountTotalCents: true },
    });

    // Agrégation par jour (clé YYYY-MM-DD)
    const dailyMap = new Map<string, { date: string; invoicedCents: number; collectedCents: number; expensesCents: number; netIncomeCents: number }>();
    const start = new Date(range.from);
    const end = new Date(range.to);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      dailyMap.set(key, { date: key, invoicedCents: 0, collectedCents: 0, expensesCents: 0, netIncomeCents: 0 });
    }

    for (const inv of invoices) {
      const key = inv.createdAt.toISOString().slice(0, 10);
      const row = dailyMap.get(key);
      if (row) row.invoicedCents += inv.amountTotalCents;
    }

    for (const pay of payments) {
      if (pay.status === "SUCCEEDED" || pay.status === "PARTIALLY_REFUNDED") {
        const key = pay.createdAt.toISOString().slice(0, 10);
        const row = dailyMap.get(key);
        if (row) row.collectedCents += pay.netCents;
      }
    }

    for (const exp of expenses) {
      const key = exp.expenseDate.toISOString().slice(0, 10);
      const row = dailyMap.get(key);
      if (row) row.expensesCents += exp.amountCents;
    }

    const timeSeries = Array.from(dailyMap.values()).map((r) => ({
      ...r,
      netIncomeCents: r.collectedCents - r.expensesCents,
    }));

    // Répartition par formule
    const planMap = new Map<string, number>();
    for (const l of lines) {
      const p = plans.find((x) => x.id === l.planId);
      const label = p ? p.name : "Autres";
      planMap.set(label, (planMap.get(label) ?? 0) + l.amountTotalCents);
    }
    const planBreakdown = Array.from(planMap.entries()).map(([label, amountCents]) => ({ label, amountCents }));

    // Répartition par catégorie de dépense
    const expCatMap = new Map<string, number>();
    for (const e of expenses) {
      expCatMap.set(e.category, (expCatMap.get(e.category) ?? 0) + e.amountCents);
    }
    const expenseBreakdown = Array.from(expCatMap.entries()).map(([category, amountCents]) => ({ category, amountCents }));

    return {
      timeSeries,
      planBreakdown,
      expenseBreakdown,
    };
  }

  /**
   * Tableau complet des ventes avec filtres et recherche.
   */
  async sales(filter: SalesFilterDto) {
    const range = this.parseRange(filter);
    const where: any = {
      createdAt: { gte: range.from, lte: range.to },
    };

    if (filter.status && filter.status !== "ALL") {
      where.status = filter.status;
    }

    if (filter.q) {
      where.OR = [
        { number: { contains: filter.q, mode: "insensitive" } },
        { tenant: { name: { contains: filter.q, mode: "insensitive" } } },
        { tenant: { slug: { contains: filter.q, mode: "insensitive" } } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.client.invoice.count({ where }),
      this.prisma.client.invoice.findMany({
        where,
        include: {
          tenant: { select: { id: true, name: true, slug: true } },
          subscription: { include: { plan: true } },
          payments: true,
          lines: true,
          partnerCommissions: { include: { partner: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
      }),
    ]);

    return {
      items: items.map((inv) => ({
        id: inv.id,
        number: inv.number,
        createdAt: inv.createdAt.toISOString(),
        tenant: inv.tenant,
        plan: inv.subscription?.plan?.name ?? "Sur-mesure",
        status: inv.status,
        currency: inv.currency,
        amountSubtotalCents: inv.amountSubtotalCents,
        amountTaxCents: inv.amountTaxCents,
        amountDiscountCents: inv.amountDiscountCents,
        amountTotalCents: inv.amountTotalCents,
        amountPaidCents: inv.amountPaidCents,
        pdfUrl: inv.pdfUrl,
        billingReason: inv.billingReason,
        partner: inv.partnerCommissions[0]?.partner?.name ?? null,
        commissionCents: inv.partnerCommissions[0]?.commissionAmountCents ?? 0,
        paymentsCount: inv.payments.length,
      })),
      total,
      page: filter.page,
      limit: filter.limit,
      totalPages: Math.ceil(total / filter.limit),
    };
  }

  /**
   * Détail complet d'une vente pour la fiche modale.
   */
  async saleDetail(id: string) {
    const invoice = await this.prisma.client.invoice.findUnique({
      where: { id },
      include: {
        tenant: {
          include: {
            settings: true,
            subscription: { include: { plan: true } },
          },
        },
        lines: true,
        payments: { include: { refunds: true } },
        partnerCommissions: { include: { partner: true } },
      },
    });
    if (!invoice) throw notFound("Vente introuvable");
    return invoice;
  }

  /**
   * Liste des paiements.
   */
  async payments(filter: PaymentsFilterDto) {
    const range = this.parseRange(filter);
    const where: any = {
      createdAt: { gte: range.from, lte: range.to },
    };

    if (filter.status && filter.status !== "ALL") where.status = filter.status;
    if (filter.provider && filter.provider !== "ALL") where.provider = filter.provider;

    if (filter.q) {
      where.OR = [
        { reference: { contains: filter.q, mode: "insensitive" } },
        { providerPaymentId: { contains: filter.q, mode: "insensitive" } },
        { tenant: { name: { contains: filter.q, mode: "insensitive" } } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.client.payment.count({ where }),
      this.prisma.client.payment.findMany({
        where,
        include: {
          tenant: { select: { id: true, name: true, slug: true } },
          invoice: { select: { id: true, number: true } },
          refunds: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
      }),
    ]);

    return {
      items,
      total,
      page: filter.page,
      limit: filter.limit,
      totalPages: Math.ceil(total / filter.limit),
    };
  }

  /**
   * Remboursement contrôlé avec enregistrement dans l'audit financier.
   */
  async refundPayment(auth: AuthState, paymentId: string, dto: RefundCreateDto) {
    const payment = await this.prisma.client.payment.findUnique({
      where: { id: paymentId },
      include: { tenant: true },
    });
    if (!payment) throw notFound("Paiement introuvable");
    if (payment.status !== "SUCCEEDED" && payment.status !== "PARTIALLY_REFUNDED") {
      throw badRequest("invalid_status", "Seul un paiement réussi peut être remboursé.");
    }

    const maxRefundable = payment.amountCents - payment.amountRefundedCents;
    const refundAmount = dto.amountCents ?? maxRefundable;
    if (refundAmount <= 0 || refundAmount > maxRefundable) {
      throw badRequest("invalid_amount", `Le montant remboursable maximum est de ${maxRefundable / 100} ${payment.currency}.`);
    }

    let providerRefundId: string | null = null;
    if (payment.provider === "STRIPE" && payment.providerPaymentId) {
      const cfg = loadConfig();
      if (cfg.STRIPE_SECRET_KEY) {
        try {
          const Stripe = (await import("stripe")).default;
          const stripe = new Stripe(cfg.STRIPE_SECRET_KEY);
          const refund = await stripe.refunds.create({
            payment_intent: payment.providerPaymentId,
            amount: refundAmount,
            reason: "requested_by_customer",
          });
          providerRefundId = refund.id;
        } catch (err) {
          throw badRequest("stripe_refund_failed", `Échec Stripe : ${err instanceof Error ? err.message : err}`);
        }
      }
    }

    const newRefundedTotal = payment.amountRefundedCents + refundAmount;
    const newStatus = newRefundedTotal >= payment.amountCents ? "REFUNDED" : "PARTIALLY_REFUNDED";

    const [refund] = await this.prisma.client.$transaction([
      this.prisma.client.refund.create({
        data: {
          paymentId: payment.id,
          amountCents: refundAmount,
          currency: payment.currency,
          reason: dto.reason,
          status: "SUCCEEDED",
          providerRefundId,
          initiatedByUserId: auth.user.id,
        },
      }),
      this.prisma.client.payment.update({
        where: { id: payment.id },
        data: {
          amountRefundedCents: newRefundedTotal,
          status: newStatus,
        },
      }),
      this.prisma.client.partnerCommission.updateMany({
        where: { paymentId: payment.id, status: { in: ["PENDING", "CONFIRMED", "AVAILABLE"] } },
        data: { status: "CANCELLED" },
      }),
      this.prisma.client.financialAuditLog.create({
        data: {
          actorUserId: auth.user.id,
          actorEmail: auth.user.email,
          action: "payment.refund",
          entityType: "payment",
          entityId: payment.id,
          oldValue: { status: payment.status, refundedCents: payment.amountRefundedCents },
          newValue: { status: newStatus, refundedCents: newRefundedTotal },
          reason: dto.reason,
        },
      }),
    ]);

    return refund;
  }

  /**
   * Gestion des abonnements avec MRR / ARR normalisés.
   */
  async subscriptions() {
    const subs = await this.prisma.client.subscription.findMany({
      include: {
        tenant: { select: { id: true, name: true, slug: true, status: true } },
        plan: true,
        invoices: { orderBy: { createdAt: "desc" }, take: 3 },
      },
      orderBy: { createdAt: "desc" },
    });

    return subs.map((s) => {
      let mrrCents = 0;
      if (s.status === "ACTIVE" && s.plan.kind !== "FREE") {
        if (s.contractPriceYearlyCents !== null && s.contractPriceYearlyCents !== undefined) {
          mrrCents = Math.round(s.contractPriceYearlyCents / 12);
        } else if (s.provider === "MANUAL" && (s.contractPriceYearlyCents === 0 || s.contractPriceYearlyCents === null)) {
          mrrCents = 0;
        } else if (s.interval === "YEAR") {
          mrrCents = Math.round(s.plan.priceYearlyCents / 12);
        } else {
          mrrCents = s.plan.priceMonthlyCents;
        }
      }
      return {
        id: s.id,
        tenant: s.tenant,
        plan: s.plan,
        status: s.status,
        interval: s.interval,
        provider: s.provider,
        currentPeriodEnd: s.currentPeriodEnd?.toISOString() ?? null,
        cancelAtPeriodEnd: s.cancelAtPeriodEnd,
        pastDueSince: s.pastDueSince?.toISOString() ?? null,
        mrrCents,
        arrCents: mrrCents * 12,
        recentInvoices: s.invoices.map((i) => ({ id: i.id, number: i.number, amountTotalCents: i.amountTotalCents, status: i.status })),
      };
    });
  }

  /**
   * Fiche de suivi des clients payants.
   */
  async customers() {
    const tenants = await this.prisma.client.tenant.findMany({
      include: {
        settings: { select: { country: true } },
        establishments: { select: { city: true }, take: 1 },
        subscription: { include: { plan: true } },
        invoices: { select: { amountTotalCents: true, status: true, createdAt: true } },
        payments: {
          where: { status: "SUCCEEDED" },
          orderBy: { confirmedAt: "asc" },
          select: { amountCents: true, confirmedAt: true },
        },
        attribution: { include: { partner: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });

    return tenants.map((t) => {
      const totalInvoicedCents = t.invoices.reduce((s, i) => s + (i.amountTotalCents || 0), 0);
      const totalPaidCents = t.payments.reduce((s, p) => s + (p.amountCents || 0), 0);
      const firstPayment = t.payments[0];
      const lastPayment = t.payments[t.payments.length - 1];

      const planName = t.subscription?.plan?.name ?? "Gratuit";
      const planCode = t.subscription?.plan?.code ?? "free";
      const subStatus = t.subscription?.status ?? "NONE";

      return {
        id: t.id,
        tenantId: t.id,
        name: t.name,
        tenantName: t.name,
        slug: t.slug,
        tenantSlug: t.slug,
        status: t.status,
        city: t.establishments[0]?.city ?? null,
        country: t.settings?.country ?? null,
        createdAt: t.createdAt.toISOString(),

        plan: planName,
        planName,
        planKind: t.subscription?.plan?.kind ?? "FREE",
        planCode,
        subStatus,
        subscriptionStatus: subStatus,
        interval: t.subscription?.interval ?? "YEAR",
        provider: t.subscription?.provider ?? "MOCK",
        contractPriceYearlyCents: t.subscription?.contractPriceYearlyCents ?? null,

        totalInvoicedCents,
        totalPaidCents,
        totalCollectedCents: totalPaidCents,
        paymentsCount: t.payments.length,
        firstPaymentAt: firstPayment?.confirmedAt?.toISOString() ?? null,
        lastPaymentAt: lastPayment?.confirmedAt?.toISOString() ?? null,
        nextBillingAt: t.subscription?.currentPeriodEnd?.toISOString() ?? null,

        partnerName: t.attribution?.partner?.name ?? null,
      };
    });
  }

  /**
   * Dépenses opérationnelles.
   */
  async expenses(query: { category?: string; range?: string; from?: string; to?: string }) {
    const range = this.parseRange({ range: (query.range as any) ?? "month", from: query.from, to: query.to, currency: "USD" });
    const where: any = {
      expenseDate: { gte: range.from, lte: range.to },
    };
    if (query.category && query.category !== "ALL") where.category = query.category;

    const items = await this.prisma.client.expense.findMany({
      where,
      orderBy: { expenseDate: "desc" },
    });

    const totalCents = items.reduce((s, e) => s + e.amountCents, 0);
    return { items, totalCents, count: items.length };
  }

  async createExpense(auth: AuthState, dto: ExpenseCreateDto) {
    const ref = `EXP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const expense = await this.prisma.client.expense.create({
      data: {
        reference: ref,
        title: dto.title,
        supplier: dto.supplier,
        category: dto.category,
        amountCents: dto.amountCents,
        currency: dto.currency,
        taxCents: dto.taxCents,
        isRecurring: dto.isRecurring,
        recurringInterval: dto.recurringInterval ?? null,
        status: dto.status,
        paymentMethod: dto.paymentMethod ?? null,
        proofUrl: dto.proofUrl ?? null,
        expenseDate: new Date(dto.expenseDate),
        createdById: auth.user.id,
      },
    });

    await this.prisma.client.financialAuditLog.create({
      data: {
        actorUserId: auth.user.id,
        actorEmail: auth.user.email,
        action: "expense.create",
        entityType: "expense",
        entityId: expense.id,
        newValue: expense as any,
        reason: `Dépense ${dto.title} (${dto.amountCents / 100} ${dto.currency})`,
      },
    });

    return expense;
  }

  async deleteExpense(auth: AuthState, id: string) {
    const expense = await this.prisma.client.expense.findUnique({ where: { id } });
    if (!expense) throw notFound("Dépense introuvable");
    await this.prisma.client.expense.delete({ where: { id } });
    await this.prisma.client.financialAuditLog.create({
      data: {
        actorUserId: auth.user.id,
        actorEmail: auth.user.email,
        action: "expense.delete",
        entityType: "expense",
        entityId: id,
        oldValue: expense as any,
        reason: `Suppression dépense ${expense.title}`,
      },
    });
    return { success: true };
  }

  /**
   * Partenaires FOVE et commissions.
   */
  async partners() {
    const partners = await this.prisma.client.partner.findMany({
      include: {
        commissions: true,
        payouts: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return partners.map((p) => {
      const gmvCents = p.commissions.reduce((s, c) => s + c.amountBaseCents, 0);
      const totalEarnedCents = p.commissions.reduce((s, c) => s + c.commissionAmountCents, 0);
      const paidCents = p.payouts.reduce((s, pay) => s + pay.amountCents, 0);
      const balanceDueCents = totalEarnedCents - paidCents;

      return {
        id: p.id,
        name: p.name,
        email: p.email,
        code: p.code,
        phone: p.phone,
        company: p.company,
        commissionRatePercent: Number(p.commissionRatePercent),
        status: p.status,
        gmvCents,
        totalEarnedCents,
        paidCents,
        balanceDueCents: Math.max(0, balanceDueCents),
        conversionsCount: p.commissions.length,
      };
    });
  }

  async createPartner(auth: AuthState, dto: PartnerCreateDto) {
    const existing = await this.prisma.client.partner.findFirst({
      where: { OR: [{ email: dto.email }, { code: dto.code.toUpperCase() }] },
    });
    if (existing) throw badRequest("duplicate", "Un partenaire avec cet email ou ce code existe déjà.");

    const partner = await this.prisma.client.partner.create({
      data: {
        name: dto.name,
        email: dto.email,
        code: dto.code.toUpperCase(),
        phone: dto.phone ?? null,
        company: dto.company ?? null,
        commissionRatePercent: dto.commissionRatePercent,
        status: "ACTIVE",
      },
    });

    await this.prisma.client.financialAuditLog.create({
      data: {
        actorUserId: auth.user.id,
        actorEmail: auth.user.email,
        action: "partner.create",
        entityType: "partner",
        entityId: partner.id,
        newValue: partner as any,
      },
    });

    return partner;
  }

  async commissions(query: { partnerId?: string; status?: string }) {
    const where: any = {};
    if (query.partnerId) where.partnerId = query.partnerId;
    if (query.status && query.status !== "ALL") where.status = query.status;

    return this.prisma.client.partnerCommission.findMany({
      where,
      include: {
        partner: { select: { id: true, name: true, code: true, email: true } },
        tenant: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async payCommission(auth: AuthState, commissionId: string) {
    const comm = await this.prisma.client.partnerCommission.findUnique({
      where: { id: commissionId },
      include: { partner: true },
    });
    if (!comm) throw notFound("Commission introuvable");
    if (comm.status === "PAID") throw badRequest("already_paid", "Cette commission a déjà été versée.");

    const payout = await this.prisma.client.partnerPayout.create({
      data: {
        partnerId: comm.partnerId,
        amountCents: comm.commissionAmountCents,
        currency: comm.currency,
        method: "Virement direct",
        status: "PAID",
        reference: `PAYOUT-${Date.now().toString().slice(-6)}`,
        approvedByUserId: auth.user.id,
      },
    });

    await this.prisma.client.partnerCommission.update({
      where: { id: comm.id },
      data: { status: "PAID", paidAt: new Date(), payoutId: payout.id },
    });

    await this.prisma.client.financialAuditLog.create({
      data: {
        actorUserId: auth.user.id,
        actorEmail: auth.user.email,
        action: "partner.commission_paid",
        entityType: "partner_commission",
        entityId: comm.id,
        newValue: { payoutId: payout.id, amountCents: comm.commissionAmountCents },
        reason: `Paiement commission à ${comm.partner.name}`,
      },
    });

    return payout;
  }

  /**
   * Parrainage & crédits.
   */
  async referrals() {
    return this.prisma.client.referralReward.findMany({
      include: {
        referrerTenant: { select: { id: true, name: true, slug: true } },
        referredTenant: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Trésorerie & Rapprochement bancaire.
   */
  async treasury() {
    const [payments, expenses, payouts, bankEntries] = await Promise.all([
      this.prisma.client.payment.findMany({ where: { status: "SUCCEEDED" }, select: { amountCents: true, feeCents: true, provider: true } }),
      this.prisma.client.expense.findMany({ where: { status: "PAID" }, select: { amountCents: true } }),
      this.prisma.client.partnerPayout.findMany({ where: { status: "PAID" }, select: { amountCents: true } }),
      this.prisma.client.bankStatementEntry.findMany({ orderBy: { entryDate: "desc" } }),
    ]);

    const totalCollectedNetCents = payments.reduce((s, p) => s + (p.amountCents - p.feeCents), 0);
    const stripeHeldCents = payments.filter((p) => p.provider === "STRIPE").reduce((s, p) => s + (p.amountCents - p.feeCents), 0);
    const manualDirectCents = payments.filter((p) => p.provider !== "STRIPE").reduce((s, p) => s + p.amountCents, 0);

    const totalExpensesCents = expenses.reduce((s, e) => s + e.amountCents, 0);
    const totalPayoutsCents = payouts.reduce((s, p) => s + p.amountCents, 0);

    // Solde théorique estimé
    const estimatedCashCents = totalCollectedNetCents - totalExpensesCents - totalPayoutsCents;

    // Solde bancaire réel réconcilié
    const bankBalanceCents = bankEntries.reduce((s, b) => s + b.amountCents, 0);
    const unreconciledCount = bankEntries.filter((b) => !b.reconciled).length;

    return {
      estimatedCashCents,
      stripeHeldCents,
      manualDirectCents,
      totalExpensesCents,
      totalPayoutsCents,
      bankBalanceCents,
      unreconciledCount,
      bankEntries: bankEntries.slice(0, 50),
    };
  }

  async reconcileEntry(auth: AuthState, entryId: string, dto: ReconcileDto) {
    const entry = await this.prisma.client.bankStatementEntry.findUnique({ where: { id: entryId } });
    if (!entry) throw notFound("Ligne de relevé introuvable");

    const updated = await this.prisma.client.bankStatementEntry.update({
      where: { id: entryId },
      data: {
        reconciled: true,
        reconciledType: dto.reconciledType,
        reconciledId: dto.reconciledId,
        notes: dto.notes ?? null,
      },
    });

    await this.prisma.client.financialAuditLog.create({
      data: {
        actorUserId: auth.user.id,
        actorEmail: auth.user.email,
        action: "treasury.reconcile",
        entityType: "bank_entry",
        entityId: entryId,
        newValue: dto as any,
      },
    });

    return updated;
  }

  /**
   * Journal d'audit financier append-only.
   */
  async auditLogs(limit = 100) {
    return this.prisma.client.financialAuditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  /**
   * Génération de rapport mensuel complet pour les associés.
   */
  async monthlyAssociateReport(year: number, month: number) {
    const from = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const to = new Date(year, month, 0, 23, 59, 59, 999);
    return this.overview({ range: "custom", from: from.toISOString(), to: to.toISOString(), currency: "USD" });
  }
}
