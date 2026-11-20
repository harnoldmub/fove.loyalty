"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { formatNumber } from "@/lib/utils";

/** Valeur d’une récompense traduite (« Cadeau », « 10 % de réduction », « 5 USD de réduction »). */
export function useRewardValueLabel() {
  const t = useTranslations("app.rewardValue");
  return useCallback(
    (reward: { kind: "GIFT" | "PERCENTAGE" | "FIXED"; value: string | null }, currency: string) => {
      if (reward.kind === "GIFT" || reward.value === null) return t("gift");
      const value = formatNumber(Number(reward.value));
      return reward.kind === "PERCENTAGE" ? t("percentage", { value }) : t("fixed", { value, currency });
    },
    [t],
  );
}
