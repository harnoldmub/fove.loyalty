import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { useTranslations } from "next-intl";
import { INTL_LOCALE, isLocale } from "@/i18n/config";
import { cn } from "@/lib/utils";

/** Langue des formats : celle de la page, ou celle passée explicitement (serveur). */
function intlLocale(locale?: string) {
  const lang = locale ?? (typeof document !== "undefined" ? document.documentElement.lang : "fr");
  return INTL_LOCALE[isLocale(lang) ? lang : "fr"];
}

export function formatFinance(cents: number | null | undefined, currency = "EUR", locale?: string): string {
  const safeCents = typeof cents === "number" && !Number.isNaN(cents) ? cents : 0;
  const amount = safeCents / 100;
  const curr = (currency || "USD").toUpperCase();

  try {
    return new Intl.NumberFormat(intlLocale(locale), {
      style: "currency",
      currency: curr,
      minimumFractionDigits: safeCents % 100 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${curr}`;
  }
}

export function formatPct(val: number | null, locale?: string): string {
  if (val === null || Number.isNaN(val)) return "—";
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: "exceptZero",
  }).format(val / 100);
}

interface DeltaBadgeProps {
  value: number | null;
  invert?: boolean; // True for expenses (up is bad, down is good)
  className?: string;
}

export function DeltaBadge({ value, invert = false, className }: DeltaBadgeProps) {
  const t = useTranslations("admin.finance.common");
  if (value === null || Number.isNaN(value)) {
    return (
      <span className={cn("inline-flex items-center gap-0.5 text-xs text-ink-3", className)}>
        <Minus className="size-3" /> {t("notAvailable")}
      </span>
    );
  }

  const isPositive = value > 0;
  const isZero = value === 0;

  let isGood = isPositive;
  if (invert) isGood = !isPositive;

  if (isZero) {
    return (
      <span className={cn("inline-flex items-center gap-0.5 text-xs text-ink-3", className)}>
        <Minus className="size-3" /> {formatPct(0)}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-semibold tabular",
        isGood
          ? "bg-mint/10 text-emerald-600 dark:text-emerald-400"
          : "bg-danger/10 text-rose-600 dark:text-rose-400",
        className
      )}
    >
      {isPositive ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {formatPct(value)}
    </span>
  );
}

