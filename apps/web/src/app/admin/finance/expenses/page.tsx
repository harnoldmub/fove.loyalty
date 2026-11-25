"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { PageHeader, Panel } from "@/components/ui/misc";
import { api, useErrorMessage } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { FinanceNav } from "@/components/admin/finance/finance-nav";
import { FinanceFilter, type PeriodKey } from "@/components/admin/finance/finance-filter";
import { formatFinance } from "@/components/admin/finance/finance-utils";
import { EXPENSE_CATEGORIES, ExpenseModal } from "@/components/admin/finance/expense-modal";

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
  const t = useTranslations("admin.finance.expenses");
  const tc = useTranslations("admin.finance.expenseCategories");
  const errMsg = useErrorMessage();
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [category, setCategory] = useState("ALL");
  const [modalOpen, setModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-finance-expenses", period, category],
    queryFn: () =>
      api.get<{ items: ExpenseRow[]; totalCents: number; currency: string; count: number }>(
        `/admin/finance/expenses?range=${period}&category=${category}`
      ),
  });

  const expenses = data?.items ?? [];

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await api.delete(`/admin/finance/expenses/${id}`);
      refetch();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title={t("title")}
          description={t("description")}
        />
        <Button onClick={() => setModalOpen(true)} className="gap-2" variant="primary">
          <Plus className="size-4" />
          {t("add")}
        </Button>
      </div>

      <FinanceNav />

      <div className="space-y-4 mb-6">
        <FinanceFilter period={period} onPeriodChange={setPeriod} />

        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label htmlFor="expense-category" className="text-xs text-ink-3">{t("categoryLabel")}</label>
            <select
              id="expense-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-md border border-line bg-surface px-3 py-1.5 text-xs text-ink"
            >
              <option value="ALL">{t("allCategories")}</option>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {tc(c)}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-lg bg-surface-2 px-4 py-2 text-xs">
            {t("total")}{" "}
            <strong className="text-rose-500 font-mono text-sm ms-1">
              {formatFinance(data?.totalCents ?? 0, data?.currency)}
            </strong>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="py-20 text-center text-sm text-ink-3">{t("loading")}</div>
      ) : expenses.length === 0 ? (
        <Panel className="p-12 text-center text-sm text-ink-3">
          {t("empty")}
        </Panel>
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-start text-sm">
            <thead className="border-b border-line bg-surface-2 text-xs text-ink-3">
              <tr>
                <th className="py-3 px-4 font-medium">{t("table.date")}</th>
                <th className="py-3 px-4 font-medium">{t("table.label")}</th>
                <th className="py-3 px-4 font-medium">{t("table.supplier")}</th>
                <th className="py-3 px-4 font-medium">{t("table.category")}</th>
                <th className="py-3 px-4 font-medium text-end">{t("table.amount")}</th>
                <th className="py-3 px-4 font-medium">{t("table.payment")}</th>
                <th className="py-3 px-4 font-medium">{t("table.proof")}</th>
                <th className="py-3 px-4 font-medium text-end">{t("table.actions")}</th>
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
                        <span className="rounded bg-cobalt/10 px-1.5 py-0.5 text-[10px] font-semibold text-cobalt">
                          {exp.recurringInterval === "year" ? t("yearly") : t("monthly")}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-xs text-ink-2">{exp.supplier}</td>
                  <td className="py-3.5 px-4">
                    <span className="rounded bg-surface-2 px-2 py-0.5 text-xs text-ink-2">
                      {tc.has(exp.category) ? tc(exp.category) : exp.category}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-end font-mono text-xs font-bold text-rose-500" dir="ltr">
                    -{formatFinance(exp.amountCents, exp.currency)}
                  </td>
                  <td className="py-3.5 px-4 text-xs text-ink-3">
                    {exp.paymentMethod || "—"}
                  </td>
                  <td className="py-3.5 px-4 text-xs">
                    {exp.proofUrl ? (
                      <a
                        href={exp.proofUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-cobalt hover:underline"
                      >
                        {t("proofLink")}
                      </a>
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-end">
                    <ConfirmDialog
                      trigger={
                        <button
                          type="button"
                          disabled={deletingId === exp.id}
                          className="grid size-8 place-items-center rounded-lg text-ink-3 hover:text-rose-500 hover:bg-surface transition-colors"
                          aria-label={t("delete.button", { title: exp.title })}
                          title={t("delete.button", { title: exp.title })}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      }
                      title={t("delete.title", { title: exp.title })}
                      consequence={t("delete.consequence")}
                      confirmLabel={t("delete.confirm")}
                      destructive
                      onConfirm={() => handleDelete(exp.id)}
                    />
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

