"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Badge, PageHeader, Panel } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { FinanceNav } from "@/components/admin/finance/finance-nav";
import { FinanceFilter, type PeriodKey } from "@/components/admin/finance/finance-filter";
import { formatFinance } from "@/components/admin/finance/finance-utils";
import { RefundModal } from "@/components/admin/finance/refund-modal";

interface PaymentRow {
  id: string;
  reference: string;
  provider: string;
  providerPaymentId: string | null;
  amountCents: number;
  amountRefundedCents: number;
  feeCents: number;
  netCents: number;
  currency: string;
  status: string;
  method: string | null;
  createdAt: string;
  confirmedAt: string | null;
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
  invoice: {
    id: string;
    number: string;
  } | null;
}

export default function PaymentsPage() {
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");
  const [provider, setProvider] = useState("ALL");
  const [refundTarget, setRefundTarget] = useState<PaymentRow | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-finance-payments", period, q, status, provider],
    queryFn: () =>
      api.get<{ items: PaymentRow[]; total: number }>(
        `/admin/finance/payments?range=${period}&q=${encodeURIComponent(q)}&status=${status}&provider=${provider}`
      ),
  });

  const payments = data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Flux des paiements & Transactions"
        description="Transactions directes des prestataires (Stripe, virements bancaires, règlements manuels validés)."
      />

      <FinanceNav />

      <div className="space-y-4 mb-6">
        <FinanceFilter period={period} onPeriodChange={setPeriod} />

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[260px] flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <Input
              type="search"
              placeholder="Rechercher par référence, n° Stripe, commerce..."
              className="pl-10"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="rounded-md border border-line bg-surface px-3 py-2 text-xs text-ink"
            >
              <option value="ALL">Tous les prestataires</option>
              <option value="STRIPE">Stripe</option>
              <option value="MANUAL">Contrat manuel</option>
              <option value="BANK_TRANSFER">Virement bancaire</option>
            </select>

            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-md border border-line bg-surface px-3 py-2 text-xs text-ink"
            >
              <option value="ALL">Tous les statuts</option>
              <option value="SUCCEEDED">Réussi (SUCCEEDED)</option>
              <option value="PENDING">En cours (PENDING)</option>
              <option value="FAILED">Échoué (FAILED)</option>
              <option value="REFUNDED">Remboursé (REFUNDED)</option>
            </select>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="py-20 text-center text-sm text-ink-3">Chargement des transactions...</div>
      ) : payments.length === 0 ? (
        <Panel className="p-12 text-center text-sm text-ink-3">
          Aucun flux de paiement trouvé pour les filtres actifs.
        </Panel>
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[950px] text-left text-sm">
            <thead className="border-b border-line bg-surface-2 text-xs text-ink-3">
              <tr>
                <th className="py-3 px-4 font-medium">Référence</th>
                <th className="py-3 px-4 font-medium">Date confirmation</th>
                <th className="py-3 px-4 font-medium">Commerce</th>
                <th className="py-3 px-4 font-medium">Prestataire & Méthode</th>
                <th className="py-3 px-4 font-medium text-right">Brut</th>
                <th className="py-3 px-4 font-medium text-right">Frais</th>
                <th className="py-3 px-4 font-medium text-right">Net FOVE</th>
                <th className="py-3 px-4 font-medium">Statut</th>
                <th className="py-3 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {payments.map((p) => {
                const canRefund =
                  (p.status === "SUCCEEDED" || p.status === "PARTIALLY_REFUNDED") &&
                  p.amountCents > p.amountRefundedCents;

                return (
                  <tr key={p.id} className="hover:bg-surface-2 transition-colors">
                    <td className="py-3.5 px-4 font-mono text-xs font-semibold text-ink">
                      <div>{p.reference}</div>
                      {p.providerPaymentId && (
                        <div className="text-[11px] text-ink-3 truncate max-w-[140px] font-normal">
                          {p.providerPaymentId}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-ink-2">
                      {formatDate(p.confirmedAt || p.createdAt, true)}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-medium text-ink">{p.tenant.name}</span>
                      {p.invoice && (
                        <div className="text-[11px] text-ink-3 font-mono">{p.invoice.number}</div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs">
                      <div className="font-medium text-ink">{p.provider}</div>
                      <div className="text-ink-3">{p.method ?? "carte bancaire"}</div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs font-semibold text-ink">
                      {formatFinance(p.amountCents, p.currency)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs text-rose-500">
                      -{formatFinance(p.feeCents, p.currency)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      {formatFinance(p.netCents, p.currency)}
                    </td>
                    <td className="py-3.5 px-4">
                      {p.status === "SUCCEEDED" ? (
                        <Badge tone="mint">Encaissé</Badge>
                      ) : p.status === "REFUNDED" ? (
                        <Badge tone="danger">Remboursé</Badge>
                      ) : p.status === "FAILED" ? (
                        <Badge tone="danger">Échoué</Badge>
                      ) : (
                        <Badge tone="neutral">{p.status}</Badge>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {canRefund ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setRefundTarget(p)}
                          className="h-8 gap-1 text-xs"
                        >
                          <RotateCcw className="size-3 text-amber-500" />
                          Rembourser
                        </Button>
                      ) : p.amountRefundedCents > 0 ? (
                        <span className="text-xs text-ink-3">
                          Remb. : {formatFinance(p.amountRefundedCents, p.currency)}
                        </span>
                      ) : (
                        <span className="text-xs text-ink-3">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      )}

      {refundTarget && (
        <RefundModal
          open={!!refundTarget}
          payment={{
            id: refundTarget.id,
            reference: refundTarget.reference,
            amountCents: refundTarget.amountCents,
            amountRefundedCents: refundTarget.amountRefundedCents,
            currency: refundTarget.currency,
            tenantName: refundTarget.tenant.name,
          }}
          onClose={() => setRefundTarget(null)}
          onRefunded={() => refetch()}
        />
      )}
    </>
  );
}

