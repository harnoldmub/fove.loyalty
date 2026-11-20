"use client";

import { useTranslations } from "next-intl";
import { useMarketingCurrency, type MarketingCurrency } from "@/lib/marketing-currency";
import { cn } from "@/lib/utils";

interface CurrencyToggleProps {
  className?: string;
  showLabel?: boolean;
}

export function CurrencyToggle({ className, showLabel = true }: CurrencyToggleProps) {
  const t = useTranslations("marketing.currencyToggle");
  const { currency, setCurrency } = useMarketingCurrency();

  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      {showLabel && (
        <span className="text-xs text-ink-3 hidden sm:inline">
          {t("label")}
        </span>
      )}
      <div
        role="group"
        aria-label={t("groupLabel")}
        className="inline-flex items-center rounded-full border border-line bg-surface p-0.5 shadow-xs"
      >
        <button
          type="button"
          onClick={() => setCurrency("USD")}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-semibold transition-all duration-200",
            currency === "USD"
              ? "bg-cobalt text-white shadow-xs"
              : "text-ink-2 hover:text-ink hover:bg-surface-2",
          )}
          aria-pressed={currency === "USD"}
        >
          $ USD
        </button>
        <button
          type="button"
          onClick={() => setCurrency("EUR")}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-semibold transition-all duration-200",
            currency === "EUR"
              ? "bg-cobalt text-white shadow-xs"
              : "text-ink-2 hover:text-ink hover:bg-surface-2",
          )}
          aria-pressed={currency === "EUR"}
        >
          € EUR
        </button>
      </div>
    </div>
  );
}
