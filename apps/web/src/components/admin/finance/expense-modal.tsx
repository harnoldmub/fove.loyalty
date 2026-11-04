"use client";

import { useState } from "react";
import { X, ArrowDownRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { api } from "@/lib/api";

interface ExpenseModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const CATEGORIES = [
  { value: "HOSTING", label: "Hébergement (Railway / Cloud)" },
  { value: "DATABASE", label: "Base de données (Neon Postgres)" },
  { value: "EMAILS", label: "Emails transactionnels (Resend / Brevo)" },
  { value: "DOMAINS", label: "Noms de domaine / DNS" },
  { value: "SAAS", label: "Outils & SaaS (GitHub, Sentry, Notion)" },
  { value: "MARKETING", label: "Marketing & Relations presse" },
  { value: "ADS", label: "Publicités (Meta, Google, TikTok)" },
  { value: "DEV", label: "Développement & Infrastructure" },
  { value: "FREELANCE", label: "Prestations freelance / Design" },
  { value: "BANK_FEES", label: "Frais bancaires & Tenue de compte" },
  { value: "LEGAL", label: "Comptabilité, Juridique & Avocat" },
  { value: "OFFICE", label: "Matériel & Bureautique" },
  { value: "OTHER", label: "Autres charges diverses" },
];

export function ExpenseModal({ open, onClose, onCreated }: ExpenseModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [supplier, setSupplier] = useState("");
  const [category, setCategory] = useState("HOSTING");
  const [amountStr, setAmountStr] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState("Carte bancaire");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringInterval, setRecurringInterval] = useState<"month" | "year">("month");
  const [proofUrl, setProofUrl] = useState("");

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const amountFloat = Number.parseFloat(amountStr.replace(",", "."));
    if (Number.isNaN(amountFloat) || amountFloat <= 0) {
      setError("Le montant doit être supérieur à zéro");
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
    } catch (err: any) {
      setError(err?.message || "Impossible d'enregistrer la dépense");
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
              <h2 className="font-display text-base font-semibold text-ink">Enregistrer une dépense</h2>
              <p className="text-xs text-ink-3">Ajout d&apos;une charge opérationnelle réelle</p>
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
          <div className="mt-4 rounded-lg bg-rose-500/10 p-3 text-xs font-medium text-rose-500">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-2">Libellé de la dépense *</label>
              <Input
                required
                placeholder="Ex : Hébergement serveur Railway"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-2">Fournisseur / Prestataire *</label>
              <Input
                required
                placeholder="Ex : Railway Inc."
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-ink-2">Poste de charge *</label>
              <select
                className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:border-cobalt"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-2">Devise</label>
              <select
                className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:border-cobalt"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="CDF">CDF (FC)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-2">Montant TTC *</label>
              <Input
                required
                type="number"
                step="0.01"
                min="0.01"
                placeholder="Ex : 49.00"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-2">Date d&apos;engagement *</label>
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
              <label className="mb-1 block text-xs font-medium text-ink-2">Moyen de règlement</label>
              <Input
                placeholder="Ex : CB Corporate, Virement"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-2">Lien justificatif / facture (optionnel)</label>
              <Input
                type="url"
                placeholder="https://drive.google.com/..."
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
              Charge récurrente (abonnement mensuel/annuel)
            </label>
            {isRecurring && (
              <select
                className="rounded border border-line bg-surface px-2 py-1 text-xs text-ink"
                value={recurringInterval}
                onChange={(e) => setRecurringInterval(e.target.value as "month" | "year")}
              >
                <option value="month">Mensuelle</option>
                <option value="year">Annuelle</option>
              </select>
            )}
          </div>

          <div className="mt-6 flex justify-end gap-3 border-t border-line pt-4">
            <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
              Annuler
            </Button>
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? "Enregistrement..." : "Valider la dépense"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

