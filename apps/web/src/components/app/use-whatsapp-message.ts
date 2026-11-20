"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";
import type { WhatsAppActionKind } from "@fove/shared";

interface WhatsAppValues {
  firstName: string;
  store: string;
  balance: number;
  /** Unité déjà accordée au solde (« points », « tampons »). */
  unit: string;
  mode: "POINTS" | "STAMPS";
  target?: number;
  cardUrl?: string | null;
}

/** Message WhatsApp pré-rédigé, dans la langue de l’interface (`app.whatsapp`). */
export function useWhatsAppMessage() {
  const t = useTranslations("app.whatsapp");
  return useCallback(
    (kind: WhatsAppActionKind, v: WhatsAppValues) => {
      const values = {
        name: v.firstName.trim() || t("defaultName"),
        store: v.store,
        balance: v.balance,
        unit: v.unit,
        mode: v.mode,
        remaining: Math.max(1, (v.target ?? 10) - v.balance),
      };
      const url = v.cardUrl?.trim();
      const card = url ? `\n\n${t("cardLine", { url })}` : "";
      return `${t(`messages.${kind}.intro`, values)}${card}\n\n${t(`messages.${kind}.outro`, values)}`;
    },
    [t],
  );
}
