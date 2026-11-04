"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ExternalLink, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, PageHeader, Panel } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { FinanceNav } from "@/components/admin/finance/finance-nav";
import { FinanceFilter, type PeriodKey } from "@/components/admin/finance/finance-filter";
import { formatFinance } from "@/components/admin/finance/finance-utils";
import { ExpenseModal } from "@/components/admin/finance/expense-modal";

interface ExpenseRow {
  id: string;
  title: string;
  supplier: string;
  category: string;
  amountCents: number;
  currency: string;
  taxCents: number;
  isRecurring: boolean;
  recurringInterval: string | null;
  status: string;
  paymentMethod: string | null;
  proofUrl: string | null;
  expenseDate: string;
  createdAt: string;
}

export default function ExpensesPage() {
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [category, setCategory] = useState("ALL");
  const [modalOpen, setModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-finance-expenses", period, category],
    queryFn: () =>
      api.get<{ items: ExpenseRow[]; totalCents: number; count: number }>(
        `/admin/finance/expenses?range=${period}&category=${category}`
      ),
  });

  const expenses = data?.items ?? [];

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Supprimer la dépense "${title}" ? Cette action sera tracée dans le journal d'audit.`)) {
      return;
    }
    setDeletingId(id);
    try {
      await api.delete(`/admin/finance/expenses/${id}`);
      refetch();
    } catch (err: any) {
      alert(err?.message || "Impossible de supprimer la charge");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="Dépenses d'exploitation & Charges"
          description="Enregistrement des coûts réels de FOVE : serveurs, base de données, domaines, outils SaaS et prestations."
        />
        <Button onClick={() => setModalOpen(true)} className="gap-2" variant="primary">
          <Plus className="size-4" />
          Enregistrer une charge
        </Button>
      </div>

      <FinanceNav />

      <div className="space-y-4 mb-6">
        <FinanceFilter period={period} onPeriodChange={setPeriod} />

        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-3">Poste :</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-md border border-line bg-surface px-3 py-1.5 text-xs text-ink"
            >
              <option value="ALL">Toutes les catégories</option>
              <option value="HOSTING">Hébergement (Railway / Cloud)</option>
              <option value="DATABASE">Base de données (Neon)</option>
              <option value="EMAILS">Emails transactionnels</option>
              <option value="DOMAINS">Noms de domaine</option>
              <option value="SAAS">Outils & SaaS</option>
              <option value="MARKETING">Marketing & Relations</option>
              <option value="ADS">Publicités</option>
              <option value="DEV">Développement</option>
              <option value="FREELANCE">Prestations freelance</option>
              <option value="BANK_FEES">Frais bancaires</option>
              <option value="LEGAL">Juridique & Comptabilité</option>
              <option value="OTHER">Autres</option>
            </select>
          </div>

          <div className="rounded-lg bg-surface-2 px-4 py-2 text-xs">
            Total des charges engagées sur la période :{" "}
            <strong className="text-rose-500 font-mono text-sm ml-1">
              {formatFinance(data?.totalCents ?? 0, "USD")}
            </strong>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="py-20 text-center text-sm text-ink-3">Chargement des dépenses...</div>
      ) : expenses.length === 0 ? (
        <Panel className="p-12 text-center text-sm text-ink-3">
          Aucune charge enregistrée pour cette sélection. Cliquez sur &quot;Enregistrer une charge&quot; pour en ajouter une.
        </Panel>
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-line bg-surface-2 text-xs text-ink-3">
              <tr>
                <th className="py-3 px-4 font-medium">Date</th>
                <th className="py-3 px-4 font-medium">Libellé</th>
                <th className="py-3 px-4 font-medium">Fournisseur</th>
                <th className="py-3 px-4 font-medium">Poste</th>
                <th className="py-3 px-4 font-medium text-right">Montant TTC</th>
                <th className="py-3 px-4 font-medium">Règlement</th>
                <th className="py-3 px-4 font-medium">Justificatif</th>
                <th className="py-3 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {expenses.map((exp) => (
                <tr key={exp.id} className="hover:bg-surface-2 transition-colors">
                  <td className="py-3.5 px-4 text-xs text-ink-2">
                    {formatDate(exp.expenseDate)}
                  </td>
                  <td className="py-3.5 px-4 font-medium text-ink">
                    <div className="flex items-center gap-1.5">
                      <span>{exp.title}</span>
                      {exp.isRecurring && (
                        <span className="rounded bg-cobalt/10 px-1.5 py-0.2 text-[10px] font-semibold text-cobalt">
                          {exp.recurringInterval === "year" ? "Annuel" : "Mensuel"}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-xs text-ink-2">{exp.supplier}</td>
                  <td className="py-3.5 px-4">
                    <span className="rounded bg-surface-2 px-2 py-0.5 text-xs font-mono text-ink-2">
                      {exp.category}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-xs font-bold text-rose-500">
                    -{formatFinance(exp.amountCents, exp.currency)}
                  </td>
                  <td className="py-3.5 px-4 text-xs text-ink-3">
                    {exp.paymentMethod ?? "Carte bancaire"}
                  </td>
                  <td className="py-3.5 px-4 text-xs">
                    {exp.proofUrl ? (
                      <a
                        href={exp.proofUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-cobalt hover:underline"
                      >
                        Pièce <ExternalLink className="size-3" />
                      </a>
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => handleDelete(exp.id, exp.title)}
                      disabled={deletingId === exp.id}
                      className="grid size-8 place-items-center rounded-lg text-ink-3 hover:text-rose-500 hover:bg-surface transition-colors"
                      title="Supprimer la dépense"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      <ExpenseModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={() => refetch()}
      />
    </>
  );
}

