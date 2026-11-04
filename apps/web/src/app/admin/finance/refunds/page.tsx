"use client";

import { useQuery } from "@tanstack/react-query";
import { RotateCcw, AlertTriangle } from "lucide-react";
import { Badge, PageHeader, Panel } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { FinanceNav } from "@/components/admin/finance/finance-nav";
import { formatFinance } from "@/components/admin/finance/finance-utils";

interface PaymentRow {
  id: string;
  reference: string;
  amountCents: number;
  amountRefundedCents: number;
  currency: string;
  status: string;
  createdAt: string;
  tenant: {
    name: string;
  };
}

export default function RefundsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-finance-refunds"],
    queryFn: () =>
      api.get<{ items: PaymentRow[]; total: number }>(
        "/admin/finance/payments?range=all&status=REFUNDED"
      ),
  });

  const refunds = data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Remboursements & Contestations"
        description="Historique des remboursements accordés, contestations de paiement et rétrofacturations."
      />

      <FinanceNav />

      {isLoading ? (
        <div className="py-20 text-center text-sm text-ink-3">Chargement des remboursements...</div>
      ) : refunds.length === 0 ? (
        <Panel className="p-12 text-center text-sm text-ink-3">
          Aucun remboursement ou litige enregistré.
        </Panel>
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[750px] text-left text-sm">
            <thead className="border-b border-line bg-surface-2 text-xs text-ink-3">
              <tr>
                <th className="py-3 px-4 font-medium">Date</th>
                <th className="py-3 px-4 font-medium">Référence paiement</th>
                <th className="py-3 px-4 font-medium">Commerce</th>
                <th className="py-3 px-4 font-medium text-right">Montant initial</th>
                <th className="py-3 px-4 font-medium text-right">Montant remboursé</th>
                <th className="py-3 px-4 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {refunds.map((r) => (
                <tr key={r.id} className="hover:bg-surface-2 transition-colors">
                  <td className="py-3.5 px-4 text-xs text-ink-2">{formatDate(r.createdAt)}</td>
                  <td className="py-3.5 px-4 font-mono text-xs font-semibold text-ink">
                    {r.reference}
                  </td>
                  <td className="py-3.5 px-4 font-medium text-ink">{r.tenant.name}</td>
                  <td className="py-3.5 px-4 text-right font-mono text-xs text-ink-3">
                    {formatFinance(r.amountCents, r.currency)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-xs font-bold text-rose-500">
                    -{formatFinance(r.amountRefundedCents || r.amountCents, r.currency)}
                  </td>
                  <td className="py-3.5 px-4">
                    <Badge tone="danger">Remboursé</Badge>
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

