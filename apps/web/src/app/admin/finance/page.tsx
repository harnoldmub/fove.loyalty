"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
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
import { formatFinance, DeltaBadge } from "@/components/admin/finance/finance-utils";
import { ExpenseModal } from "@/components/admin/finance/expense-modal";
import { PartnerModal } from "@/components/admin/finance/partner-modal";

interface FinanceOverviewResponse {
  currency: string;
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
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [currency, setCurrency] = useState("USD");
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
          title="Centre financier & Associés"
          description="Vision consolidée et transparente de l'activité économique réelle de FOVE."
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setExpenseModalOpen(true)}
            className="gap-1.5"
          >
            <Plus className="size-3.5 text-rose-500" />
            Ajouter dépense
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPartnerModalOpen(true)}
            className="gap-1.5"
          >
            <Plus className="size-3.5 text-cobalt" />
            Nouveau partenaire
          </Button>
          <Link href="/admin/finance/reports">
            <Button size="sm" variant="primary" className="gap-1.5">
              <Download className="size-3.5" />
              Rapport mensuel
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
        <div className="py-20 text-center text-sm text-ink-3">Chargement des données financières...</div>
      ) : cur ? (
        <div className="space-y-6">
          {/* Section 1 : Chiffre d'affaires & Encaissements bruts vs nets */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* CA Facturé */}
            <Panel className="p-4">
              <div className="flex items-center justify-between text-xs text-ink-3">
                <span>Chiffre d&apos;affaires TTC</span>
                <DeltaBadge value={deltas?.revenueInvoicedPct ?? null} />
              </div>
              <div className="mt-2 font-display text-2xl font-bold tabular text-ink">
                {formatFinance(cur.revenueInvoicedCents, currency)}
              </div>
              <p className="mt-1 text-xs text-ink-3">
                HT : <strong className="text-ink-2">{formatFinance(cur.revenueInvoicedHtCents, currency)}</strong> · Taxes :{" "}
                {formatFinance(cur.taxesCollectedCents, currency)}
              </p>
            </Panel>

            {/* Brut Encaissé */}
            <Panel className="p-4">
              <div className="flex items-center justify-between text-xs text-ink-3">
                <span>Brut réellement encaissé</span>
                <DeltaBadge value={deltas?.grossCollectedPct ?? null} />
              </div>
              <div className="mt-2 font-display text-2xl font-bold tabular text-emerald-600 dark:text-emerald-400">
                {formatFinance(cur.grossCollectedCents, currency)}
              </div>
              <p className="mt-1 text-xs text-ink-3">
                Frais Stripe/Banque :{" "}
                <span className="text-rose-500 font-medium">-{formatFinance(cur.providerFeesCents, currency)}</span>
              </p>
            </Panel>

            {/* Net Reçu */}
            <Panel className="p-4">
              <div className="flex items-center justify-between text-xs text-ink-3">
                <span>Net bancaire reçu</span>
                <DeltaBadge value={deltas?.netCollectedPct ?? null} />
              </div>
              <div className="mt-2 font-display text-2xl font-bold tabular text-ink">
                {formatFinance(cur.netCollectedCents, currency)}
              </div>
              <p className="mt-1 text-xs text-ink-3">Après déduction des frais de traitement</p>
            </Panel>

            {/* Résultat Provisoire */}
            <Panel className="p-4 border-cobalt/30 bg-surface">
              <div className="flex items-center justify-between text-xs text-ink-3">
                <span className="font-semibold text-ink">Résultat Net Réel</span>
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
                Net encaissé - charges ({formatFinance(cur.operatingExpensesCents, currency)}) - comm.
              </p>
            </Panel>
          </div>

          {/* Section 2 : Indicateurs récurrents (MRR / ARR / Abonnements) */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Panel className="p-4">
              <div className="flex items-center justify-between text-xs text-ink-3">
                <span>MRR Normalisé</span>
                <RefreshCw className="size-3.5 text-cobalt" />
              </div>
              <div className="mt-2 font-display text-xl font-bold tabular text-ink">
                {formatFinance(cur.mrrCents, currency)}
                <span className="text-xs font-normal text-ink-3"> /mois</span>
              </div>
              <p className="mt-1 text-xs text-ink-3">Base annuelle lissée sur 12 mois</p>
            </Panel>

            <Panel className="p-4">
              <div className="flex items-center justify-between text-xs text-ink-3">
                <span>ARR Normalisé</span>
                <TrendingUp className="size-3.5 text-mint" />
              </div>
              <div className="mt-2 font-display text-xl font-bold tabular text-ink">
                {formatFinance(cur.arrCents, currency)}
                <span className="text-xs font-normal text-ink-3"> /an</span>
              </div>
              <p className="mt-1 text-xs text-ink-3">Valeur annualisée du parc actif</p>
            </Panel>

            <Panel className="p-4">
              <div className="flex items-center justify-between text-xs text-ink-3">
                <span>Commerces payants actifs</span>
                <Users className="size-3.5 text-ink-3" />
              </div>
              <div className="mt-2 font-display text-xl font-bold tabular text-ink">
                {cur.activePaidSubscriptionsCount}
              </div>
              <p className="mt-1 text-xs text-ink-3">
                +{cur.newPaidSubscriptionsCount} nouveaux · Churn : {cur.churnRatePercent.toFixed(1)}%
              </p>
            </Panel>

            <Panel className="p-4">
              <div className="flex items-center justify-between text-xs text-ink-3">
                <span>Charges & Commissions</span>
                <ArrowDownRight className="size-3.5 text-rose-500" />
              </div>
              <div className="mt-2 font-display text-xl font-bold tabular text-rose-500">
                {formatFinance(cur.operatingExpensesCents + cur.partnerCommissionsCents, currency)}
              </div>
              <p className="mt-1 text-xs text-ink-3">
                Dont {formatFinance(cur.partnerCommissionsCents, currency)} de commissions
              </p>
            </Panel>
          </div>

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
              <strong className="text-ink">Garantie de transparence financière FOVE :</strong>
              <p className="mt-0.5 text-ink-3">
                Toutes les données ci-dessus sont calculées en temps réel à partir des transactions Stripe, contrats
                commerciaux validés, dépenses opérationnelles pointées et écritures du journal financier. Aucun chiffre
                n&apos;est simulé ni inventé. Le résultat net est qualifié de provisoire tant que l&apos;ensemble des
                charges du mois n&apos;est pas intégralement rapproché.
              </p>
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

