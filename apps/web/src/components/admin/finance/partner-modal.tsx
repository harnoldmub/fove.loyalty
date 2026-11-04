"use client";

import { useState } from "react";
import { X, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { api } from "@/lib/api";

interface PartnerModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function PartnerModal({ open, onClose, onCreated }: PartnerModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [rateStr, setRateStr] = useState("20");

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const rateFloat = Number.parseFloat(rateStr);
    if (Number.isNaN(rateFloat) || rateFloat < 0 || rateFloat > 100) {
      setError("Le taux de commission doit être compris entre 0 et 100%");
      return;
    }

    setLoading(true);
    try {
      await api.post("/admin/finance/partners", {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        code: code.trim().toUpperCase(),
        phone: phone.trim() || undefined,
        company: company.trim() || undefined,
        commissionRatePercent: rateFloat,
      });
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err?.message || "Impossible d'enregistrer le partenaire");
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
            <span className="grid size-8 place-items-center rounded-lg bg-cobalt/10 text-cobalt">
              <WalletCards className="size-4" />
            </span>
            <div>
              <h2 className="font-display text-base font-semibold text-ink">Nouveau Partenaire FOVE</h2>
              <p className="text-xs text-ink-3">Enregistrer un apporteur d&apos;affaires ou prescripteur</p>
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
              <label className="mb-1 block text-xs font-medium text-ink-2">Nom complet / Contact *</label>
              <Input
                required
                placeholder="Ex : Arnold Kabasele"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-2">Email *</label>
              <Input
                required
                type="email"
                placeholder="partenaire@domaine.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-2">Code Partenaire unique *</label>
              <Input
                required
                placeholder="Ex : ARNOLD20"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-2">Taux de commission (%) *</label>
              <Input
                required
                type="number"
                min="0"
                max="100"
                step="0.5"
                placeholder="20"
                value={rateStr}
                onChange={(e) => setRateStr(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-2">Société / Agence (optionnel)</label>
              <Input
                placeholder="Ex : Dzyn Agency"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-2">Téléphone (optionnel)</label>
              <Input
                placeholder="+243 / +33 ..."
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3 border-t border-line pt-4">
            <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
              Annuler
            </Button>
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? "Création..." : "Enregistrer le partenaire"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

