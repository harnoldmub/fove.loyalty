"use client";

import { useState } from "react";
import { X, Wallet, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { api } from "@/lib/api";
import { formatFinance } from "@/components/admin/finance/finance-utils";

interface PartnerPayoutModalProps {
  open: boolean;
  availableCents: number;
  thresholdCents: number;
  existingPayoutInfo: any;
  onClose: () => void;
  onRequested: () => void;
}

export function PartnerPayoutModal({
  open,
  availableCents,
  thresholdCents,
  existingPayoutInfo,
  onClose,
  onRequested,
}: PartnerPayoutModalProps) {
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
      setError(`Le montant minimum de retrait est de ${formatFinance(thresholdCents, "USD")}`);
      return;
    }

    if (requestedCents > availableCents) {
      setError(`Le montant demandé excède votre solde disponible (${formatFinance(availableCents, "USD")})`);
      return;
    }

    let payoutDetails: Record<string, any> = {};
    if (method === "BANK_TRANSFER") {
      if (!iban.trim() || !accountHolder.trim()) {
        setError("L'IBAN et le nom du titulaire du compte sont obligatoires");
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
        setError("Le numéro Mobile Money et le nom du titulaire sont obligatoires");
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
      setError(err?.message || "Impossible de soumettre la demande de retrait");
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
              <h2 className="font-display text-base font-semibold text-ink">Demander un virement</h2>
              <p className="text-xs text-ink-3">Disponible au retrait : {formatFinance(availableCents, "USD")}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
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
            <label className="mb-1 block text-xs font-medium text-ink-2">Montant du retrait (USD) *</label>
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
              Seuil minimum : {formatFinance(thresholdCents, "USD")}
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-2">Méthode de versement *</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMethod("BANK_TRANSFER")}
                className={`rounded-lg border p-3 text-left text-xs transition-colors ${
                  method === "BANK_TRANSFER"
                    ? "border-cobalt bg-cobalt/5 text-ink font-semibold"
                    : "border-line bg-surface text-ink-2 hover:bg-surface-2"
                }`}
              >
                Virement bancaire (IBAN / SWIFT)
              </button>
              <button
                type="button"
                onClick={() => setMethod("MOBILE_MONEY")}
                className={`rounded-lg border p-3 text-left text-xs transition-colors ${
                  method === "MOBILE_MONEY"
                    ? "border-cobalt bg-cobalt/5 text-ink font-semibold"
                    : "border-line bg-surface text-ink-2 hover:bg-surface-2"
                }`}
              >
                Mobile Money (Airtel, Orange, M-Pesa)
              </button>
            </div>
          </div>

          {method === "BANK_TRANSFER" ? (
            <div className="space-y-3 rounded-xl border border-line bg-surface-2 p-4">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-ink-2">Nom & Prénom du titulaire du compte *</label>
                <Input
                  required
                  placeholder="Ex : Arnold Mub"
                  value={accountHolder}
                  onChange={(e) => setAccountHolder(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-ink-2">IBAN / Numéro de compte *</label>
                  <Input
                    required
                    placeholder="FR76... ou compte bancaire"
                    value={iban}
                    onChange={(e) => setIban(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-ink-2">Code BIC / SWIFT (optionnel)</label>
                  <Input
                    placeholder="BNPAFRPP"
                    value={bic}
                    onChange={(e) => setBic(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-ink-2">Établissement bancaire</label>
                <Input
                  placeholder="Ex : Rawbank, EquityBCDC, BNP Paribas..."
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3 rounded-xl border border-line bg-surface-2 p-4">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-ink-2">Opérateur *</label>
                  <select
                    value={mobileProvider}
                    onChange={(e) => setMobileProvider(e.target.value)}
                    className="w-full rounded-md border border-line bg-surface px-3 py-2 text-xs text-ink"
                  >
                    <option value="AIRTEL_MONEY">Airtel Money</option>
                    <option value="ORANGE_MONEY">Orange Money</option>
                    <option value="M_PESA">M-Pesa (Vodacom)</option>
                    <option value="MTN_MOMO">MTN Mobile Money</option>
                    <option value="OTHER">Autre opérateur</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-ink-2">Numéro Mobile Money *</label>
                  <Input
                    required
                    placeholder="+243 89 000 0000"
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-ink-2">Nom officiel enregistré sur la ligne *</label>
                <Input
                  required
                  placeholder="Ex : Arnold Mub"
                  value={mobileHolder}
                  onChange={(e) => setMobileHolder(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
              Annuler
            </Button>
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? "Transmission..." : "Confirmer la demande de virement"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
