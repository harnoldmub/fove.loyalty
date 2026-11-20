"use client";

import { useState } from "react";
import { X, Wallet, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { api } from "@/lib/api";
import { useLocale, useTranslations } from "next-intl";
import { formatPrice } from "@/lib/utils";

interface PartnerPayoutModalProps {
  open: boolean;
  availableCents: number;
  thresholdCents: number;
  existingPayoutInfo: any;
  onClose: () => void;
  onRequested: () => void;
}

const MOBILE_PROVIDERS = ["AIRTEL_MONEY", "ORANGE_MONEY", "M_PESA", "MTN_MOMO", "OTHER"] as const;

export function PartnerPayoutModal({
  open,
  availableCents,
  thresholdCents,
  existingPayoutInfo,
  onClose,
  onRequested,
}: PartnerPayoutModalProps) {
  const t = useTranslations("partner.payoutModal");
  const locale = useLocale();
  const money = (cents: number) => formatPrice(cents, "USD", locale);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [method, setMethod] = useState<"BANK_TRANSFER" | "MOBILE_MONEY">("BANK_TRANSFER");
  const [amountStr, setAmountStr] = useState((availableCents / 100).toFixed(2));

  // Coordonnées bancaires
  const [bankName, setBankName] = useState(existingPayoutInfo?.bankName || "");
  const [iban, setIban] = useState(existingPayoutInfo?.iban || "");
  const [bic, setBic] = useState(existingPayoutInfo?.bic || "");
  const [accountHolder, setAccountHolder] = useState(existingPayoutInfo?.accountHolder || "");

  // Mobile Money
  const [mobileProvider, setMobileProvider] = useState(existingPayoutInfo?.mobileProvider || "AIRTEL_MONEY");
  const [mobileNumber, setMobileNumber] = useState(existingPayoutInfo?.mobileNumber || "");
  const [mobileHolder, setMobileHolder] = useState(existingPayoutInfo?.mobileHolder || "");

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const amountFloat = Number.parseFloat(amountStr.replace(",", "."));
    const requestedCents = Math.round(amountFloat * 100);

    if (Number.isNaN(requestedCents) || requestedCents < thresholdCents) {
      setError(t("errors.minimum", { amount: money(thresholdCents) }));
      return;
    }

    if (requestedCents > availableCents) {
      setError(t("errors.exceeds", { amount: money(availableCents) }));
      return;
    }

    let payoutDetails: Record<string, any> = {};
    if (method === "BANK_TRANSFER") {
      if (!iban.trim() || !accountHolder.trim()) {
        setError(t("errors.bankRequired"));
        return;
      }
      payoutDetails = {
        type: "BANK_TRANSFER",
        bankName: bankName.trim(),
        iban: iban.trim().toUpperCase(),
        bic: bic.trim().toUpperCase(),
        accountHolder: accountHolder.trim(),
      };
    } else {
      if (!mobileNumber.trim() || !mobileHolder.trim()) {
        setError(t("errors.mobileRequired"));
        return;
      }
      payoutDetails = {
        type: "MOBILE_MONEY",
        mobileProvider,
        mobileNumber: mobileNumber.trim(),
        mobileHolder: mobileHolder.trim(),
      };
    }

    setLoading(true);
    try {
      await api.post("/partner/payouts/request", {
        amountCents: requestedCents,
        method,
        payoutDetails,
      });
      onRequested();
      onClose();
    } catch (err: any) {
      setError(err?.message || t("errors.generic"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-line bg-surface p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Wallet className="size-4" />
            </span>
            <div>
              <h2 className="font-display text-base font-semibold text-ink">{t("title")}</h2>
              <p className="text-xs text-ink-3">{t("available", { amount: money(availableCents) })}</p>
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
          <div className="mt-4 rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-xs font-medium text-rose-500">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-2">{t("amount")}</label>
            <Input
              required
              type="number"
              step="0.01"
              min={(thresholdCents / 100).toFixed(2)}
              max={(availableCents / 100).toFixed(2)}
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-ink-3">
              {t("threshold", { amount: money(thresholdCents) })}
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-2">{t("method")}</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMethod("BANK_TRANSFER")}
                className={`rounded-lg border p-3 text-start text-xs transition-colors ${
                  method === "BANK_TRANSFER"
                    ? "border-cobalt bg-cobalt/5 text-ink font-semibold"
                    : "border-line bg-surface text-ink-2 hover:bg-surface-2"
                }`}
              >
                {t("bankTransfer")}
              </button>
              <button
                type="button"
                onClick={() => setMethod("MOBILE_MONEY")}
                className={`rounded-lg border p-3 text-start text-xs transition-colors ${
                  method === "MOBILE_MONEY"
                    ? "border-cobalt bg-cobalt/5 text-ink font-semibold"
                    : "border-line bg-surface text-ink-2 hover:bg-surface-2"
                }`}
              >
                {t("mobileMoney")}
              </button>
            </div>
          </div>

          {method === "BANK_TRANSFER" ? (
            <div className="space-y-3 rounded-xl border border-line bg-surface-2 p-4">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-ink-2">{t("accountHolder")}</label>
                <Input
                  required
                  value={accountHolder}
                  onChange={(e) => setAccountHolder(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-ink-2">{t("iban")}</label>
                  <Input
                    required
                    value={iban}
                    onChange={(e) => setIban(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-ink-2">{t("bic")}</label>
                  <Input
                    value={bic}
                    onChange={(e) => setBic(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-ink-2">{t("bankName")}</label>
                <Input
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3 rounded-xl border border-line bg-surface-2 p-4">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-ink-2">{t("provider")}</label>
                  <select
                    value={mobileProvider}
                    onChange={(e) => setMobileProvider(e.target.value)}
                    className="w-full rounded-md border border-line bg-surface px-3 py-2 text-xs text-ink"
                  >
                    {MOBILE_PROVIDERS.map((provider) => (
                      <option key={provider} value={provider}>
                        {t(`providers.${provider}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-ink-2">{t("mobileNumber")}</label>
                  <Input
                    required
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-ink-2">{t("mobileHolder")}</label>
                <Input
                  required
                  value={mobileHolder}
                  onChange={(e) => setMobileHolder(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
              {t("cancel")}
            </Button>
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? t("submitting") : t("submit")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

