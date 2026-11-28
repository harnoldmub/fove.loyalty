"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { PageLoader } from "./page-loader";

/**
 * Attente des premières données d'une page (requête en cours) : la carte qui se tamponne, dans la zone
 * de contenu. Même délai d'apparition (0,4 s) que pendant un changement de page : rien ne clignote
 * quand les données arrivent vite.
 */
export function DataLoader({ className }: { className?: string }) {
  const t = useTranslations("common");
  return <PageLoader label={t("loading")} className={cn("min-h-[40dvh]", className)} />;
}
