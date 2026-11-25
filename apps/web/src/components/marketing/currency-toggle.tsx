"use client";

import { useTranslations } from "next-intl";
import { MARKETING_CURRENCIES, useMarketingCurrency } from "@/lib/marketing-currency";
import { cn } from "@/lib/utils";

interface CurrencyToggleProps {
  className?: string;
  showLabel?: boolean;
}

const SYMBOL: Record<(typeof MARKETING_CURRENCIES)[number], string> = { EUR: "€", USD: "$", MAD: "DH", DZD: "DA", CDF: "FC" };

/** Monnaie des prix affichés : euro, dollar, dirham, dinar algérien, franc congolais. */
export function CurrencyToggle({ className, showLabel = true }: CurrencyToggleProps) {
  const t = useTranslations("marketing.currencyToggle");
  const { currency, setCurrency } = useMarketingCurrency();

  return (
    <div className={cn("inline-flex flex-wrap items-center gap-2", className)}>
      {showLabel && <span className="hidden text-xs text-ink-3 sm:inline">{t("label")}</span>}
      <div role="group" aria-label={t("groupLabel")} className="inline-flex flex-wrap items-center rounded-full border border-line bg-surface p-0.5 shadow-xs">
        {MARKETING_CURRENCIES.map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => setCurrency(code)}
            title={t(`names.${code}`)}
            aria-label={t(`names.${code}`)}
            aria-pressed={currency === code}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-semibold transition-all duration-200",
              currency === code ? "bg-cobalt text-white shadow-xs" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
            )}
          >
            <span aria-hidden>
              {SYMBOL[code]} {code}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
