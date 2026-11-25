"use client";

import { BILLING_CURRENCIES } from "@fove/shared";
import { useState } from "react";
import { X, ArrowDownRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { useTranslations } from "next-intl";
import { api, useErrorMessage } from "@/lib/api";

interface ExpenseModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export const EXPENSE_CATEGORIES = [
  "HOSTING",
  "DATABASE",
  "EMAILS",
  "DOMAINS",
  "SAAS",
  "MARKETING",
  "ADS",
  "DEV",
  "FREELANCE",
  "BANK_FEES",
  "LEGAL",
  "OFFICE",
  "OTHER",
] as const;

export function ExpenseModal({ open, onClose, onCreated }: ExpenseModalProps) {
  const t = useTranslations("admin.finance.expenseModal");
  const tc = useTranslations("admin.finance.expenseCategories");
  const errMsg = useErrorMessage();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [supplier, setSupplier] = useState("");
  const [category, setCategory] = useState("HOSTING");
  const [amountStr, setAmountStr] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringInterval, setRecurringInterval] = useState<"month" | "year">("month");
  const [proofUrl, setProofUrl] = useState("");

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const amountFloat = Number.parseFloat(amountStr.replace(",", "."));
    if (Number.isNaN(amountFloat) || amountFloat <= 0) {
      setError(t("invalidAmount"));
      return;
    }

    setLoading(true);
    try {
      await api.post("/admin/finance/expenses", {
        title: title.trim(),
        supplier: supplier.trim(),
        category,
        amountCents: Math.round(amountFloat * 100),
        currency,
        taxCents: 0,
        isRecurring,
        recurringInterval: isRecurring ? recurringInterval : undefined,
        status: "PAID",
        paymentMethod: paymentMethod.trim() || undefined,
        proofUrl: proofUrl.trim() || undefined,
        expenseDate,
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-xl border border-line bg-surface p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-rose-500/10 text-rose-500">
              <ArrowDownRight className="size-4" />
            </span>
            <div>
              <h2 className="font-display text-base font-semibold text-ink">{t("title")}</h2>
              <p className="text-xs text-ink-3">{t("description")}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="grid size-8 place-items-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-rose-500/10 p-3 text-xs font-medium text-rose-500">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-2">{t("label")}</label>
              <Input
                required
                placeholder={t("labelPlaceholder")}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-2">{t("supplier")}</label>
              <Input
                required
                placeholder={t("supplierPlaceholder")}
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-ink-2">{t("category")}</label>
              <select
                className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:border-cobalt"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {tc(c)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-2">{t("currency")}</label>
              <select
                className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:border-cobalt"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                {BILLING_CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-2">{t("amount")}</label>
              <Input
                required
                type="number"
                step="0.01"
                min="0.01"
                placeholder="49.00"
                dir="ltr"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-2">{t("date")}</label>
              <Input
                required
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-2">{t("paymentMethod")}</label>
              <Input
                placeholder={t("paymentMethodPlaceholder")}
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-2">{t("proof")}</label>
              <Input
                type="url"
                placeholder="https://drive.google.com/..."
                dir="ltr"
                value={proofUrl}
                onChange={(e) => setProofUrl(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-line bg-surface-2 p-3">
            <label className="flex items-center gap-2 text-xs font-medium text-ink cursor-pointer">
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
                className="rounded border-line"
              />
              {t("recurring")}
            </label>
            {isRecurring && (
              <select
                className="rounded border border-line bg-surface px-2 py-1 text-xs text-ink"
                value={recurringInterval}
                onChange={(e) => setRecurringInterval(e.target.value as "month" | "year")}
              >
                <option value="month">{t("monthly")}</option>
                <option value="year">{t("yearly")}</option>
              </select>
            )}
          </div>

          <div className="mt-6 flex justify-end gap-3 border-t border-line pt-4">
            <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
              {t("cancel")}
            </Button>
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? t("saving") : t("save")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

