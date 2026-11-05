"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Plus, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, PageHeader, Panel } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { FinanceNav } from "@/components/admin/finance/finance-nav";
import { formatFinance } from "@/components/admin/finance/finance-utils";
import { PartnerModal } from "@/components/admin/finance/partner-modal";

interface PartnerRow {
  id: string;
  name: string;
  code: string;
  email: string;
  phone: string | null;
  company: string | null;
  commissionRatePercent: number;
  totalSalesCount: number;
  totalEarnedCents: number;
  pendingCents: number;
  paidCents: number;
}

interface CommissionRow {
  id: string;
  amountCents: number;
  ratePercent: number;
  status: string;
  createdAt: string;
  paidAt: string | null;
  partner: {
    id: string;
    name: string;
    code: string;
  };
  invoice: {
    id: string;
    number: string;
    amountTotalCents: number;
    tenant: {
      name: string;
    };
  } | null;
}

export default function CommissionsPage() {
  const [partnerModalOpen, setPartnerModalOpen] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);

  const { data: partnersData, refetch: refetchPartners, isLoading: loadingPartners } = useQuery({
    queryKey: ["admin-finance-partners"],
    queryFn: () => api.get<PartnerRow[]>("/admin/finance/partners"),
  });

  const { data: commissionsData, refetch: refetchCommissions, isLoading: loadingComms } = useQuery({
    queryKey: ["admin-finance-commissions"],
    queryFn: () =>
      api.get<{ items: CommissionRow[]; totalPendingCents: number; totalPaidCents: number }>(
        "/admin/finance/commissions"
      ),
  });

  const partners = partnersData ?? [];
  const commissions = commissionsData?.items ?? [];

  const handlePayCommission = async (id: string) => {
    setPayingId(id);
    try {
      await api.post(`/admin/finance/commissions/${id}/pay`);
      refetchPartners();
      refetchCommissions();
    } catch (err: any) {
      alert(err?.message || "Erreur lors du versement");
    } finally {
      setPayingId(null);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="Programme Partenaires FOVE & Commissions"
          description="Rémunération des apporteurs d'affaires, prescripteurs et agences partenaires."
        />
        <Button onClick={() => setPartnerModalOpen(true)} className="gap-2" variant="primary">
          <Plus className="size-4" />
          Nouveau partenaire
        </Button>
      </div>

      <FinanceNav />

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <Panel className="p-4">
          <div className="text-xs text-ink-3">Partenaires actifs</div>
          <div className="mt-1 font-display text-2xl font-bold tabular text-ink">
            {partners.length}
          </div>
          <p className="mt-1 text-xs text-ink-3">Réseau d&apos;apporteurs d&apos;affaires</p>
        </Panel>

        <Panel className="p-4">
          <div className="text-xs text-ink-3">Commissions en attente de versement</div>
          <div className="mt-1 font-display text-2xl font-bold tabular text-amber-500">
            {formatFinance(commissionsData?.totalPendingCents ?? 0, "USD")}
          </div>
          <p className="mt-1 text-xs text-ink-3">À verser aux partenaires</p>
        </Panel>

        <Panel className="p-4">
          <div className="text-xs text-ink-3">Commissions déjà reversées</div>
          <div className="mt-1 font-display text-2xl font-bold tabular text-emerald-600 dark:text-emerald-400">
            {formatFinance(commissionsData?.totalPaidCents ?? 0, "USD")}
          </div>
          <p className="mt-1 text-xs text-ink-3">Total historique distribué</p>
        </Panel>
      </div>

      {/* Tableau 1 : Liste des Partenaires */}
      <div className="mb-8 space-y-3">
        <h3 className="font-display text-base font-semibold text-ink">Partenaires enregistrés</h3>
        {loadingPartners ? (
          <div className="py-10 text-center text-sm text-ink-3">Chargement...</div>
        ) : partners.length === 0 ? (
          <Panel className="p-8 text-center text-sm text-ink-3">
            Aucun partenaire enregistré. Cliquez sur &quot;Nouveau partenaire&quot; pour démarrer le programme.
          </Panel>
        ) : (
          <Panel className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="border-b border-line bg-surface-2 text-xs text-ink-3">
                <tr>
                  <th className="py-3 px-4 font-medium">Partenaire</th>
                  <th className="py-3 px-4 font-medium">Code Promo / Tracking</th>
                  <th className="py-3 px-4 font-medium text-center">Taux</th>
                  <th className="py-3 px-4 font-medium text-center">Ventes apportées</th>
                  <th className="py-3 px-4 font-medium text-right">Total gagné</th>
                  <th className="py-3 px-4 font-medium text-right">En attente</th>
                  <th className="py-3 px-4 font-medium text-right">Déjà versé</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {partners.map((p) => (
                  <tr key={p.id} className="hover:bg-surface-2 transition-colors">
                    <td className="py-3.5 px-4">
                      <Link
                        href={`/admin/partners?q=${encodeURIComponent(p.code)}`}
                        className="block truncate font-semibold text-ink hover:text-cobalt hover:underline"
                      >
                        {p.name}
                      </Link>
                      <div className="text-xs text-ink-3">{p.email}</div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs font-bold text-cobalt">
                      {p.code}
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono text-xs text-ink-2">
                      {p.commissionRatePercent}%
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono text-xs font-bold text-ink">
                      {p.totalSalesCount}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs font-semibold text-ink">
                      {formatFinance(p.totalEarnedCents, "USD")}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs font-bold text-amber-500">
                      {formatFinance(p.pendingCents, "USD")}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs text-emerald-600 dark:text-emerald-400">
                      {formatFinance(p.paidCents, "USD")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )}
      </div>

      {/* Tableau 2 : Historique des Commissions */}
      <div className="space-y-3">
        <h3 className="font-display text-base font-semibold text-ink">Journal des commissions</h3>
        {loadingComms ? (
          <div className="py-10 text-center text-sm text-ink-3">Chargement...</div>
        ) : commissions.length === 0 ? (
          <Panel className="p-8 text-center text-sm text-ink-3">
            Aucune commission générée pour l&apos;instant.
          </Panel>
        ) : (
          <Panel className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="border-b border-line bg-surface-2 text-xs text-ink-3">
                <tr>
                  <th className="py-3 px-4 font-medium">Date</th>
                  <th className="py-3 px-4 font-medium">Partenaire</th>
                  <th className="py-3 px-4 font-medium">Facture / Commerce</th>
                  <th className="py-3 px-4 font-medium text-right">Montant Vente</th>
                  <th className="py-3 px-4 font-medium text-right">Commission Due</th>
                  <th className="py-3 px-4 font-medium">Statut</th>
                  <th className="py-3 px-4 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {commissions.map((c) => {
                  const isPending = c.status === "PENDING";
                  return (
                    <tr key={c.id} className="hover:bg-surface-2 transition-colors">
                      <td className="py-3.5 px-4 text-xs text-ink-2">{formatDate(c.createdAt)}</td>
                      <td className="py-3.5 px-4 font-medium text-ink">
                        {c.partner.name} ({c.partner.code})
                      </td>
                      <td className="py-3.5 px-4 text-xs">
                        <div className="font-semibold text-ink">{c.invoice?.tenant.name ?? "—"}</div>
                        <div className="font-mono text-ink-3">{c.invoice?.number}</div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-xs text-ink-2">
                        {formatFinance(c.invoice?.amountTotalCents ?? 0, "USD")}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-xs font-bold text-amber-500">
                        {formatFinance(c.amountCents, "USD")} ({c.ratePercent}%)
                      </td>
                      <td className="py-3.5 px-4">
                        {c.status === "PAID" ? (
                          <Badge tone="mint">Versée</Badge>
                        ) : (
                          <Badge tone="stamp">En attente</Badge>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {isPending ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handlePayCommission(c.id)}
                            disabled={payingId === c.id}
                            className="h-8 gap-1.5 text-xs"
                          >
                            <CheckCircle2 className="size-3.5" />
                            {payingId === c.id ? "Validation..." : "Marquer payée"}
                          </Button>
                        ) : (
                          <span className="text-xs text-ink-3">
                            Versée le {c.paidAt ? formatDate(c.paidAt) : "—"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>
        )}
      </div>

      <PartnerModal
        open={partnerModalOpen}
        onClose={() => setPartnerModalOpen(false)}
        onCreated={() => {
          refetchPartners();
          refetchCommissions();
        }}
      />
    </>
  );
}

