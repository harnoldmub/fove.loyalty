"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ArrowDownRight,
  ArrowUpRight,
  DollarSign,
  Download,
  Plus,
  RefreshCw,
  ShieldAlert,
  Users,
  Wallet,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, Panel } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { FinanceNav } from "@/components/admin/finance/finance-nav";
import { FinanceFilter, type PeriodKey } from "@/components/admin/finance/finance-filter";
import { FinanceCharts } from "@/components/admin/finance/finance-charts";
import { formatFinance, formatPct, DeltaBadge } from "@/components/admin/finance/finance-utils";
import { ExpenseModal } from "@/components/admin/finance/expense-modal";
import { PartnerModal } from "@/components/admin/finance/partner-modal";

interface FinanceOverviewResponse {
  currency: string;
  /** Monnaies sans taux comptable : comptées pour 0. */
  missingRates: string[];
  /** Encaissements de la période par monnaie, sans conversion. */
  collectedByCurrency: Record<string, { grossCents: number; netCents: number; count: number }>;
  period: { from: string; to: string; label: string };
  previousPeriod: { from: string; to: string; label: string };
  current: {
    revenueInvoicedCents: number;
    revenueInvoicedHtCents: number;
    taxesCollectedCents: number;
    grossCollectedCents: number;
    providerFeesCents: number;
    netCollectedCents: number;
    pendingCollectedCents: number;
    failedCollectedCents: number;
    refundedCents: number;
    operatingExpensesCents: number;
    partnerCommissionsCents: number;
    referralCreditsCents: number;
    provisionalNetProfitCents: number;
    mrrCents: number;
    arrCents: number;
    activePaidSubscriptionsCount: number;
    newPaidSubscriptionsCount: number;
    churnedSubscriptionsCount: number;
    churnRatePercent: number;
  };
  previous: any;
  deltas: {
    revenueInvoicedPct: number | null;
    grossCollectedPct: number | null;
    netCollectedPct: number | null;
    expensesPct: number | null;
    provisionalProfitPct: number | null;
    activePaidSubsPct: number | null;
  };
}

export default function FinanceOverviewPage() {
  const t = useTranslations("admin.finance.overview");
  const [period, setPeriod] = useState<PeriodKey>("month");
  // Monnaie du rapport : tous les montants y sont convertis au taux comptable (euro par défaut).
  const [currency, setCurrency] = useState("EUR");
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [partnerModalOpen, setPartnerModalOpen] = useState(false);

  const { data: overview, isLoading, refetch } = useQuery({
    queryKey: ["admin-finance-overview", period, currency],
    queryFn: () =>
      api.get<FinanceOverviewResponse>(
        `/admin/finance/overview?range=${period}&currency=${currency}`
      ),
  });

  const { data: chartData } = useQuery({
    queryKey: ["admin-finance-charts", period, currency],
    queryFn: () =>
      api.get<any>(`/admin/finance/charts?range=${period}&currency=${currency}`),
  });

  const cur = overview?.current;
  const deltas = overview?.deltas;

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title={t("title")}
          description={t("description")}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setExpenseModalOpen(true)}
            className="gap-1.5"
          >
            <Plus className="size-3.5 text-rose-500" />
            {t("addExpense")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPartnerModalOpen(true)}
            className="gap-1.5"
          >
            <Plus className="size-3.5 text-cobalt" />
            {t("newPartner")}
          </Button>
          <Link href="/admin/finance/reports">
            <Button size="sm" variant="primary" className="gap-1.5">
              <Download className="size-3.5" />
              {t("monthlyReport")}
            </Button>
          </Link>
        </div>
      </div>

      <FinanceNav />

      <div className="mb-6">
        <FinanceFilter
          period={period}
          onPeriodChange={setPeriod}
          currency={currency}
          onCurrencyChange={setCurrency}
        />
      </div>

      {isLoading ? (
        <div className="py-20 text-center text-sm text-ink-3">{t("loading")}</div>
      ) : cur ? (
        <div className="space-y-6">
          {/* Section 1 : Chiffre d'affaires & Encaissements bruts vs nets */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* CA Facturé */}
            <Panel className="p-4">
              <div className="flex items-center justify-between text-xs text-ink-3">
                <span>{t("revenue")}</span>
                <DeltaBadge value={deltas?.revenueInvoicedPct ?? null} />
              </div>
              <div className="mt-2 font-display text-2xl font-bold tabular text-ink">
                {formatFinance(cur.revenueInvoicedCents, currency)}
              </div>
              <p className="mt-1 text-xs text-ink-3">
                {t.rich("revenueDetail", {
                  net: formatFinance(cur.revenueInvoicedHtCents, currency),
                  taxes: formatFinance(cur.taxesCollectedCents, currency),
                  strong: (chunks) => <strong className="text-ink-2">{chunks}</strong>,
                })}
              </p>
            </Panel>

            {/* Brut Encaissé */}
            <Panel className="p-4">
              <div className="flex items-center justify-between text-xs text-ink-3">
                <span>{t("grossCollected")}</span>
                <DeltaBadge value={deltas?.grossCollectedPct ?? null} />
              </div>
              <div className="mt-2 font-display text-2xl font-bold tabular text-emerald-600 dark:text-emerald-400">
                {formatFinance(cur.grossCollectedCents, currency)}
              </div>
              <p className="mt-1 text-xs text-ink-3">
                {t("providerFees")}{" "}
                <span className="text-rose-500 font-medium" dir="ltr">-{formatFinance(cur.providerFeesCents, currency)}</span>
              </p>
            </Panel>

            {/* Net Reçu */}
            <Panel className="p-4">
              <div className="flex items-center justify-between text-xs text-ink-3">
                <span>{t("netCollected")}</span>
                <DeltaBadge value={deltas?.netCollectedPct ?? null} />
              </div>
              <div className="mt-2 font-display text-2xl font-bold tabular text-ink">
                {formatFinance(cur.netCollectedCents, currency)}
              </div>
              <p className="mt-1 text-xs text-ink-3">{t("netCollectedHelp")}</p>
            </Panel>

            {/* Résultat Provisoire */}
            <Panel className="p-4 border-cobalt/30 bg-surface">
              <div className="flex items-center justify-between text-xs text-ink-3">
                <span className="font-semibold text-ink">{t("netResult")}</span>
                <DeltaBadge value={deltas?.provisionalProfitPct ?? null} />
              </div>
              <div
                className={`mt-2 font-display text-2xl font-bold tabular ${
                  cur.provisionalNetProfitCents >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {formatFinance(cur.provisionalNetProfitCents, currency)}
              </div>
              <p className="mt-1 text-xs text-ink-3">
                {t("netResultHelp", { expenses: formatFinance(cur.operatingExpensesCents, currency) })}
              </p>
            </Panel>
          </div>

          {/* Section 2 : Indicateurs récurrents (MRR / ARR / Abonnements) */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Panel className="p-4">
              <div className="flex items-center justify-between text-xs text-ink-3">
                <span>{t("mrr")}</span>
                <RefreshCw className="size-3.5 text-cobalt" />
              </div>
              <div className="mt-2 font-display text-xl font-bold tabular text-ink">
                {formatFinance(cur.mrrCents, currency)}
                <span className="text-xs font-normal text-ink-3"> {t("perMonth")}</span>
              </div>
              <p className="mt-1 text-xs text-ink-3">{t("mrrHelp")}</p>
            </Panel>

            <Panel className="p-4">
              <div className="flex items-center justify-between text-xs text-ink-3">
                <span>{t("arr")}</span>
                <TrendingUp className="size-3.5 text-mint" />
              </div>
              <div className="mt-2 font-display text-xl font-bold tabular text-ink">
                {formatFinance(cur.arrCents, currency)}
                <span className="text-xs font-normal text-ink-3"> {t("perYear")}</span>
              </div>
              <p className="mt-1 text-xs text-ink-3">{t("arrHelp")}</p>
            </Panel>

            <Panel className="p-4">
              <div className="flex items-center justify-between text-xs text-ink-3">
                <span>{t("activePaid")}</span>
                <Users className="size-3.5 text-ink-3" />
              </div>
              <div className="mt-2 font-display text-xl font-bold tabular text-ink">
                {cur.activePaidSubscriptionsCount}
              </div>
              <p className="mt-1 text-xs text-ink-3">
                {t("activePaidHelp", { count: cur.newPaidSubscriptionsCount, churn: formatPct(cur.churnRatePercent).replace(/^\+/, "") })}
              </p>
            </Panel>

            <Panel className="p-4">
              <div className="flex items-center justify-between text-xs text-ink-3">
                <span>{t("costs")}</span>
                <ArrowDownRight className="size-3.5 text-rose-500" />
              </div>
              <div className="mt-2 font-display text-xl font-bold tabular text-rose-500">
                {formatFinance(cur.operatingExpensesCents + cur.partnerCommissionsCents, currency)}
              </div>
              <p className="mt-1 text-xs text-ink-3">
                {t("costsHelp", { amount: formatFinance(cur.partnerCommissionsCents, currency) })}
              </p>
            </Panel>
          </div>

          {/* Encaissements par monnaie, avant conversion */}
          {overview && Object.keys(overview.collectedByCurrency).length > 0 && (
            <Panel className="p-5">
              <h2 className="font-display text-base font-semibold">{t("byCurrency.title")}</h2>
              <p className="mt-0.5 text-xs text-ink-3">{t("byCurrency.help", { currency })}</p>
              <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                {Object.entries(overview.collectedByCurrency).map(([code, row]) => (
                  <li key={code} className="rounded-md bg-surface-2 px-3 py-2">
                    <span className="font-mono text-xs text-ink-3">{code}</span>
                    <p className="font-display text-lg font-semibold tabular-nums">{formatFinance(row.netCents, code)}</p>
                    <p className="text-xs text-ink-3">{t("byCurrency.count", { count: row.count })}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {overview && overview.missingRates.length > 0 && (
            <p className="rounded-md bg-stamp-soft px-4 py-3 text-sm text-stamp-ink">
              {t("missingRates", { currencies: overview.missingRates.join(", ") })}{" "}
              <Link href="/admin/finance/rates" className="font-medium underline underline-offset-4">{t("ratesLink")}</Link>
            </p>
          )}

          {/* Section 3 : Graphiques interactifs */}
          <FinanceCharts
            timeSeries={chartData?.timeSeries ?? []}
            planBreakdown={chartData?.planBreakdown ?? []}
            expenseBreakdown={chartData?.expenseBreakdown ?? []}
            currency={currency}
          />

          {/* Section 4 : Avertissement de transparence financière */}
          <div className="flex items-start gap-3 rounded-lg border border-line bg-surface-2 p-4 text-xs text-ink-2">
            <ShieldAlert className="size-4 shrink-0 text-amber-500 mt-0.5" />
            <div>
              <strong className="text-ink">{t("transparencyTitle")}</strong>
              <p className="mt-0.5 text-ink-3">{t("transparencyBody")}</p>
            </div>
          </div>
        </div>
      ) : null}

      <ExpenseModal
        open={expenseModalOpen}
        onClose={() => setExpenseModalOpen(false)}
        onCreated={() => refetch()}
      />

      <PartnerModal
        open={partnerModalOpen}
        onClose={() => setPartnerModalOpen(false)}
        onCreated={() => refetch()}
      />
    </>
  );
}

