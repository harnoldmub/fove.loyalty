"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Undo2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api";
import { cn, formatDate, formatNumber, KIND_LABEL, newIdempotencyKey } from "@/lib/utils";
import { useCan } from "./me-context";
import type { Transaction } from "./types";

/** Historique immuable : une erreur se corrige par une annulation, jamais en effaçant. */
export function TransactionList({ items, showCustomer = false, reversedIds }: { items: Transaction[]; showCustomer?: boolean; reversedIds?: Set<string> }) {
  const canReverse = useCan("transactions.reverse");
  const qc = useQueryClient();
  const reversed = reversedIds ?? new Set(items.map((t) => t.reversesId).filter(Boolean) as string[]);

  return (
    <ul className="divide-y divide-line">
      {items.map((t) => {
        const reversible = canReverse && (t.kind === "EARN" || t.kind === "ADJUSTMENT") && !reversed.has(t.id) && t.delta !== 0;
        return (
          <li key={t.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {KIND_LABEL[t.kind] ?? t.kind}
                {showCustomer && t.account && <span className="font-normal text-ink-2"> · {t.account.customer.firstName} {t.account.customer.lastName}</span>}
              </p>
              <p className="truncate text-sm text-ink-3">
                {formatDate(t.createdAt, true)}
                {t.amount && ` · ${formatNumber(Number(t.amount))} ${t.currency ?? ""}`}
                {t.saleReference && ` · ${t.saleReference}`}
                {t.reason && ` · ${t.reason}`}
                {reversed.has(t.id) && " · annulé"}
              </p>
            </div>
            <span className={cn("tabular font-display text-lg font-semibold", t.delta > 0 ? "text-mint" : t.delta < 0 ? "text-ink" : "text-ink-3")}>
              {t.delta > 0 ? "+" : ""}
              {formatNumber(t.delta)}
            </span>
            {reversible && (
              <ConfirmDialog
                trigger={
                  <Button variant="ghost" size="icon" aria-label="Annuler cette opération">
                    <Undo2 />
                  </Button>
                }
                title="Annuler cette opération ?"
                consequence={`${formatNumber(t.delta)} seront retirés du solde par une écriture d’annulation. L’opération d’origine reste visible dans l’historique.`}
                confirmLabel="Annuler l’opération"
                destructive
                onConfirm={async () => {
                  try {
                    await api.post(`/app/transactions/${t.id}/reverse`, { reason: "Annulation depuis le tableau de bord", idempotencyKey: newIdempotencyKey("rev") });
                    toast.success("Opération annulée");
                    qc.invalidateQueries();
                  } catch (e) {
                    toast.error(errorMessage(e));
                  }
                }}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
