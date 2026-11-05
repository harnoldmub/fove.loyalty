"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, FileText, Search } from "lucide-react";
import { Input } from "@/components/ui/field";
import { Badge, PageHeader, Panel } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { FinanceNav } from "@/components/admin/finance/finance-nav";
import { formatFinance } from "@/components/admin/finance/finance-utils";

interface InvoiceItem {
  id: string;
  number: string;
  createdAt: string;
  dueDate: string | null;
  paidAt: string | null;
  status: string;
  currency: string;
  amountSubtotalCents: number;
  amountTaxCents: number;
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
}

export default function InvoicesPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-finance-invoices", q, status],
    queryFn: () =>
      api.get<{ items: InvoiceItem[]; total: number }>(
        `/admin/finance/sales?range=all&q=${encodeURIComponent(q)}&status=${status}`
      ),
  });

  const invoices = data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Factures & Pièces comptables"
        description="Factures officielles émises aux commerçants et documents justificatifs téléchargeables."
      />

      <FinanceNav />

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <Input
            type="search"
            placeholder="Rechercher par numéro de facture, commerce..."
            className="pl-10"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-1.5 text-xs">
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
              {s === "ALL" ? "Toutes" : s === "PAID" ? "Payées" : s === "OPEN" ? "À régler" : "Annulées"}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="py-20 text-center text-sm text-ink-3">Chargement des factures...</div>
      ) : invoices.length === 0 ? (
        <Panel className="p-12 text-center text-sm text-ink-3">Aucune facture trouvée.</Panel>
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="border-b border-line bg-surface-2 text-xs text-ink-3">
              <tr>
                <th className="py-3 px-4 font-medium">Numéro</th>
                <th className="py-3 px-4 font-medium">Date d&apos;émission</th>
                <th className="py-3 px-4 font-medium">Client</th>
                <th className="py-3 px-4 font-medium text-right">Montant HT</th>
                <th className="py-3 px-4 font-medium text-right">TVA</th>
                <th className="py-3 px-4 font-medium text-right">Total TTC</th>
                <th className="py-3 px-4 font-medium">Statut</th>
                <th className="py-3 px-4 font-medium text-right">Document</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-surface-2 transition-colors">
                  <td className="py-3.5 px-4 font-mono text-xs font-bold text-ink">
                    {inv.number}
                  </td>
                  <td className="py-3.5 px-4 text-xs text-ink-2">
                    {formatDate(inv.createdAt)}
                  </td>
                  <td className="py-3.5 px-4 font-medium text-ink">
                    <Link
                      href={`/admin/tenants/${inv.tenant.id}`}
                      className="block truncate font-semibold text-ink hover:text-cobalt hover:underline"
                    >
                      {inv.tenant.name}
                    </Link>
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-xs text-ink-2">
                    {formatFinance(inv.amountSubtotalCents, inv.currency)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-xs text-ink-3">
                    {formatFinance(inv.amountTaxCents, inv.currency)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-xs font-bold text-ink">
                    {formatFinance(inv.amountTotalCents, inv.currency)}
                  </td>
                  <td className="py-3.5 px-4">
                    {inv.status === "PAID" ? (
                      <Badge tone="mint">Payée</Badge>
                    ) : inv.status === "OPEN" ? (
                      <Badge tone="stamp">En attente</Badge>
                    ) : (
                      <Badge tone="neutral">{inv.status}</Badge>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    {inv.pdfUrl || inv.hostedInvoiceUrl ? (
                      <a
                        href={inv.pdfUrl ?? inv.hostedInvoiceUrl!}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink-2 hover:bg-surface-2 hover:text-ink transition-colors"
                      >
                        <FileText className="size-3 text-cobalt" />
                        PDF
                        <ExternalLink className="size-3 text-ink-3" />
                      </a>
                    ) : (
                      <span className="text-xs text-ink-3">Généré système</span>
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

