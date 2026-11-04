"use client";

import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

export type PeriodKey = "today" | "yesterday" | "7d" | "30d" | "month" | "last_month" | "quarter" | "year" | "all";

interface FinanceFilterProps {
  period: PeriodKey;
  onPeriodChange: (p: PeriodKey) => void;
  currency?: string;
  onCurrencyChange?: (c: string) => void;
}

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "today", label: "Aujourd'hui" },
  { key: "yesterday", label: "Hier" },
  { key: "7d", label: "7 jours" },
  { key: "30d", label: "30 jours" },
  { key: "month", label: "Ce mois" },
  { key: "last_month", label: "Mois dernier" },
  { key: "quarter", label: "Ce trimestre" },
  { key: "year", label: "Cette année" },
  { key: "all", label: "Tout l'historique" },
];

export function FinanceFilter({ period, onPeriodChange, currency = "USD", onCurrencyChange }: FinanceFilterProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface p-2 shadow-xs">
      <div className="flex items-center gap-1.5 text-xs text-ink-3 px-2">
        <Calendar className="size-3.5 text-ink-3" />
        <span className="font-medium text-ink-2">Période :</span>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {PERIODS.map((p) => {
          const isSelected = period === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => onPeriodChange(p.key)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                isSelected
                  ? "bg-cobalt text-white shadow-xs"
                  : "text-ink-2 hover:bg-surface-2 hover:text-ink"
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {onCurrencyChange && (
        <div className="flex items-center gap-1 border-l border-line pl-2 text-xs">
          <span className="text-ink-3">Devise :</span>
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

