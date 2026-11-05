"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Download, ExternalLink, FileText, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Badge, PageHeader, Panel } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { FinanceNav } from "@/components/admin/finance/finance-nav";
import { FinanceFilter, type PeriodKey } from "@/components/admin/finance/finance-filter";
import { formatFinance } from "@/components/admin/finance/finance-utils";

interface SaleItem {
  id: string;
  number: string;
  createdAt: string;
  status: string;
  currency: string;
  amountSubtotalCents: number;
  amountTaxCents: number;
  amountDiscountCents: number;
  amountTotalCents: number;
  amountPaidCents: number;
  amountDueCents: number;
  pdfUrl: string | null;
  hostedInvoiceUrl: string | null;
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
  subscription: {
    id: string;
    plan: {
      name: string;
      code: string;
    };
  } | null;
  payments: {
    id: string;
    reference: string;
    provider: string;
    method: string | null;
    status: string;
    amountCents: number;
  }[];
  partner: {
    name: string;
    code: string;
    rate: number;
  } | null;
}

export default function SalesPage() {
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-finance-sales", period, q, status],
    queryFn: () =>
      api.get<{ items: SaleItem[]; total: number }>(
        `/admin/finance/sales?range=${period}&q=${encodeURIComponent(q)}&status=${status}`
      ),
  });

  const { data: detail } = useQuery({
    queryKey: ["admin-finance-sale-detail", selectedSaleId],
    queryFn: () => api.get<any>(`/admin/finance/sales/${selectedSaleId}`),
    enabled: !!selectedSaleId,
  });

  const sales = data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Journal des ventes & Facturation"
        description="Ensemble des ventes conclues, renouvellements, factures émises et encaissements liés."
      />

      <FinanceNav />

      <div className="space-y-4 mb-6">
        <FinanceFilter period={period} onPeriodChange={setPeriod} />

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[260px] flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <Input
              type="search"
              placeholder="Rechercher par commerce, n° facture, email..."
              className="pl-10"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-ink-3">Statut :</span>
            {(["ALL", "PAID", "OPEN", "VOID"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  status === s
                    ? "bg-cobalt text-white shadow-xs"
                    : "bg-surface border border-line text-ink-2 hover:bg-surface-2"
                }`}
              >
                {s === "ALL" ? "Tous" : s === "PAID" ? "Payées" : s === "OPEN" ? "En attente" : "Annulées"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="py-20 text-center text-sm text-ink-3">Chargement des ventes...</div>
      ) : sales.length === 0 ? (
        <Panel className="p-12 text-center text-sm text-ink-3">
          Aucune vente enregistrée pour les critères sélectionnés.
        </Panel>
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-line bg-surface-2 text-xs text-ink-3">
              <tr>
                <th className="py-3 px-4 font-medium">Réf. Facture</th>
                <th className="py-3 px-4 font-medium">Date</th>
                <th className="py-3 px-4 font-medium">Commerce</th>
                <th className="py-3 px-4 font-medium">Offre FOVE</th>
                <th className="py-3 px-4 font-medium text-right">Montant HT</th>
                <th className="py-3 px-4 font-medium text-right">TTC Payé</th>
                <th className="py-3 px-4 font-medium">Règlement</th>
                <th className="py-3 px-4 font-medium">Partenaire</th>
                <th className="py-3 px-4 font-medium">Statut</th>
                <th className="py-3 px-4 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sales.map((sale) => {
                const isPaid = sale.status === "PAID";
                const payment = sale.payments[0];

                return (
                  <tr
                    key={sale.id}
                    onClick={() => setSelectedSaleId(sale.id)}
                    className="cursor-pointer hover:bg-surface-2 transition-colors"
                  >
                    <td className="py-3.5 px-4 font-mono text-xs font-semibold text-ink">
                      {sale.number}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-ink-2">
                      {formatDate(sale.createdAt, true)}
                    </td>
                    <td className="py-3.5 px-4">
                      <Link
                        href={`/admin/tenants/${sale.tenant.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-medium text-ink hover:text-cobalt hover:underline block truncate"
                      >
                        {sale.tenant.name}
                      </Link>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="rounded bg-surface-2 px-2 py-0.5 text-xs font-medium text-ink-2">
                        {sale.subscription?.plan.name ?? "Sur-mesure"}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs text-ink-2">
                      {formatFinance(sale.amountSubtotalCents, sale.currency)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs font-bold text-ink">
                      {formatFinance(sale.amountPaidCents || sale.amountTotalCents, sale.currency)}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-ink-3">
                      {payment ? `${payment.provider} (${payment.method ?? "carte"})` : "—"}
                    </td>
                    <td className="py-3.5 px-4 text-xs">
                      {sale.partner ? (
                        <span className="text-cobalt font-medium">{sale.partner.name}</span>
                      ) : (
                        <span className="text-ink-3">Direct</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      {isPaid ? (
                        <Badge tone="mint">Réglée</Badge>
                      ) : sale.status === "OPEN" ? (
                        <Badge tone="stamp">En attente</Badge>
                      ) : (
                        <Badge tone="neutral">{sale.status}</Badge>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      {sale.pdfUrl || sale.hostedInvoiceUrl ? (
                        <a
                          href={sale.pdfUrl ?? sale.hostedInvoiceUrl!}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex size-8 items-center justify-center rounded-lg border border-line text-ink-3 hover:text-ink hover:bg-surface"
                          title="Voir la facture"
                        >
                          <ExternalLink className="size-3.5" />
                        </a>
                      ) : (
                        <span className="text-ink-3 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      )}

      {/* Drawer latéral de détail de vente */}
      {selectedSaleId && detail && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setSelectedSaleId(null)}
          />
          <div className="relative w-full max-w-md border-l border-line bg-surface p-6 shadow-2xl overflow-y-auto">
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div>
                <h3 className="font-display text-base font-semibold text-ink">Fiche de vente</h3>
                <p className="font-mono text-xs text-ink-3">{detail.number}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSaleId(null)}
                className="grid size-8 place-items-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-6 space-y-6">
              <div>
                <h4 className="text-xs font-semibold uppercase text-ink-3 mb-2">Commerce</h4>
                <div className="rounded-lg bg-surface-2 p-3 text-xs space-y-1">
                  <p className="font-bold text-ink">{detail.tenant?.name}</p>
                  <p className="text-ink-3">ID : {detail.tenant?.id}</p>
                  <p className="text-ink-3">Slug : {detail.tenant?.slug}</p>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold uppercase text-ink-3 mb-2">Décomposition financière</h4>
                <div className="rounded-lg border border-line p-3 text-xs space-y-2">
                  <div className="flex justify-between">
                    <span className="text-ink-3">Montant HT</span>
                    <span className="font-mono">{formatFinance(detail.amountSubtotalCents, detail.currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-3">Taxes & TVA</span>
                    <span className="font-mono">{formatFinance(detail.amountTaxCents, detail.currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-3">Remises / Crédits</span>
                    <span className="font-mono">-{formatFinance(detail.amountDiscountCents, detail.currency)}</span>
                  </div>
                  <div className="border-t border-line pt-2 flex justify-between font-bold text-ink">
                    <span>Total TTC facturé</span>
                    <span className="font-mono">{formatFinance(detail.amountTotalCents, detail.currency)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-bold">
                    <span>Montant réglé</span>
                    <span className="font-mono">{formatFinance(detail.amountPaidCents, detail.currency)}</span>
                  </div>
                </div>
              </div>

              {detail.payments && detail.payments.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase text-ink-3 mb-2">Transactions associées</h4>
                  <div className="space-y-2">
                    {detail.payments.map((p: any) => (
                      <div key={p.id} className="rounded-lg bg-surface-2 p-3 text-xs space-y-1">
                        <div className="flex justify-between font-mono font-semibold text-ink">
                          <span>{p.reference}</span>
                          <span>{formatFinance(p.amountCents, p.currency)}</span>
                        </div>
                        <p className="text-ink-3">
                          Prestataire : {p.provider} · Statut : <strong className="text-ink">{p.status}</strong>
                        </p>
                        <p className="text-ink-3">
                          Frais prélevés : {formatFinance(p.feeCents, p.currency)} · Net reçu :{" "}
                          <strong className="text-emerald-500">{formatFinance(p.netCents, p.currency)}</strong>
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(detail.pdfUrl || detail.hostedInvoiceUrl) && (
                <div className="pt-2">
                  <a
                    href={detail.pdfUrl ?? detail.hostedInvoiceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block w-full"
                  >
                    <Button variant="secondary" className="w-full gap-2">
                      <FileText className="size-4" />
                      Télécharger la facture originale
                    </Button>
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

