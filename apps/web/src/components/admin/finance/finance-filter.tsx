"use client";

import { Calendar } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export type PeriodKey = "today" | "yesterday" | "7d" | "30d" | "month" | "last_month" | "quarter" | "year" | "all";

interface FinanceFilterProps {
  period: PeriodKey;
  onPeriodChange: (p: PeriodKey) => void;
  currency?: string;
  onCurrencyChange?: (c: string) => void;
}

const PERIODS: PeriodKey[] = ["today", "yesterday", "7d", "30d", "month", "last_month", "quarter", "year", "all"];

export function FinanceFilter({ period, onPeriodChange, currency = "USD", onCurrencyChange }: FinanceFilterProps) {
  const t = useTranslations("admin.finance.filter");
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface p-2 shadow-xs">
      <div className="flex items-center gap-1.5 text-xs text-ink-3 px-2">
        <Calendar className="size-3.5 text-ink-3" />
        <span className="font-medium text-ink-2">{t("period")}</span>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {PERIODS.map((key) => {
          const isSelected = period === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onPeriodChange(key)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                isSelected
                  ? "bg-cobalt text-white shadow-xs"
                  : "text-ink-2 hover:bg-surface-2 hover:text-ink"
              )}
            >
              {t(`periods.${key}`)}
            </button>
          );
        })}
      </div>

      {onCurrencyChange && (
        <div className="flex items-center gap-1 border-s border-line ps-2 text-xs">
          <span className="text-ink-3">{t("currency")}</span>
          {(["USD", "EUR", "CDF"] as const).map((curr) => (
            <button
              key={curr}
              type="button"
              onClick={() => onCurrencyChange(curr)}
              className={cn(
                "rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold transition-colors",
                currency === curr ? "bg-surface-2 text-ink border border-line" : "text-ink-3 hover:text-ink-2"
              )}
            >
              {curr}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

