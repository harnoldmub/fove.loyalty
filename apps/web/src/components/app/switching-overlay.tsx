"use client";

import { LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";

/** Écran d'attente plein écran pendant le passage d'un commerce à un autre (rechargement complet de l'espace). */
export function SwitchingOverlay({ name }: { name: string }) {
  const t = useTranslations("common");
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[60] grid place-items-center bg-paper/85 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div className="grid justify-items-center gap-3 px-6 text-center">
        <LoaderCircle className="size-8 animate-spin text-cobalt motion-reduce:animate-none" aria-hidden />
        <p className="font-display text-lg font-semibold text-ink">{t("switchingBusiness", { name })}</p>
      </div>
    </div>
  );
}
