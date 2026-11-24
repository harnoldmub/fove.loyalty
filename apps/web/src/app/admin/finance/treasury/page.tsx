"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Landmark, ArrowUpRight, ArrowDownRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { Badge, ErrorNote, PageHeader, Panel } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { FinanceNav } from "@/components/admin/finance/finance-nav";
import { formatFinance } from "@/components/admin/finance/finance-utils";

/** Réponse de GET /admin/finance/treasury (FinanceService.treasury). */
interface TreasuryResponse {
  currency: string;
  totalCollectedNetCents: number;
  estimatedCashCents: number;
  stripeHeldCents: number;
  manualDirectCents: number;
  totalExpensesCents: number;
  totalPayoutsCents: number;
  bankBalanceCents: number;
  bankEntryCount: number;
  unreconciledCount: number;
  bankEntries: {
    id: string;
    entryDate: string;
    label: string;
    amountCents: number;
    currency: string;
    reconciled: boolean;
    reconciledType: string | null;
  }[];
}

const RECONCILED_TYPES = ["PAYMENT", "EXPENSE", "PARTNER_PAYOUT"] as const;

export default function TreasuryPage() {
  const t = useTranslations("admin.finance.treasury");
  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["admin-finance-treasury"],
    queryFn: () => api.get<TreasuryResponse>("/admin/finance/treasury"),
  });

  const currency = data?.currency ?? "USD";
  const entries = data?.bankEntries ?? [];
  const cash = data?.estimatedCashCents ?? 0;
  const reconciledLabel = (type: string | null) =>
    type && (RECONCILED_TYPES as readonly string[]).includes(type) ? t(`reconciledTypes.${type as (typeof RECONCILED_TYPES)[number]}`) : (type ?? "—");

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <FinanceNav />

      {isError ? (
        <div className="mb-6 grid justify-items-start gap-3">
          <ErrorNote>{t("error")}</ErrorNote>
          <Button variant="secondary" size="sm" onClick={() => refetch()} loading={isRefetching}>
            {t("retry")}
          </Button>
        </div>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Panel className="border border-cobalt/40 p-4">
              <div className="flex items-center justify-between text-xs text-ink-3">
                <span>{t("cash")}</span>
                <Landmark className="size-4 text-cobalt" aria-hidden />
              </div>
              <div className={`mt-2 font-display text-2xl font-bold tabular ${cash >= 0 ? "text-mint" : "text-danger"}`}>
                {isLoading ? "…" : formatFinance(cash, currency)}
              </div>
              <p className="mt-1 text-xs text-ink-3">{t("cashHelp")}</p>
            </Panel>

            <Panel className="p-4">
              <div className="flex items-center justify-between text-xs text-ink-3">
                <span>{t("stripe")}</span>
                <CheckCircle2 className="size-4 text-mint" aria-hidden />
              </div>
              <div className="mt-2 font-display text-2xl font-bold tabular text-ink">
                {isLoading ? "…" : formatFinance(data?.stripeHeldCents, currency)}
              </div>
              <p className="mt-1 text-xs text-ink-3">{t("stripeHelp")}</p>
            </Panel>

            <Panel className="p-4">
              <div className="flex items-center justify-between text-xs text-ink-3">
                <span>{t("collected")}</span>
                <ArrowUpRight className="size-4 text-mint" aria-hidden />
              </div>
              <div className="mt-2 font-display text-2xl font-bold tabular text-ink">
                {isLoading ? "…" : formatFinance(data?.totalCollectedNetCents, currency)}
              </div>
              <p className="mt-1 text-xs text-ink-3">{t("collectedHelp")}</p>
            </Panel>

            <Panel className="p-4">
              <div className="flex items-center justify-between text-xs text-ink-3">
                <span>{t("spent")}</span>
                <ArrowDownRight className="size-4 text-danger" aria-hidden />
              </div>
              <div className="mt-2 font-display text-2xl font-bold tabular text-danger" dir="ltr">
                {isLoading ? "…" : `-${formatFinance((data?.totalExpensesCents ?? 0) + (data?.totalPayoutsCents ?? 0), currency)}`}
              </div>
              <p className="mt-1 text-xs text-ink-3">{t("spentHelp")}</p>
            </Panel>
          </div>

          <div className="mb-6 flex items-start gap-3 rounded-lg border border-line bg-surface-2 p-4 text-xs text-ink-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-cobalt" aria-hidden />
            <div>
              <strong className="text-ink">{t("noteTitle")}</strong>
              <p className="mt-0.5 text-ink-3">{t("noteBody")}</p>
              {data && data.bankEntryCount > 0 && (
                <p className="mt-2 font-medium text-ink-2">
                  {t("bankSummary", { balance: formatFinance(data.bankBalanceCents, currency), count: data.unreconciledCount })}
                </p>
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="py-20 text-center text-sm text-ink-3">{t("loading")}</div>
          ) : entries.length === 0 ? (
            <Panel className="p-12 text-center text-sm text-ink-3">{t("empty")}</Panel>
          ) : (
            <Panel className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-start text-sm">
                <thead className="border-b border-line bg-surface-2 text-xs text-ink-3">
                  <tr>
                    <th className="px-4 py-3 font-medium">{t("table.date")}</th>
                    <th className="px-4 py-3 font-medium">{t("table.label")}</th>
                    <th className="px-4 py-3 text-end font-medium">{t("table.amount")}</th>
                    <th className="px-4 py-3 font-medium">{t("table.status")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {entries.map((entry) => (
                    <tr key={entry.id} className="transition-colors hover:bg-surface-2">
                      <td className="px-4 py-3.5 text-xs text-ink-2">{formatDate(entry.entryDate)}</td>
                      <td className="px-4 py-3.5 text-xs font-medium text-ink">{entry.label}</td>
                      <td className={`px-4 py-3.5 text-end font-mono text-xs font-bold ${entry.amountCents >= 0 ? "text-mint" : "text-danger"}`} dir="ltr">
                        {formatFinance(entry.amountCents, entry.currency)}
                      </td>
                      <td className="px-4 py-3.5">
                        {entry.reconciled ? (
                          <Badge tone="mint">{t("reconciled", { type: reconciledLabel(entry.reconciledType) })}</Badge>
                        ) : (
                          <Badge tone="stamp">{t("unreconciled")}</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}
        </>
      )}
    </>
  );
}
