"use client";

import { useState } from "react";
import { X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { useTranslations } from "next-intl";
import { api, useErrorMessage } from "@/lib/api";
import { formatFinance } from "./finance-utils";

interface RefundModalProps {
  open: boolean;
  payment: {
    id: string;
    reference: string;
    amountCents: number;
    amountRefundedCents: number;
    currency: string;
    tenantName?: string;
  } | null;
  onClose: () => void;
  onRefunded: () => void;
}

export function RefundModal({ open, payment, onClose, onRefunded }: RefundModalProps) {
  const t = useTranslations("admin.finance.refundModal");
  const errMsg = useErrorMessage();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [amountStr, setAmountStr] = useState("");
  const [reason, setReason] = useState("");

  if (!open || !payment) return null;

  const refundableCents = payment.amountCents - payment.amountRefundedCents;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    let amountCents: number | undefined;
    if (amountStr.trim()) {
      const parsed = Number.parseFloat(amountStr.replace(",", "."));
      if (Number.isNaN(parsed) || parsed <= 0) {
        setError(t("invalidAmount"));
        return;
      }
      amountCents = Math.round(parsed * 100);
      if (amountCents > refundableCents) {
        setError(t("tooHigh", { amount: formatFinance(refundableCents, payment.currency) }));
        return;
      }
    }

    if (!reason.trim()) {
      setError(t("reasonRequired"));
      return;
    }

    setLoading(true);
    try {
      await api.post(`/admin/finance/payments/${payment.id}/refund`, {
        amountCents,
        reason: reason.trim(),
      });
      onRefunded();
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
      <div className="relative w-full max-w-md rounded-xl border border-line bg-surface p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-amber-500/10 text-amber-500">
              <AlertTriangle className="size-4" />
            </span>
            <div>
              <h2 className="font-display text-base font-semibold text-ink">{t("title")}</h2>
              <p className="text-xs text-ink-3">{t("reference", { reference: payment.reference })}</p>
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

        <div className="mt-4 rounded-lg bg-surface-2 p-3 text-xs text-ink-2 space-y-1">
          <p>
            {t("customer")} <strong className="text-ink">{payment.tenantName ?? t("unknown")}</strong>
          </p>
          <p>
            {t("totalPaid")} <strong className="text-ink">{formatFinance(payment.amountCents, payment.currency)}</strong>
          </p>
          <p>
            {t("refundable")}{" "}
            <strong className="text-emerald-500">{formatFinance(refundableCents, payment.currency)}</strong>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-2">
              {t("amount")}
            </label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              max={(refundableCents / 100).toFixed(2)}
              placeholder={(refundableCents / 100).toFixed(2)}
              dir="ltr"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-2">{t("reason")}</label>
            <Input
              required
              placeholder={t("reasonPlaceholder")}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <div className="mt-6 flex justify-end gap-3 border-t border-line pt-4">
            <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
              {t("cancel")}
            </Button>
            <Button type="submit" variant="danger" disabled={loading}>
              {loading ? t("saving") : t("save")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

