"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { formatFinance } from "./finance-utils";

function formatShare(pct: number) {
  const lang = typeof document !== "undefined" ? document.documentElement.lang || "fr" : "fr";
  return new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits: 0 }).format(pct / 100);
}
import { cn } from "@/lib/utils";

interface TimeSeriesPoint {
  date: string;
  invoicedCents: number;
  collectedCents: number;
  expensesCents: number;
  netIncomeCents: number;
}

interface PlanBreakdownItem {
  label: string;
  amountCents: number;
}

interface ExpenseBreakdownItem {
  category: string;
  amountCents: number;
}

interface FinanceChartsProps {
  timeSeries: TimeSeriesPoint[];
  planBreakdown: PlanBreakdownItem[];
  expenseBreakdown: ExpenseBreakdownItem[];
  currency?: string;
}

export function FinanceCharts({
  timeSeries = [],
  planBreakdown = [],
  expenseBreakdown = [],
  currency = "USD",
}: FinanceChartsProps) {
  const t = useTranslations("admin.finance.charts");
  const tc = useTranslations("admin.finance.expenseCategories");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Échantillonnage si trop de jours pour éviter l'encombrement graphique
  const data = timeSeries.length > 60 ? timeSeries.filter((_, i) => i % Math.ceil(timeSeries.length / 45) === 0) : timeSeries;

  const maxVal = Math.max(
    ...data.map((d) => Math.max(d.collectedCents, d.expensesCents, d.invoicedCents, 100)),
    1000
  );

  const totalPlan = planBreakdown.reduce((s, p) => s + p.amountCents, 0);
  const totalExpense = expenseBreakdown.reduce((s, e) => s + e.amountCents, 0);

  const hoveredPoint = hoveredIndex !== null ? data[hoveredIndex] : null;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Graphique temporel principal (2 colonnes) */}
      <div className="rounded-xl border border-line bg-surface p-5 shadow-xs lg:col-span-2">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-base font-semibold text-ink">{t("timeTitle")}</h3>
            <p className="text-xs text-ink-3">{t("timeDescription")}</p>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium">
            <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <span className="size-2.5 rounded-full bg-emerald-500" /> {t("collected")}
            </span>
            <span className="flex items-center gap-1.5 text-rose-500">
              <span className="size-2.5 rounded-full bg-rose-500" /> {t("expenses")}
            </span>
            <span className="flex items-center gap-1.5 text-cobalt">
              <span className="size-2.5 rounded-full bg-cobalt" /> {t("invoiced")}
            </span>
          </div>
        </div>

        {/* Détail au survol */}
        <div className="mb-3 h-8 text-xs">
          {hoveredPoint ? (
            <div className="flex items-center gap-3 rounded-md bg-surface-2 px-3 py-1 text-ink">
              <span className="font-semibold text-ink-2">{hoveredPoint.date}</span>
              <span>
                {t("hoverCollected")} <strong className="text-emerald-500">{formatFinance(hoveredPoint.collectedCents, currency)}</strong>
              </span>
              <span>
                {t("hoverExpenses")} <strong className="text-rose-500">{formatFinance(hoveredPoint.expensesCents, currency)}</strong>
              </span>
              <span>
                {t("hoverNet")}{" "}
                <strong className={hoveredPoint.netIncomeCents >= 0 ? "text-emerald-500" : "text-rose-500"}>
                  {formatFinance(hoveredPoint.netIncomeCents, currency)}
                </strong>
              </span>
            </div>
          ) : (
            <span className="text-ink-3">{t("hoverHint")}</span>
          )}
        </div>

        {/* Visualisation SVG / CSS Bars */}
        <div className="relative flex h-48 items-end gap-1 border-b border-line pb-1">
          {data.length === 0 ? (
            <div className="grid h-full w-full place-items-center text-xs text-ink-3">
              {t("empty")}
            </div>
          ) : (
            data.map((point, idx) => {
              const colHeightPct = Math.min(100, Math.max(3, (point.collectedCents / maxVal) * 100));
              const expHeightPct = Math.min(100, Math.max(0, (point.expensesCents / maxVal) * 100));

              return (
                <div
                  key={point.date}
                  className="group relative flex h-full flex-1 cursor-pointer flex-col justify-end items-center"
                  onMouseEnter={() => setHoveredIndex(idx)}
                  onMouseLeave={() => setHoveredIndex(null)}
                >
                  <div className="flex w-full max-w-[14px] items-end justify-center gap-0.5 h-full">
                    {/* Barre Encaissement */}
                    <div
                      style={{ height: `${colHeightPct}%` }}
                      className={cn(
                        "w-full rounded-t transition-all",
                        hoveredIndex === idx ? "bg-emerald-400" : "bg-emerald-500/80"
                      )}
                    />
                    {/* Barre Dépense */}
                    {point.expensesCents > 0 && (
                      <div
                        style={{ height: `${expHeightPct}%` }}
                        className={cn(
                          "w-full rounded-t transition-all",
                          hoveredIndex === idx ? "bg-rose-400" : "bg-rose-500/80"
                        )}
                      />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Axe temporel */}
        {data.length > 0 && (
          <div className="mt-2 flex justify-between text-[11px] text-ink-3">
            <span>{data[0]?.date}</span>
            <span>{data[Math.floor(data.length / 2)]?.date}</span>
            <span>{data[data.length - 1]?.date}</span>
          </div>
        )}
      </div>

      {/* Répartition par Formule & Catégories */}
      <div className="grid gap-6">
        {/* Par Formule */}
        <div className="rounded-xl border border-line bg-surface p-5 shadow-xs">
          <h3 className="font-display text-sm font-semibold text-ink">{t("planTitle")}</h3>
          <p className="mb-3 text-xs text-ink-3">{t("planDescription")}</p>

          {planBreakdown.length === 0 ? (
            <p className="text-xs text-ink-3">{t("planEmpty")}</p>
          ) : (
            <div className="space-y-2.5">
              {planBreakdown.map((p) => {
                const pct = totalPlan > 0 ? (p.amountCents / totalPlan) * 100 : 0;
                return (
                  <div key={p.label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-ink">{p.label}</span>
                      <span className="text-ink-2 tabular">
                        {formatFinance(p.amountCents, currency)} ({formatShare(pct)})
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full bg-cobalt" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Par Catégorie de Dépense */}
        <div className="rounded-xl border border-line bg-surface p-5 shadow-xs">
          <h3 className="font-display text-sm font-semibold text-ink">{t("expenseTitle")}</h3>
          <p className="mb-3 text-xs text-ink-3">{t("expenseDescription")}</p>

          {expenseBreakdown.length === 0 ? (
            <p className="text-xs text-ink-3">{t("expenseEmpty")}</p>
          ) : (
            <div className="space-y-2">
              {expenseBreakdown.slice(0, 5).map((e) => {
                const pct = totalExpense > 0 ? (e.amountCents / totalExpense) * 100 : 0;
                return (
                  <div key={e.category} className="flex items-center justify-between text-xs">
                    <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-ink-2">
                      {tc.has(e.category) ? tc(e.category) : e.category}
                    </span>
                    <span className="font-medium text-ink tabular">
                      {formatFinance(e.amountCents, currency)}{" "}
                      <span className="text-ink-3 font-normal">({formatShare(pct)})</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

