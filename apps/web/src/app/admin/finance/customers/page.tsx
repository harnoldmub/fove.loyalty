"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Search, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/field";
import { Badge, PageHeader, Panel } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { FinanceNav } from "@/components/admin/finance/finance-nav";
import { formatFinance } from "@/components/admin/finance/finance-utils";

interface CustomerFinanceRow {
  tenantId?: string;
  id?: string;
  tenantName?: string;
  name?: string;
  tenantSlug?: string;
  slug?: string;
  city?: string | null;
  country?: string | null;
  createdAt?: string;
  planName?: string;
  plan?: string;
  planCode?: string;
  planKind?: string;
  provider?: string;
  contractPriceYearlyCents?: number | null;
  subscriptionStatus?: string;
  subStatus?: string;
  totalInvoicedCents?: number;
  totalCollectedCents?: number;
  totalPaidCents?: number;
  paymentsCount?: number;
  firstPaymentAt?: string | null;
  lastPaymentAt?: string | null;
  partnerName?: string | null;
}

export default function CustomersFinancePage() {
  const [q, setQ] = useState("");

  const { data = [], isLoading } = useQuery({
    queryKey: ["admin-finance-customers"],
    queryFn: () => api.get<CustomerFinanceRow[]>("/admin/finance/customers"),
  });

  const filtered = data.filter((c) => {
    if (!q) return true;
    const term = q.toLowerCase();
    const name = (c.tenantName || c.name || "").toLowerCase();
    const slug = (c.tenantSlug || c.slug || "").toLowerCase();
    const partner = (c.partnerName || "").toLowerCase();
    return name.includes(term) || slug.includes(term) || partner.includes(term);
  });

  return (
    <>
      <PageHeader
        title="Portefeuille clients & Valeur vie (LTV)"
        description="Fiches financières de chaque établissement : montants cumulés facturés, encaissés et fidélité."
      />

      <FinanceNav />

      <div className="mb-6 relative max-w-md">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
        <Input
          type="search"
          placeholder="Filtrer par nom du commerce, slug ou partenaire..."
          className="pl-10"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="py-20 text-center text-sm text-ink-3">Chargement des fiches clients...</div>
      ) : filtered.length === 0 ? (
        <Panel className="p-12 text-center text-sm text-ink-3">Aucun commerce trouvé.</Panel>
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[950px] text-left text-sm">
            <thead className="border-b border-line bg-surface-2 text-xs text-ink-3">
              <tr>
                <th className="py-3 px-4 font-medium">Entreprise cliente</th>
                <th className="py-3 px-4 font-medium">Offre active</th>
                <th className="py-3 px-4 font-medium text-right">Cumul facturé</th>
                <th className="py-3 px-4 font-medium text-right">Total encaissé (LTV)</th>
                <th className="py-3 px-4 font-medium text-center">Paiements</th>
                <th className="py-3 px-4 font-medium">1er paiement</th>
                <th className="py-3 px-4 font-medium">Dernière transaction</th>
                <th className="py-3 px-4 font-medium">Partenaire apporteur</th>
                <th className="py-3 px-4 font-medium text-right">Fiche</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((c) => {
                const id = c.tenantId || c.id || "";
                const name = c.tenantName || c.name || "Commerce";
                const slug = c.tenantSlug || c.slug || "—";
                const plan = c.planName || c.plan || "Gratuit";
                const invoiced = c.totalInvoicedCents ?? 0;
                const collected = c.totalCollectedCents ?? c.totalPaidCents ?? 0;
                const count = c.paymentsCount ?? 0;

                return (
                  <tr key={id} className="hover:bg-surface-2 transition-colors">
                    <td className="py-3.5 px-4 font-medium text-ink">
                      <div>{name}</div>
                      <div className="text-[11px] text-ink-3">{slug}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="inline-flex items-center gap-1.5 flex-wrap">
                        <span className="rounded bg-surface-2 px-2 py-0.5 text-xs font-semibold text-ink">
                          {plan}
                        </span>
                        {c.provider === "MANUAL" && (c.contractPriceYearlyCents === 0 || (!invoiced && !collected)) && (
                          <span className="rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-medium px-1.5 py-0.5">
                            Offert
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={`py-3.5 px-4 text-right font-mono text-xs ${
                      invoiced > 0 ? "text-ink-2" : "text-ink-3"
                    }`}>
                      {formatFinance(invoiced, "USD")}
                    </td>
                    <td className={`py-3.5 px-4 text-right font-mono text-xs font-bold ${
                      collected > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-ink-3 font-normal"
                    }`}>
                      {formatFinance(collected, "USD")}
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono text-xs text-ink-2">
                      {count}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-ink-3">
                      {c.firstPaymentAt ? formatDate(c.firstPaymentAt) : "—"}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-ink-2">
                      {c.lastPaymentAt ? formatDate(c.lastPaymentAt) : "—"}
                    </td>
                    <td className="py-3.5 px-4 text-xs">
                      {c.partnerName ? (
                        <span className="text-cobalt font-medium">{c.partnerName}</span>
                      ) : (
                        <span className="text-ink-3">Direct</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <Link
                        href={`/admin/tenants/${id}`}
                        className="inline-flex size-8 items-center justify-center rounded-lg border border-line text-ink-3 hover:text-ink hover:bg-surface"
                        title="Voir le commerce"
                      >
                        <ExternalLink className="size-3.5" />
                      </Link>
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

