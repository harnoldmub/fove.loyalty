import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import type { AuthState } from "../../common/context";
import { badRequest, notFound, forbidden } from "../../common/errors";
import { loadConfig, stripeSecretKey } from "../../config";
import { convertCents, REFERENCE_CURRENCY } from "@fove/shared";
import { PricingService, type PlanWithPrices } from "../../billing/pricing.service";
import type {
  ExchangeRatesDto,
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
  ) {}

  /**
   * Conversion vers la monnaie du rapport au taux comptable (docs/chantier-multi-devises.md).
   * Une monnaie sans taux compte pour 0 et apparaît dans `missingRates`.
   */
  private async converter(target: string = REFERENCE_CURRENCY) {
    const rates = await this.pricing.rates();
    const missing = new Set<string>();
    const to = (cents: number, from: string) => {
      const value = convertCents(cents, from, target, rates);
      if (value === null) missing.add(from);
      return value ?? 0;
    };
    return { to, currency: target, missingRates: () => [...missing] };
  }

  /** Prix annuel d'un abonnement dans sa monnaie : contrat Sur-mesure, sinon prix de l'offre. */
  private yearlyPrice(sub: { provider: string; currency: string; contractPriceYearlyCents: number | null; plan: PlanWithPrices }): number {
    if (sub.contractPriceYearlyCents !== null) return sub.contractPriceYearlyCents;
    if (sub.provider === "MANUAL") return 0; // offre accordée gratuitement / geste commercial
    return this.pricing.yearlyCents(sub.plan, sub.currency) ?? 0;
  }

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
   * Chiffres d'une période, convertis dans la monnaie du rapport au taux comptable.
   * MRR et ARR sont ceux du jour (pas d'historique des abonnements).
   */
  private async periodFigures(from: Date, to: Date, fx: Awaited<ReturnType<FinanceService["converter"]>>) {
    const db = this.prisma.client;
    const [invoices, payments, expenses, commissions, creditUses, newPaid, churned] = await Promise.all([
      db.invoice.findMany({ where: { createdAt: { gte: from, lte: to }, status: { not: "VOID" } } }),
      db.payment.findMany({ where: { createdAt: { gte: from, lte: to } } }),
      db.expense.findMany({ where: { expenseDate: { gte: from, lte: to }, status: "PAID" } }),
      db.partnerCommission.findMany({ where: { createdAt: { gte: from, lte: to }, status: { notIn: ["CANCELLED", "REVERSED"] } } }),
      db.referralCreditUse.findMany({ where: { createdAt: { gte: from, lte: to } }, include: { reward: { select: { currency: true } } } }),
      db.subscription.count({ where: { createdAt: { gte: from, lte: to }, plan: { kind: { not: "FREE" } }, status: { in: ["ACTIVE", "PAST_DUE"] } } }),
      db.subscription.count({ where: { updatedAt: { gte: from, lte: to }, plan: { kind: { not: "FREE" } }, status: "CANCELED" } }),
    ]);
    const sum = <T,>(rows: T[], amount: (r: T) => number, currency: (r: T) => string) => rows.reduce((total, r) => total + fx.to(amount(r), currency(r)), 0);
    const succeeded = payments.filter((p) => p.status === "SUCCEEDED" || p.status === "PARTIALLY_REFUNDED" || p.status === "REFUNDED");
    const grossCollectedCents = sum(succeeded, (p) => p.amountCents, (p) => p.currency);
    const providerFeesCents = sum(succeeded, (p) => p.feeCents, (p) => p.currency);
    const refundedCents = sum(succeeded, (p) => p.amountRefundedCents, (p) => p.currency);
    const netCollectedCents = grossCollectedCents - providerFeesCents - refundedCents;
    const operatingExpensesCents = sum(expenses, (e) => e.amountCents, (e) => e.currency);
    const partnerCommissionsCents = sum(commissions, (c) => c.commissionAmountCents, (c) => c.currency);
    return {
      revenueInvoicedCents: sum(invoices, (i) => i.amountTotalCents, (i) => i.currency),
      revenueInvoicedHtCents: sum(invoices, (i) => i.amountSubtotalCents, (i) => i.currency),
      taxesCollectedCents: sum(invoices, (i) => i.amountTaxCents, (i) => i.currency),
      discountCents: sum(invoices, (i) => i.amountDiscountCents, (i) => i.currency),
      grossCollectedCents,
      providerFeesCents,
      refundedCents,
      netCollectedCents,
      pendingCollectedCents: sum(payments.filter((p) => p.status === "PENDING" || p.status === "PROCESSING"), (p) => p.amountCents, (p) => p.currency),
      failedCollectedCents: sum(payments.filter((p) => p.status === "FAILED"), (p) => p.amountCents, (p) => p.currency),
      operatingExpensesCents,
      partnerCommissionsCents,
      referralCreditsCents: sum(creditUses, (u) => u.amountCents, (u) => u.reward.currency),
      provisionalNetProfitCents: netCollectedCents - operatingExpensesCents - partnerCommissionsCents,
      newPaidSubscriptionsCount: newPaid,
      churnedSubscriptionsCount: churned,
      collectedByCurrency: succeeded.reduce<Record<string, { grossCents: number; netCents: number; count: number }>>((acc, p) => {
        const row = (acc[p.currency] ??= { grossCents: 0, netCents: 0, count: 0 });
        row.grossCents += p.amountCents;
        row.netCents += p.amountCents - p.feeCents - p.amountRefundedCents;
        row.count += 1;
        return acc;
      }, {}),
    };
  }

  /**
   * Vue d'ensemble financière de la période et de la période précédente équivalente, consolidée
   * dans la monnaie du rapport (l'euro par défaut) au taux comptable ; encaissements aussi par monnaie.
   */
  async overview(filter: FinanceFilterDto) {
    const range = this.parseRange(filter);
    const fx = await this.converter(filter.currency);
    const [current, previous, subs] = await Promise.all([
      this.periodFigures(range.from, range.to, fx),
      this.periodFigures(range.previousFrom, range.previousTo, fx),
      this.prisma.client.subscription.findMany({ include: { plan: { include: { prices: true } } } }),
    ]);

    // MRR normalisé (prix annuel / 12) des abonnements payants en cours.
    const activePaid = subs.filter((s) => s.status === "ACTIVE" && s.plan.kind !== "FREE");
    const mrrCents = activePaid.reduce((total, s) => total + fx.to(Math.round(this.yearlyPrice(s) / 12), s.currency), 0);
    const churnBase = activePaid.length + current.churnedSubscriptionsCount;
    const change = (curr: number, prev: number) => (prev === 0 ? (curr === 0 ? 0 : null) : Math.round(((curr - prev) / Math.abs(prev)) * 100));

    const { collectedByCurrency, ...cur } = current;
    const { collectedByCurrency: _prevByCurrency, ...prev } = previous;
    return {
      currency: fx.currency,
      missingRates: fx.missingRates(),
      period: { from: range.from.toISOString(), to: range.to.toISOString(), label: range.label },
      previousPeriod: { from: range.previousFrom.toISOString(), to: range.previousTo.toISOString() },
      current: {
        ...cur,
        mrrCents,
        arrCents: mrrCents * 12,
        activePaidSubscriptionsCount: activePaid.length,
        trialingCount: subs.filter((s) => s.status === "TRIALING").length,
        pastDueCount: subs.filter((s) => s.status === "PAST_DUE").length,
        churnRatePercent: churnBase > 0 ? Math.round((current.churnedSubscriptionsCount / churnBase) * 1000) / 10 : 0,
      },
      previous: prev,
      deltas: {
        revenueInvoicedPct: change(cur.revenueInvoicedCents, prev.revenueInvoicedCents),
        grossCollectedPct: change(cur.grossCollectedCents, prev.grossCollectedCents),
        netCollectedPct: change(cur.netCollectedCents, prev.netCollectedCents),
        expensesPct: change(cur.operatingExpensesCents, prev.operatingExpensesCents),
        provisionalProfitPct: change(cur.provisionalNetProfitCents, prev.provisionalNetProfitCents),
        activePaidSubsPct: null,
      },
      collectedByCurrency,
      isProvisional: true, // mention légale obligatoire
    };
  }

  /**
   * Séries temporelles pour les graphiques interactifs avec comparaison N-1.
   */
  async charts(filter: FinanceFilterDto) {
    const range = this.parseRange(filter);
    const fx = await this.converter(filter.currency);
    const invoices = await this.prisma.client.invoice.findMany({
      where: { createdAt: { gte: range.from, lte: range.to } },
      select: { createdAt: true, amountTotalCents: true, status: true, currency: true },
    });
    const payments = await this.prisma.client.payment.findMany({
      where: { createdAt: { gte: range.from, lte: range.to } },
      select: { createdAt: true, amountCents: true, netCents: true, status: true, provider: true, currency: true },
    });
    const expenses = await this.prisma.client.expense.findMany({
      where: { expenseDate: { gte: range.from, lte: range.to }, status: "PAID" },
      select: { expenseDate: true, amountCents: true, category: true, currency: true },
    });
    const plans = await this.prisma.client.subscriptionPlan.findMany({
      select: { id: true, code: true, name: true },
    });
    const lines = await this.prisma.client.invoiceLine.findMany({
      where: { invoice: { createdAt: { gte: range.from, lte: range.to } } },
      select: { planId: true, amountTotalCents: true, currency: true },
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
      if (row) row.invoicedCents += fx.to(inv.amountTotalCents, inv.currency);
    }

    for (const pay of payments) {
      if (pay.status === "SUCCEEDED" || pay.status === "PARTIALLY_REFUNDED") {
        const key = pay.createdAt.toISOString().slice(0, 10);
        const row = dailyMap.get(key);
        if (row) row.collectedCents += fx.to(pay.netCents, pay.currency);
      }
    }

    for (const exp of expenses) {
      const key = exp.expenseDate.toISOString().slice(0, 10);
      const row = dailyMap.get(key);
      if (row) row.expensesCents += fx.to(exp.amountCents, exp.currency);
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
      planMap.set(label, (planMap.get(label) ?? 0) + fx.to(l.amountTotalCents, l.currency));
    }
    const planBreakdown = Array.from(planMap.entries()).map(([label, amountCents]) => ({ label, amountCents }));

    // Répartition par catégorie de dépense
    const expCatMap = new Map<string, number>();
    for (const e of expenses) {
      expCatMap.set(e.category, (expCatMap.get(e.category) ?? 0) + fx.to(e.amountCents, e.currency));
    }
    const expenseBreakdown = Array.from(expCatMap.entries()).map(([category, amountCents]) => ({ category, amountCents }));

    return {
      currency: fx.currency,
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
      const key = stripeSecretKey(cfg);
      if (key) {
        try {
          const Stripe = (await import("stripe")).default;
          const stripe = new Stripe(key);
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
    const fx = await this.converter();
    const subs = await this.prisma.client.subscription.findMany({
      include: {
        tenant: { select: { id: true, name: true, slug: true, status: true } },
        plan: { include: { prices: true } },
        invoices: { orderBy: { createdAt: "desc" }, take: 3 },
      },
      orderBy: { createdAt: "desc" },
    });

    const items = subs.map((s) => {
      // MRR dans la monnaie de l'abonnement, et équivalent en euros.
      const mrrCents = s.status === "ACTIVE" && s.plan.kind !== "FREE" ? Math.round(this.yearlyPrice(s) / 12) : 0;
      const { prices: _prices, ...plan } = s.plan;
      return {
        id: s.id,
        tenant: s.tenant,
        plan,
        currency: s.currency,
        /** Prix annuel facturé (contrat ou offre), dans la monnaie de l'abonnement. */
        yearlyPriceCents: s.plan.kind === "FREE" ? 0 : this.yearlyPrice(s),
        mrrRefCents: fx.to(mrrCents, s.currency),
        status: s.status,
        interval: s.interval,
        provider: s.provider,
        currentPeriodEnd: s.currentPeriodEnd?.toISOString() ?? null,
        cancelAtPeriodEnd: s.cancelAtPeriodEnd,
        pastDueSince: s.pastDueSince?.toISOString() ?? null,
        mrrCents,
        arrCents: mrrCents * 12,
        recentInvoices: s.invoices.map((i) => ({ id: i.id, number: i.number, amountTotalCents: i.amountTotalCents, currency: i.currency, status: i.status })),
      };
    });
    const running = items.filter((s) => s.status === "ACTIVE" || s.status === "PAST_DUE");
    const mrrTotalCents = items.reduce((sum, s) => sum + s.mrrRefCents, 0);
    return {
      currency: fx.currency,
      items,
      mrrTotalCents,
      arrTotalCents: mrrTotalCents * 12,
      activeCount: running.length,
      trialingCount: items.filter((s) => s.status === "TRIALING").length,
      payingCount: running.filter((s) => s.plan.kind !== "FREE").length,
    };
  }

  /**
   * Fiche de suivi des clients payants.
   */
  async customers() {
    const fx = await this.converter();
    const tenants = await this.prisma.client.tenant.findMany({
      include: {
        settings: { select: { country: true } },
        establishments: { select: { city: true }, take: 1 },
        subscription: { include: { plan: true } },
        invoices: { select: { amountTotalCents: true, currency: true, status: true, createdAt: true } },
        payments: {
          where: { status: "SUCCEEDED" },
          orderBy: { confirmedAt: "asc" },
          select: { amountCents: true, currency: true, confirmedAt: true },
        },
        attribution: { include: { partner: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });

    return tenants.map((t) => {
      // Totaux en euros (taux comptable) : un commerce a pu payer dans plusieurs monnaies.
      const totalInvoicedCents = t.invoices.reduce((s, i) => s + fx.to(i.amountTotalCents || 0, i.currency), 0);
      const totalPaidCents = t.payments.reduce((s, p) => s + fx.to(p.amountCents || 0, p.currency), 0);
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
        subscriptionCurrency: t.subscription?.currency ?? null,
        currency: fx.currency,

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
    const range = this.parseRange({ range: (query.range as any) ?? "month", from: query.from, to: query.to, currency: "EUR" });
    const where: any = {
      expenseDate: { gte: range.from, lte: range.to },
    };
    if (query.category && query.category !== "ALL") where.category = query.category;

    const items = await this.prisma.client.expense.findMany({
      where,
      orderBy: { expenseDate: "desc" },
    });

    // Total en euros au taux comptable ; chaque dépense garde sa monnaie.
    const fx = await this.converter();
    const totalCents = items.reduce((s, e) => s + fx.to(e.amountCents, e.currency), 0);
    return { items, totalCents, currency: fx.currency, count: items.length };
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
    const fx = await this.converter();

    return partners.map((p) => {
      const gmvCents = p.commissions.reduce((s, c) => s + fx.to(c.amountBaseCents, c.currency), 0);
      const totalEarnedCents = p.commissions.reduce((s, c) => s + fx.to(c.commissionAmountCents, c.currency), 0);
      const paidCents = p.payouts.reduce((s, pay) => s + fx.to(pay.amountCents, pay.currency), 0);
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
        // Noms lus par la page Finance > Partenaires ; montants en euros (taux comptable).
        totalSalesCount: p.commissions.length,
        pendingCents: Math.max(0, balanceDueCents),
        currency: fx.currency,
        payoutCurrency: p.payoutCurrency,
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

    const rows = await this.prisma.client.partnerCommission.findMany({
      where,
      include: {
        partner: { select: { id: true, name: true, code: true, email: true } },
        tenant: { select: { id: true, name: true, slug: true } },
        invoice: { select: { id: true, number: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    // Chaque commission dans sa monnaie (celle du paiement) ; totaux en euros au taux comptable.
    const fx = await this.converter();
    const total = (statuses: string[]) => rows.filter((c) => statuses.includes(c.status)).reduce((sum, c) => sum + fx.to(c.commissionAmountCents, c.currency), 0);
    return {
      currency: fx.currency,
      totalPendingCents: total(["PENDING", "CONFIRMED", "AVAILABLE"]),
      totalPaidCents: total(["PAID"]),
      items: rows.map((c) => ({
        id: c.id,
        amountCents: c.commissionAmountCents,
        currency: c.currency,
        payoutAmountCents: c.payoutAmountCents,
        payoutCurrency: c.payoutCurrency,
        ratePercent: Number(c.commissionRatePercent),
        status: c.status,
        createdAt: c.createdAt,
        paidAt: c.paidAt,
        availableAt: c.availableAt,
        partner: c.partner,
        tenant: c.tenant,
        invoice: { id: c.invoice?.id ?? null, number: c.invoice?.number ?? "—", amountTotalCents: c.amountBaseCents, tenant: { name: c.tenant.name } },
      })),
    };
  }

  async payCommission(auth: AuthState, commissionId: string) {
    const comm = await this.prisma.client.partnerCommission.findUnique({
      where: { id: commissionId },
      include: { partner: true },
    });
    if (!comm) throw notFound("Commission introuvable");
    if (comm.status === "PAID") throw badRequest("already_paid", "Cette commission a déjà été versée.");

    // Versement dans la monnaie de versement du partenaire (taux figé si déjà disponible, sinon taux du jour).
    let amountCents = comm.payoutAmountCents;
    let currency = comm.payoutCurrency;
    if (amountCents === null || currency === null) {
      const converted = await this.pricing.convert(comm.commissionAmountCents, comm.currency, comm.partner.payoutCurrency);
      amountCents = converted?.cents ?? comm.commissionAmountCents;
      currency = converted ? comm.partner.payoutCurrency : comm.currency;
    }
    const payout = await this.prisma.client.partnerPayout.create({
      data: {
        partnerId: comm.partnerId,
        amountCents,
        currency,
        method: "Virement direct",
        status: "PAID",
        reference: `PAYOUT-${Date.now().toString().slice(-6)}`,
        approvedByUserId: auth.user.id,
      },
    });

    await this.prisma.client.partnerCommission.update({
      where: { id: comm.id },
      data: { status: "PAID", paidAt: new Date(), payoutId: payout.id, payoutAmountCents: amountCents, payoutCurrency: currency },
    });

    await this.prisma.client.financialAuditLog.create({
      data: {
        actorUserId: auth.user.id,
        actorEmail: auth.user.email,
        action: "partner.commission_paid",
        entityType: "partner_commission",
        entityId: comm.id,
        newValue: { payoutId: payout.id, amountCents, currency },
        reason: `Paiement commission à ${comm.partner.name}`,
      },
    });

    return payout;
  }

  /**
   * Parrainage & crédits.
   */
  /** Parrainages entre commerçants : liste et totaux du crédit (acquis, utilisé, disponible). */
  async referrals() {
    const items = await this.prisma.client.referralReward.findMany({
      include: {
        referrerTenant: { select: { id: true, name: true, slug: true } },
        referredTenant: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    const earned = items.filter((r) => r.status === "EARNED" || r.status === "EXPIRED" || (r.status === "CANCELLED" && r.creditAmountCents > 0));
    // Totaux en euros (taux comptable) ; chaque parrainage garde sa monnaie.
    const fx = await this.converter();
    return {
      items,
      currency: fx.currency,
      totalCreditCents: earned.reduce((sum, r) => sum + fx.to(r.creditAmountCents, r.currency), 0),
      usedCents: items.reduce((sum, r) => sum + fx.to(r.creditUsedCents, r.currency), 0),
      remainingCents: items.filter((r) => r.status === "EARNED").reduce((sum, r) => sum + fx.to(r.creditRemainingCents, r.currency), 0),
    };
  }

  /**
   * Trésorerie & Rapprochement bancaire.
   */
  async treasury() {
    const [payments, expenses, payouts, bankEntries] = await Promise.all([
      // Mêmes règles que la vue d'ensemble : paiements encaissés, y compris partiellement remboursés.
      this.prisma.client.payment.findMany({
        where: { status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED"] } },
        select: { amountCents: true, feeCents: true, amountRefundedCents: true, provider: true, currency: true },
      }),
      this.prisma.client.expense.findMany({ where: { status: "PAID" }, select: { amountCents: true, currency: true } }),
      this.prisma.client.partnerPayout.findMany({ where: { status: "PAID" }, select: { amountCents: true, currency: true } }),
      this.prisma.client.bankStatementEntry.findMany({ orderBy: { entryDate: "desc" } }),
    ]);

    // Net encaissé = brut − frais du prestataire − remboursements, converti en euros au taux comptable.
    const fx = await this.converter();
    const net = (p: (typeof payments)[number]) => fx.to(p.amountCents - p.feeCents - p.amountRefundedCents, p.currency);
    const totalCollectedNetCents = payments.reduce((s, p) => s + net(p), 0);
    const stripeHeldCents = payments.filter((p) => p.provider === "STRIPE").reduce((s, p) => s + net(p), 0);
    const manualDirectCents = payments.filter((p) => p.provider !== "STRIPE").reduce((s, p) => s + net(p), 0);

    const totalExpensesCents = expenses.reduce((s, e) => s + fx.to(e.amountCents, e.currency), 0);
    const totalPayoutsCents = payouts.reduce((s, p) => s + fx.to(p.amountCents, p.currency), 0);

    // Solde théorique estimé
    const estimatedCashCents = totalCollectedNetCents - totalExpensesCents - totalPayoutsCents;

    // Solde bancaire réel réconcilié
    const bankBalanceCents = bankEntries.reduce((s, b) => s + fx.to(b.amountCents, b.currency), 0);
    const unreconciledCount = bankEntries.filter((b) => !b.reconciled).length;

    return {
      // Totaux consolidés en euros (monnaie de référence) ; les lignes gardent leur monnaie.
      currency: fx.currency,
      missingRates: fx.missingRates(),
      totalCollectedNetCents,
      estimatedCashCents,
      stripeHeldCents,
      manualDirectCents,
      totalExpensesCents,
      totalPayoutsCents,
      bankBalanceCents,
      bankEntryCount: bankEntries.length,
      unreconciledCount,
      bankEntries: await this.withSuggestions(bankEntries.slice(0, 100)),
    };
  }

  /** Facture proposée pour chaque ligne non rapprochée : référence, commerce, montant attendu. */
  private async withSuggestions<T extends { suggestedType: string | null; suggestedId: string | null; reconciled: boolean }>(entries: T[]) {
    const ids = entries.filter((e) => !e.reconciled && e.suggestedType === "INVOICE" && e.suggestedId).map((e) => e.suggestedId!);
    const invoices = await this.prisma.client.invoice.findMany({ where: { id: { in: ids } }, include: { tenant: { select: { name: true } } } });
    return entries.map((e) => {
      const invoice = !e.reconciled && e.suggestedId ? invoices.find((i) => i.id === e.suggestedId) : undefined;
      return { ...e, suggestion: invoice ? { type: "INVOICE", reference: invoice.paymentReference, name: invoice.tenant.name, expectedCents: invoice.amountDueCents, currency: invoice.currency } : null };
    });
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

  /** Taux comptables (unités pour 1 €) : consolidation de la Finance et conversions des commissions. */
  async exchangeRates() {
    const rows = await this.prisma.client.exchangeRate.findMany({ orderBy: { currency: "asc" } });
    return rows.map((r) => ({ currency: r.currency, unitsPerEur: Number(r.unitsPerEur), updatedAt: r.updatedAt, updatedByEmail: r.updatedByEmail }));
  }

  async setExchangeRates(auth: AuthState, input: ExchangeRatesDto) {
    const before = await this.exchangeRates();
    for (const r of input.rates) {
      await this.prisma.client.exchangeRate.upsert({
        where: { currency: r.currency },
        update: { unitsPerEur: r.unitsPerEur, updatedByEmail: auth.user.email },
        create: { currency: r.currency, unitsPerEur: r.unitsPerEur, updatedByEmail: auth.user.email },
      });
    }
    await this.prisma.client.financialAuditLog.create({
      data: { actorUserId: auth.user.id, actorEmail: auth.user.email, action: "fx.rates_updated", entityType: "exchange_rate", entityId: "all", oldValue: before as never, newValue: input.rates as never },
    });
    return this.exchangeRates();
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
    return this.overview({ range: "custom", from: from.toISOString(), to: to.toISOString(), currency: "EUR" });
  }
}
