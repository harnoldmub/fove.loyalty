"use client";

import { useQuery } from "@tanstack/react-query";
import { Landmark, ArrowUpRight, ArrowDownRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { Badge, PageHeader, Panel } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { FinanceNav } from "@/components/admin/finance/finance-nav";
import { formatFinance } from "@/components/admin/finance/finance-utils";

interface TreasuryResponse {
  currency: string;
  totalCollectedNetCents: number;
  totalExpensesCents: number;
  totalCommissionsPaidCents: number;
  cashBalanceCents: number;
  stripeAvailableCents: number;
  stripePendingCents: number;
  entries: {
    id: string;
    statementDate: string;
    reference: string;
    description: string;
    amountCents: number;
    currency: string;
    isReconciled: boolean;
    reconciledType: string | null;
  }[];
}

export default function TreasuryPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-finance-treasury"],
    queryFn: () => api.get<TreasuryResponse>("/admin/finance/treasury"),
  });

  const currency = data?.currency ?? "USD";

  return (
    <>
      <PageHeader
        title="Trésorerie & Rapprochement bancaire"
        description="Position de trésorerie nette disponible, soldes Stripe et contrôle des écritures."
      />

      <FinanceNav />

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <Panel className="p-4 border-cobalt/40">
          <div className="flex items-center justify-between text-xs text-ink-3">
            <span>Trésorerie Nette Disponible</span>
            <Landmark className="size-4 text-cobalt" />
          </div>
          <div
            className={`mt-2 font-display text-2xl font-bold tabular ${
              (data?.cashBalanceCents ?? 0) >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400"
            }`}
          >
            {formatFinance(data?.cashBalanceCents ?? 0, currency)}
          </div>
          <p className="mt-1 text-xs text-ink-3">Encaissements nets - charges payées</p>
        </Panel>

        <Panel className="p-4">
          <div className="flex items-center justify-between text-xs text-ink-3">
            <span>Solde Stripe estimé</span>
            <CheckCircle2 className="size-4 text-mint" />
          </div>
          <div className="mt-2 font-display text-2xl font-bold tabular text-ink">
            {formatFinance(data?.stripeAvailableCents ?? 0, currency)}
          </div>
          <p className="mt-1 text-xs text-ink-3">Disponible pour virement bancaire</p>
        </Panel>

        <Panel className="p-4">
          <div className="flex items-center justify-between text-xs text-ink-3">
            <span>Cumul Encaissements Nets</span>
            <ArrowUpRight className="size-4 text-emerald-500" />
          </div>
          <div className="mt-2 font-display text-2xl font-bold tabular text-ink">
            {formatFinance(data?.totalCollectedNetCents ?? 0, currency)}
          </div>
          <p className="mt-1 text-xs text-ink-3">Toutes sources confondues</p>
        </Panel>

        <Panel className="p-4">
          <div className="flex items-center justify-between text-xs text-ink-3">
            <span>Cumul Décaissements</span>
            <ArrowDownRight className="size-4 text-rose-500" />
          </div>
          <div className="mt-2 font-display text-2xl font-bold tabular text-rose-500">
            -{formatFinance((data?.totalExpensesCents ?? 0) + (data?.totalCommissionsPaidCents ?? 0), currency)}
          </div>
          <p className="mt-1 text-xs text-ink-3">Dépenses + commissions versées</p>
        </Panel>
      </div>

      {/* Note sur la traçabilité bancaire */}
      <div className="mb-6 flex items-start gap-3 rounded-lg border border-line bg-surface-2 p-4 text-xs text-ink-2">
        <ShieldCheck className="size-4 shrink-0 text-cobalt mt-0.5" />
        <div>
          <strong className="text-ink">Rapprochement bancaire strict :</strong>
          <p className="mt-0.5 text-ink-3">
            Les soldes de trésorerie sont confrontés aux relevés bancaires réels de FOVE. Chaque transaction Stripe ou
            contrat direct est reliée à un compte de résultat pour éviter toute divergence d&apos;encaisse.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="py-20 text-center text-sm text-ink-3">Chargement des positions de trésorerie...</div>
      ) : (data?.entries.length ?? 0) === 0 ? (
        <Panel className="p-12 text-center text-sm text-ink-3">
          Aucune écriture bancaire manuelle enregistrée. Le solde correspond aux flux automatisés Stripe et contrats.
        </Panel>
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="border-b border-line bg-surface-2 text-xs text-ink-3">
              <tr>
                <th className="py-3 px-4 font-medium">Date</th>
                <th className="py-3 px-4 font-medium">Référence</th>
                <th className="py-3 px-4 font-medium">Libellé bancaire</th>
                <th className="py-3 px-4 font-medium text-right">Montant</th>
                <th className="py-3 px-4 font-medium">État du rapprochement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data?.entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-surface-2 transition-colors">
                  <td className="py-3.5 px-4 text-xs text-ink-2">
                    {formatDate(entry.statementDate)}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-xs text-ink">
                    {entry.reference}
                  </td>
                  <td className="py-3.5 px-4 text-xs font-medium text-ink">
                    {entry.description}
                  </td>
                  <td
                    className={`py-3.5 px-4 text-right font-mono text-xs font-bold ${
                      entry.amountCents >= 0 ? "text-emerald-500" : "text-rose-500"
                    }`}
                  >
                    {formatFinance(entry.amountCents, entry.currency)}
                  </td>
                  <td className="py-3.5 px-4">
                    {entry.isReconciled ? (
                      <Badge tone="mint">Rapproché ({entry.reconciledType})</Badge>
                    ) : (
                      <Badge tone="stamp">À pointer</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </>
  );
}

