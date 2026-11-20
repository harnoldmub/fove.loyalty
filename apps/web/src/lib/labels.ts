"use client";

import { useTranslations } from "next-intl";
import { useCallback, useMemo } from "react";

/** Types d’opération du grand livre, dans l’ordre d’affichage des filtres. */
export const TRANSACTION_KINDS = ["EARN", "ADJUSTMENT", "REDEMPTION", "REDEMPTION_REVERSAL", "REVERSAL", "REFUND", "EXPIRATION"] as const;
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

const isKind = (kind: string): kind is TransactionKind => (TRANSACTION_KINDS as readonly string[]).includes(kind);

/** Libellé traduit d’un type d’opération (`common.kind.*`) ; un type inconnu est rendu tel quel. */
export function useKindLabel(): (kind: string) => string {
  const t = useTranslations("common.kind");
  return useCallback((kind: string) => (isKind(kind) ? t(kind) : kind), [t]);
}

export type ProgramMode = "POINTS" | "STAMPS";

export interface UnitLabel {
  /** Mot seul accordé au nombre (« points », « tampon ») : le nombre s’affiche à part. */
  (mode: ProgramMode, n?: number): string;
  /** Nombre formaté et unité (« 12 points », « 1 tampon »). */
  count: (mode: ProgramMode, n: number) => string;
}

/** Unité traduite d’un programme (`common.unit` / `common.unitCount`, pluriels ICU). */
export function useUnitLabel(): UnitLabel {
  const t = useTranslations("common");
  return useMemo(
    () =>
      Object.assign((mode: ProgramMode, n = 2) => t(`unit.${mode}`, { count: n }), {
        count: (mode: ProgramMode, n: number) => t(`unitCount.${mode}`, { count: n }),
      }),
    [t],
  );
}
