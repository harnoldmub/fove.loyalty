"use client";

import { useQuery } from "@tanstack/react-query";
import { Gift, Users } from "lucide-react";
import { Badge, PageHeader, Panel } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { FinanceNav } from "@/components/admin/finance/finance-nav";
import { formatFinance } from "@/components/admin/finance/finance-utils";

interface ReferralItem {
  id: string;
  referrerTenant: {
    name: string;
  };
  referredTenant: {
    name: string;
  };
  creditAmountCents: number;
  status: string;
  appliedAt: string | null;
  createdAt: string;
}

export default function ReferralsFinancePage() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-finance-referrals"],
    queryFn: () =>
      api.get<{ items: ReferralItem[]; totalCreditCents: number }>("/admin/finance/referrals"),
  });

  const referrals = data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Parrainages & Crédits commerçants"
        description="Crédits accordés aux commerçants ambassadeurs lorsqu'ils parrainent d'autres établissements."
      />

      <FinanceNav />

      {/* KPI Card */}
      <div className="grid gap-4 sm:grid-cols-2 mb-6">
        <Panel className="p-4">
          <div className="flex items-center justify-between text-xs text-ink-3">
            <span>Total des crédits de parrainage accordés</span>
            <Gift className="size-4 text-cobalt" />
          </div>
          <div className="mt-2 font-display text-2xl font-bold tabular text-ink">
            {formatFinance(data?.totalCreditCents ?? 0, "USD")}
          </div>
          <p className="mt-1 text-xs text-ink-3">Déduits des factures d&apos;abonnements</p>
        </Panel>

        <Panel className="p-4">
          <div className="flex items-center justify-between text-xs text-ink-3">
            <span>Nombre de parrainages enregistrés</span>
            <Users className="size-4 text-mint" />
          </div>
          <div className="mt-2 font-display text-2xl font-bold tabular text-ink">
            {referrals.length}
          </div>
          <p className="mt-1 text-xs text-ink-3">Entreprises créées par recommandation</p>
        </Panel>
      </div>

      {isLoading ? (
        <div className="py-20 text-center text-sm text-ink-3">Chargement des parrainages...</div>
      ) : referrals.length === 0 ? (
        <Panel className="p-12 text-center text-sm text-ink-3">
          Aucun parrainage enregistré pour le moment.
        </Panel>
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[750px] text-left text-sm">
            <thead className="border-b border-line bg-surface-2 text-xs text-ink-3">
              <tr>
                <th className="py-3 px-4 font-medium">Date</th>
                <th className="py-3 px-4 font-medium">Commerçant Parrain</th>
                <th className="py-3 px-4 font-medium">Commerçant Filleul</th>
                <th className="py-3 px-4 font-medium text-right">Crédit accordé</th>
                <th className="py-3 px-4 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {referrals.map((r) => (
                <tr key={r.id} className="hover:bg-surface-2 transition-colors">
                  <td className="py-3.5 px-4 text-xs text-ink-2">{formatDate(r.createdAt)}</td>
                  <td className="py-3.5 px-4 font-semibold text-ink">{r.referrerTenant.name}</td>
                  <td className="py-3.5 px-4 font-medium text-ink-2">{r.referredTenant.name}</td>
                  <td className="py-3.5 px-4 text-right font-mono text-xs font-bold text-emerald-500">
                    {formatFinance(r.creditAmountCents, "USD")}
                  </td>
                  <td className="py-3.5 px-4">
                    {r.status === "APPLIED" ? (
                      <Badge tone="mint">Appliqué</Badge>
                    ) : (
                      <Badge tone="stamp">En attente</Badge>
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

