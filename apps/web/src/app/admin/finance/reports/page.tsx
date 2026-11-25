"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { Printer, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, Panel } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { INTL_LOCALE, isLocale } from "@/i18n/config";
import { FinanceNav } from "@/components/admin/finance/finance-nav";
import { formatFinance } from "@/components/admin/finance/finance-utils";

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export default function AssociateReportsPage() {
  const t = useTranslations("admin.finance.reports");
  const locale = useLocale();
  const intl = INTL_LOCALE[isLocale(locale) ? locale : "fr"];
  const monthLabel = (m: number) => new Intl.DateTimeFormat(intl, { month: "long" }).format(new Date(2000, m - 1, 1));
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-finance-monthly-report", year, month],
    queryFn: () =>
      api.get<any>(`/admin/finance/reports/monthly?year=${year}&month=${month}`),
  });

  const cur = data?.current;
  const monthName = new Intl.DateTimeFormat(intl, { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <PageHeader
          title={t("title")}
          description={t("description")}
        />
        <Button onClick={handlePrint} className="gap-2" variant="primary">
          <Printer className="size-4" />
          {t("print")}
        </Button>
      </div>

      <div className="print:hidden">
        <FinanceNav />
      </div>

      {/* Sélecteur de période */}
      <div className="mb-6 flex items-center gap-3 rounded-lg border border-line bg-surface p-3 print:hidden">
        <span className="text-xs font-medium text-ink-2">{t("select")}</span>
        <select
          aria-label={t("month")}
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
          className="rounded-md border border-line bg-surface px-3 py-1.5 text-xs text-ink"
        >
          {MONTHS.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>

        <select
          aria-label={t("year")}
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="rounded-md border border-line bg-surface px-3 py-1.5 text-xs text-ink"
        >
          <option value={2025}>2025</option>
          <option value={2026}>2026</option>
          <option value={2027}>2027</option>
        </select>
      </div>

      {isLoading ? (
        <div className="py-20 text-center text-sm text-ink-3">{t("loading")}</div>
      ) : cur ? (
        <div className="space-y-6 print:space-y-4">
          {/* En-tête officiel du rapport imprimable */}
          <Panel className="p-8 border-line print:shadow-none print:border-none print:p-0">
            <div className="flex items-start justify-between border-b border-line pb-6">
              <div>
                <div className="text-2xl font-black font-display tracking-tight text-ink">FOVE DIGITAL</div>
                <div className="text-xs text-ink-3">{t("tagline")}</div>
                <div className="text-xs text-ink-3 font-mono mt-1" dir="ltr">https://fove.digital</div>
              </div>
              <div className="text-end">
                <div className="rounded bg-surface-2 px-2.5 py-1 text-xs font-bold text-ink inline-block">
                  {t("badge")}
                </div>
                <div className="mt-1 font-display text-lg font-bold text-ink first-letter:uppercase">
                  {monthName}
                </div>
                <div className="text-xs text-ink-3">{t("currency", { currency: data?.currency ?? "EUR" })}</div>
              </div>
            </div>

            {/* Tableau de Compte de Résultat Provisoire */}
            <div className="mt-6 space-y-4">
              <h3 className="font-display text-base font-bold text-ink">
                {t("statementTitle")}
              </h3>

              <div className="divide-y divide-line rounded-lg border border-line text-sm">
                {/* Ligne 1 : CA Facturé HT */}
                <div className="flex items-center justify-between p-3.5 bg-surface-2 font-medium">
                  <span className="text-ink">{t("lines.revenueHt")}</span>
                  <span className="font-mono text-ink font-bold">
                    {formatFinance(cur.revenueInvoicedHtCents, data?.currency)}
                  </span>
                </div>

                {/* Ligne 2 : Taxes */}
                <div className="flex items-center justify-between p-3 text-ink-2 text-xs">
                  <span className="ps-4">{t("lines.taxes")}</span>
                  <span className="font-mono">{formatFinance(cur.taxesCollectedCents, data?.currency)}</span>
                </div>

                {/* Ligne 3 : Total Facturé TTC */}
                <div className="flex items-center justify-between p-3.5 bg-surface font-semibold text-xs border-b border-line">
                  <span className="text-ink-2 ps-4">{t("lines.revenueTtc")}</span>
                  <span className="font-mono text-ink">{formatFinance(cur.revenueInvoicedCents, data?.currency)}</span>
                </div>

                {/* Ligne 4 : Encaissements Réels */}
                <div className="flex items-center justify-between p-3.5 bg-emerald-500/5 font-medium">
                  <span className="text-ink">{t("lines.gross")}</span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                    {formatFinance(cur.grossCollectedCents, data?.currency)}
                  </span>
                </div>

                {/* Ligne 5 : Frais Stripe */}
                <div className="flex items-center justify-between p-3 text-rose-500 text-xs">
                  <span className="ps-4">{t("lines.fees")}</span>
                  <span className="font-mono" dir="ltr">-{formatFinance(cur.providerFeesCents, data?.currency)}</span>
                </div>

                {/* Ligne 6 : Remboursements */}
                <div className="flex items-center justify-between p-3 text-rose-500 text-xs">
                  <span className="ps-4">{t("lines.refunds")}</span>
                  <span className="font-mono" dir="ltr">-{formatFinance(cur.refundedCents, data?.currency)}</span>
                </div>

                {/* Ligne 7 : Net Encaissé */}
                <div className="flex items-center justify-between p-3.5 bg-surface font-semibold">
                  <span className="text-ink">{t("lines.net")}</span>
                  <span className="font-mono text-ink font-bold">
                    {formatFinance(cur.netCollectedCents, data?.currency)}
                  </span>
                </div>

                {/* Ligne 8 : Charges d'exploitation */}
                <div className="flex items-center justify-between p-3.5 bg-rose-500/5 font-medium">
                  <span className="text-ink">{t("lines.expenses")}</span>
                  <span className="font-mono text-rose-500 font-bold" dir="ltr">
                    -{formatFinance(cur.operatingExpensesCents, data?.currency)}
                  </span>
                </div>

                {/* Ligne 9 : Commissions partenaires */}
                <div className="flex items-center justify-between p-3.5 text-rose-500 text-xs">
                  <span className="ps-4">{t("lines.commissions")}</span>
                  <span className="font-mono" dir="ltr">-{formatFinance(cur.partnerCommissionsCents, data?.currency)}</span>
                </div>

                {/* Ligne 10 : RÉSULTAT NET */}
                <div className="flex items-center justify-between p-4 bg-surface-2 font-bold text-base">
                  <span className="text-ink">{t("lines.result")}</span>
                  <span
                    className={`font-mono text-lg ${
                      cur.provisionalNetProfitCents >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {formatFinance(cur.provisionalNetProfitCents, data?.currency)}
                  </span>
                </div>
              </div>
            </div>

            {/* Métriques Saas du mois */}
            <div className="mt-8">
              <h4 className="font-display text-sm font-bold text-ink mb-3">
                {t("saasTitle")}
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div className="rounded-lg border border-line p-3">
                  <div className="text-ink-3">{t("mrr")}</div>
                  <div className="mt-1 font-mono text-base font-bold text-ink">
                    {formatFinance(cur.mrrCents, data?.currency)}
                  </div>
                </div>
                <div className="rounded-lg border border-line p-3">
                  <div className="text-ink-3">{t("arr")}</div>
                  <div className="mt-1 font-mono text-base font-bold text-ink">
                    {formatFinance(cur.arrCents, data?.currency)}
                  </div>
                </div>
                <div className="rounded-lg border border-line p-3">
                  <div className="text-ink-3">{t("activePaid")}</div>
                  <div className="mt-1 font-mono text-base font-bold text-ink">
                    {cur.activePaidSubscriptionsCount}
                  </div>
                </div>
                <div className="rounded-lg border border-line p-3">
                  <div className="text-ink-3">{t("newSubs")}</div>
                  <div className="mt-1 font-mono text-base font-bold text-emerald-500">
                    +{cur.newPaidSubscriptionsCount}
                  </div>
                </div>
              </div>
            </div>

            {/* Signatures & Certification */}
            <div className="mt-12 border-t border-line pt-6">
              <div className="flex items-center gap-2 text-xs text-ink-3">
                <ShieldCheck className="size-4 text-emerald-500" />
                <span>
                  {t("certified", { date: new Intl.DateTimeFormat(intl, { dateStyle: "long" }).format(new Date()) })}
                </span>
              </div>
              <div className="mt-8 grid grid-cols-2 gap-8 text-xs text-ink-3">
                <div className="border-t border-dashed border-line pt-2">
                  {t("signature")}
                </div>
                <div className="border-t border-dashed border-line pt-2 text-end">
                  {t("visa")}
                </div>
              </div>
            </div>
          </Panel>
        </div>
      ) : null}
    </>
  );
}

