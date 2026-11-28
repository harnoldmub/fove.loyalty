"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Landmark, ArrowUpRight, ArrowDownRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { Badge, ErrorNote, PageHeader, Panel } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";
import { BILLING_CURRENCIES } from "@fove/shared";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { api, useErrorMessage } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { FinanceNav } from "@/components/admin/finance/finance-nav";
import { formatFinance } from "@/components/admin/finance/finance-utils";
import { DataLoader } from "@/components/navigation/data-loader";

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
    amountMismatch: boolean;
    /** Pièce proposée d'après la référence trouvée dans le libellé. */
    suggestion: { type: "INVOICE"; reference: string; name: string; expectedCents: number; currency: string } | null;
  }[];
}

const RECONCILED_TYPES = ["PAYMENT", "EXPENSE", "PARTNER_PAYOUT"] as const;

/** Import d'un relevé CSV et saisie d'une ligne (références FV-… détectées automatiquement). */
function BankImport({ onDone }: { onDone: () => void }) {
  const t = useTranslations("admin.finance.treasury.import");
  const errMsg = useErrorMessage();
  const [currency, setCurrency] = useState<string>("EUR");
  const [busy, setBusy] = useState(false);
  const [entry, setEntry] = useState({ entryDate: new Date().toISOString().slice(0, 10), label: "", amount: "" });

  const importFile = async (file: File) => {
    setBusy(true);
    try {
      const res = await api.post<{ imported: number; duplicates: number; matched: number; skipped: number[] }>("/admin/finance/treasury/import", { csv: await file.text(), currency });
      toast.success(t("done", { imported: res.imported, matched: res.matched, duplicates: res.duplicates, skipped: res.skipped.length }));
      onDone();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const addEntry = async () => {
    const cents = Math.round(Number(entry.amount.replace(/\s/g, "").replace(",", ".")) * 100);
    if (!Number.isFinite(cents) || cents === 0 || !entry.label.trim()) return toast.error(t("invalid"));
    setBusy(true);
    try {
      await api.post("/admin/finance/treasury/entries", { entryDate: entry.entryDate, label: entry.label, amountCents: cents, currency });
      setEntry({ ...entry, label: "", amount: "" });
      onDone();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel className="mb-6 grid gap-4 p-5">
      <div>
        <h2 className="font-display text-base font-semibold">{t("title")}</h2>
        <p className="text-xs text-ink-3">{t("help")}</p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t("currency")} hint={t("currencyHint")}>
          {(f) => (
            <Select {...f} value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-28">
              {BILLING_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          )}
        </Field>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-[var(--radius)] border border-line bg-surface px-3 py-2 text-sm font-medium hover:bg-surface-2">
          {busy ? t("importing") : t("file")}
          <input type="file" accept=".csv,text/csv,text/plain" className="sr-only" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void importFile(f); }} />
        </label>
        <Button variant="ghost" size="sm" disabled={busy} onClick={async () => { await api.post("/admin/finance/treasury/rematch"); onDone(); }}>{t("rematch")}</Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-[9rem_1fr_9rem_auto] sm:items-end">
        <Field label={t("date")}>{(f) => <Input {...f} type="date" value={entry.entryDate} onChange={(e) => setEntry({ ...entry, entryDate: e.target.value })} />}</Field>
        <Field label={t("label")}>{(f) => <Input {...f} value={entry.label} placeholder="VIR FV-7KQ4M2-X" onChange={(e) => setEntry({ ...entry, label: e.target.value })} />}</Field>
        <Field label={t("amount", { currency })}>{(f) => <Input {...f} inputMode="decimal" dir="ltr" value={entry.amount} onChange={(e) => setEntry({ ...entry, amount: e.target.value })} />}</Field>
        <Button variant="secondary" loading={busy} onClick={addEntry}>{t("add")}</Button>
      </div>
    </Panel>
  );
}

export default function TreasuryPage() {
  const t = useTranslations("admin.finance.treasury");
  const errMsg = useErrorMessage();
  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["admin-finance-treasury"],
    queryFn: () => api.get<TreasuryResponse>("/admin/finance/treasury"),
  });

  const currency = data?.currency ?? "EUR";
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

          <BankImport onDone={() => void refetch()} />

          {isLoading ? (
            <DataLoader />
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
                        ) : entry.suggestion ? (
                          <div className="grid gap-1.5">
                            <p className="text-xs text-ink-2">
                              {t("suggestion", { reference: entry.suggestion.reference, name: entry.suggestion.name })}
                            </p>
                            {entry.amountMismatch && (
                              <p className="text-xs font-medium text-danger">
                                {t("mismatch", { expected: formatFinance(entry.suggestion.expectedCents, entry.suggestion.currency) })}
                              </p>
                            )}
                            <ConfirmDialog
                              trigger={<Button size="sm" className="justify-self-start">{t("confirmMatch")}</Button>}
                              title={t("confirmTitle", { reference: entry.suggestion.reference })}
                              consequence={entry.amountMismatch ? t("confirmMismatch", { amount: formatFinance(entry.amountCents, entry.currency), expected: formatFinance(entry.suggestion.expectedCents, entry.suggestion.currency) }) : t("confirmBody", { amount: formatFinance(entry.amountCents, entry.currency) })}
                              confirmLabel={t("confirmMatch")}
                              onConfirm={async () => {
                                try {
                                  await api.post(`/admin/finance/treasury/entries/${entry.id}/confirm`);
                                  toast.success(t("matched"));
                                  await refetch();
                                } catch (e) {
                                  toast.error(errMsg(e));
                                  throw e;
                                }
                              }}
                            />
                          </div>
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
