"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, TrendingUp, Users, Calendar } from "lucide-react";
import { Badge, PageHeader, Panel } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { FinanceNav } from "@/components/admin/finance/finance-nav";
import { formatFinance } from "@/components/admin/finance/finance-utils";

interface SubscriptionRow {
  id: string;
  status: string;
  provider: string;
  interval: "MONTH" | "YEAR";
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
  plan: {
    id: string;
    code: string;
    name: string;
    kind: string;
    priceYearlyCents: number;
    priceMonthlyCents: number;
    currency: string;
  };
  mrrCents: number;
  arrCents: number;
}

export default function SubscriptionsFinancePage() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-finance-subscriptions"],
    queryFn: () =>
      api.get<{
        items: SubscriptionRow[];
        mrrTotalCents: number;
        arrTotalCents: number;
        activeCount: number;
        trialingCount: number;
        payingCount: number;
      }>("/admin/finance/subscriptions"),
  });

  const subs = data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Parc d'abonnements & Revenus récurrents (MRR/ARR)"
        description="Gestion des contrats, renouvellements annuels, échéances et revenus lissés."
      />

      <FinanceNav />

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <Panel className="p-4">
          <div className="flex items-center justify-between text-xs text-ink-3">
            <span>MRR Consolidé</span>
            <RefreshCw className="size-3.5 text-cobalt" />
          </div>
          <div className="mt-2 font-display text-2xl font-bold tabular text-ink">
            {formatFinance(data?.mrrTotalCents ?? 0, "USD")}
            <span className="text-xs font-normal text-ink-3"> /mois</span>
          </div>
          <p className="mt-1 text-xs text-ink-3">Plans annuels divisés par 12</p>
        </Panel>

        <Panel className="p-4">
          <div className="flex items-center justify-between text-xs text-ink-3">
            <span>ARR Consolidé</span>
            <TrendingUp className="size-3.5 text-mint" />
          </div>
          <div className="mt-2 font-display text-2xl font-bold tabular text-ink">
            {formatFinance(data?.arrTotalCents ?? 0, "USD")}
            <span className="text-xs font-normal text-ink-3"> /an</span>
          </div>
          <p className="mt-1 text-xs text-ink-3">Revenus contractuels annualisés</p>
        </Panel>

        <Panel className="p-4">
          <div className="flex items-center justify-between text-xs text-ink-3">
            <span>Abonnements payants</span>
            <Users className="size-3.5 text-emerald-500" />
          </div>
          <div className="mt-2 font-display text-2xl font-bold tabular text-ink">
            {data?.payingCount ?? 0}
          </div>
          <p className="mt-1 text-xs text-ink-3">Sur {data?.activeCount ?? 0} contrats actifs</p>
        </Panel>

        <Panel className="p-4">
          <div className="flex items-center justify-between text-xs text-ink-3">
            <span>Périodes d&apos;essai en cours</span>
            <Calendar className="size-3.5 text-amber-500" />
          </div>
          <div className="mt-2 font-display text-2xl font-bold tabular text-ink">
            {data?.trialingCount ?? 0}
          </div>
          <p className="mt-1 text-xs text-ink-3">Potentiel de conversion payante</p>
        </Panel>
      </div>

      {isLoading ? (
        <div className="py-20 text-center text-sm text-ink-3">Chargement des abonnements...</div>
      ) : subs.length === 0 ? (
        <Panel className="p-12 text-center text-sm text-ink-3">Aucun abonnement trouvé.</Panel>
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-line bg-surface-2 text-xs text-ink-3">
              <tr>
                <th className="py-3 px-4 font-medium">Commerce</th>
                <th className="py-3 px-4 font-medium">Offre</th>
                <th className="py-3 px-4 font-medium">Facturation</th>
                <th className="py-3 px-4 font-medium text-right">Prix contractuel</th>
                <th className="py-3 px-4 font-medium text-right">MRR lissé</th>
                <th className="py-3 px-4 font-medium">Prochaine échéance</th>
                <th className="py-3 px-4 font-medium">Prestataire</th>
                <th className="py-3 px-4 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {subs.map((sub) => {
                const isPaidPlan = sub.plan.kind !== "FREE";
                const isAnnual = sub.interval === "YEAR";
                const priceCents = isAnnual ? sub.plan.priceYearlyCents : sub.plan.priceMonthlyCents;

                return (
                  <tr key={sub.id} className="hover:bg-surface-2 transition-colors">
                    <td className="py-3.5 px-4 font-medium text-ink">
                      <Link
                        href={`/admin/tenants/${sub.tenant.id}`}
                        className="block truncate font-semibold text-ink hover:text-cobalt hover:underline"
                      >
                        {sub.tenant.name}
                      </Link>
                      <div className="text-[11px] text-ink-3">{sub.tenant.slug}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="rounded bg-surface-2 px-2 py-0.5 text-xs font-semibold text-ink">
                        {sub.plan.name}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-ink-2">
                      {isAnnual ? "Annuelle (1 an)" : "Mensuelle"}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs font-semibold text-ink">
                      {isPaidPlan ? (
                        <>
                          {formatFinance(priceCents, sub.plan.currency)}
                          <span className="text-[11px] font-normal text-ink-3">
                            {isAnnual ? "/an" : "/mois"}
                          </span>
                        </>
                      ) : (
                        <span className="text-ink-3">Gratuit</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs font-bold text-cobalt">
                      {formatFinance(sub.mrrCents, "USD")}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-ink-2">
                      {sub.currentPeriodEnd ? (
                        <div>
                          <div>{formatDate(sub.currentPeriodEnd)}</div>
                          {sub.cancelAtPeriodEnd && (
                            <div className="text-[11px] text-rose-500">Arrêt programmé</div>
                          )}
                        </div>
                      ) : sub.trialEndsAt ? (
                        <div className="text-amber-500 font-medium">
                          Essai jusqu&apos;au {formatDate(sub.trialEndsAt)}
                        </div>
                      ) : (
                        <span className="text-ink-3">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-ink-3">
                      {sub.provider === "STRIPE" ? "Stripe" : sub.provider === "MANUAL" ? "Contrat direct" : sub.provider}
                    </td>
                    <td className="py-3.5 px-4">
                      {sub.status === "ACTIVE" ? (
                        <Badge tone="mint">Actif</Badge>
                      ) : sub.status === "TRIALING" ? (
                        <Badge tone="cobalt">Essai</Badge>
                      ) : sub.status === "PAST_DUE" ? (
                        <Badge tone="stamp">Impayé</Badge>
                      ) : sub.status === "CANCELED" ? (
                        <Badge tone="danger">Résilié</Badge>
                      ) : (
                        <Badge tone="neutral">{sub.status}</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      )}
    </>
  );
}

