"use client";

import { useState } from "react";
import { X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { api } from "@/lib/api";
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
        setError("Montant invalide");
        return;
      }
      amountCents = Math.round(parsed * 100);
      if (amountCents > refundableCents) {
        setError(`Le remboursement ne peut pas dépasser ${formatFinance(refundableCents, payment.currency)}`);
        return;
      }
    }

    if (!reason.trim()) {
      setError("Un motif de remboursement est obligatoire");
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
    } catch (err: any) {
      setError(err?.message || "Échec du remboursement");
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
              <h2 className="font-display text-base font-semibold text-ink">Émettre un remboursement</h2>
              <p className="text-xs text-ink-3">Réf: {payment.reference}</p>
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

        <div className="mt-4 rounded-lg bg-surface-2 p-3 text-xs text-ink-2 space-y-1">
          <p>
            Client : <strong className="text-ink">{payment.tenantName ?? "Inconnu"}</strong>
          </p>
          <p>
            Montant total payé : <strong className="text-ink">{formatFinance(payment.amountCents, payment.currency)}</strong>
          </p>
          <p>
            Disponible au remboursement :{" "}
            <strong className="text-emerald-500">{formatFinance(refundableCents, payment.currency)}</strong>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-2">
              Montant à rembourser (laisser vide pour remboursement total)
            </label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              max={(refundableCents / 100).toFixed(2)}
              placeholder={(refundableCents / 100).toFixed(2)}
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-2">Motif obligatoire (traçabilité audit) *</label>
            <Input
              required
              placeholder="Ex : Demande client, résiliation durant période d'essai..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <div className="mt-6 flex justify-end gap-3 border-t border-line pt-4">
            <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
              Annuler
            </Button>
            <Button type="submit" variant="danger" disabled={loading}>
              {loading ? "Traitement..." : "Confirmer le remboursement"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

