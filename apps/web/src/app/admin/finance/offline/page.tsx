"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { BILLING_CURRENCIES } from "@fove/shared";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, DialogContent, DialogRoot } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Badge, PageHeader, Panel } from "@/components/ui/misc";
import { api, useErrorMessage } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { FinanceNav } from "@/components/admin/finance/finance-nav";
import { formatFinance } from "@/components/admin/finance/finance-utils";

interface OfflineInvoice {
  id: string;
  number: string;
  paymentReference: string;
  status: "OPEN" | "PAID" | "VOID";
  currency: string;
  amountTotalCents: number;
  amountDueCents: number;
  amountPaidCents: number;
  createdAt: string;
  paidAt: string | null;
  dueDate: string | null;
  plan: string;
  kind: "new" | "renewal";
  provisional: boolean;
  tenant: { id: string; name: string; slug: string };
  payments: { id: string; method: string | null; amountCents: number; receiptNumber: string | null }[];
}

interface BankAccount {
  id: string;
  country: string;
  currency: string;
  beneficiary: string;
  bankName: string | null;
  iban: string | null;
  accountNumber: string | null;
  swift: string | null;
  instructions: string | null;
  active: boolean;
}

const METHODS = ["BANK_TRANSFER", "CASH"] as const;
const STATUSES = ["OPEN", "PAID", "VOID", "ALL"] as const;
const TONE = { OPEN: "stamp", PAID: "mint", VOID: "neutral" } as const;

/** Validation d'un règlement reçu : moyen, montant, date, référence bancaire, justificatif. */
function ValidateDialog({ invoice, onDone }: { invoice: OfflineInvoice; onDone: () => void }) {
  const t = useTranslations("admin.finance.offline.validate");
  const errMsg = useErrorMessage();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState<(typeof METHODS)[number]>("BANK_TRANSFER");
  const [amount, setAmount] = useState(String(invoice.amountDueCents / 100));
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [bankReference, setBankReference] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [note, setNote] = useState("");
  const [shortfall, setShortfall] = useState(false);
  const cents = Math.round(Number(amount.replace(/\s/g, "").replace(",", ".")) * 100);
  const short = Number.isFinite(cents) && cents < invoice.amountDueCents;

  const submit = async () => {
    setBusy(true);
    try {
      await api.post(`/admin/finance/offline-invoices/${invoice.id}/validate`, {
        method,
        amountCents: cents,
        paidAt: new Date(`${paidAt}T12:00:00`).toISOString(),
        bankReference: bankReference || undefined,
        proofUrl: proofUrl || undefined,
        note: note || undefined,
        acceptShortfall: short ? shortfall : undefined,
      });
      toast.success(t("done"));
      setOpen(false);
      onDone();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogRoot open={open} onOpenChange={(o) => !busy && setOpen(o)}>
      <Button size="sm" onClick={() => setOpen(true)}>{t("button")}</Button>
      <DialogContent title={t("title", { reference: invoice.paymentReference })} description={t("description", { tenant: invoice.tenant.name, amount: formatFinance(invoice.amountDueCents, invoice.currency) })}>
        <div className="grid gap-3">
          <Field label={t("method")}>
            {(f) => (
              <Select {...f} value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
                {METHODS.map((m) => <option key={m} value={m}>{t(`methods.${m}`)}</option>)}
              </Select>
            )}
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("amount", { currency: invoice.currency })}>{(f) => <Input {...f} inputMode="decimal" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} />}</Field>
            <Field label={t("paidAt")}>{(f) => <Input {...f} type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />}</Field>
          </div>
          {short && <Checkbox label={t("shortfall")} checked={shortfall} onChange={(e) => setShortfall(e.target.checked)} />}
          <Field label={t("bankReference")} hint={t("bankReferenceHint")}>{(f) => <Input {...f} value={bankReference} onChange={(e) => setBankReference(e.target.value)} />}</Field>
          <Field label={t("proofUrl")}>{(f) => <Input {...f} type="url" placeholder="https://…" value={proofUrl} onChange={(e) => setProofUrl(e.target.value)} />}</Field>
          <Field label={t("note")}>{(f) => <Textarea {...f} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>{t("cancel")}</Button>
            <Button loading={busy} disabled={!Number.isFinite(cents) || cents <= 0 || (short && !shortfall)} onClick={submit}>{t("confirm")}</Button>
          </div>
        </div>
      </DialogContent>
    </DialogRoot>
  );
}

function BankAccounts() {
  const t = useTranslations("admin.finance.offline.accounts");
  const errMsg = useErrorMessage();
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["admin-bank-accounts"], queryFn: () => api.get<BankAccount[]>("/admin/finance/bank-accounts") });
  const empty = { country: "", currency: "EUR", beneficiary: "", bankName: "", iban: "", accountNumber: "", swift: "", instructions: "", active: true };
  const [form, setForm] = useState<typeof empty & { id?: string }>(empty);
  const [busy, setBusy] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-bank-accounts"] });

  const save = async () => {
    setBusy(true);
    try {
      const { id, ...body } = form;
      if (id) await api.patch(`/admin/finance/bank-accounts/${id}`, body);
      else await api.post("/admin/finance/bank-accounts", body);
      toast.success(t("saved"));
      setForm(empty);
      await refresh();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const text = (key: keyof typeof empty, label: string, props: { dir?: "ltr" } = {}) => (
    <Field label={label}>{(f) => <Input {...f} {...props} value={String(form[key] ?? "")} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />}</Field>
  );

  return (
    <Panel className="grid gap-4 p-5">
      <div>
        <h2 className="font-display text-lg font-semibold">{t("title")}</h2>
        <p className="text-sm text-ink-2">{t("help")}</p>
      </div>
      {data.length === 0 ? (
        <p className="text-sm text-ink-3">{t("empty")}</p>
      ) : (
        <ul className="grid gap-2 text-sm">
          {data.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-md border border-line px-3 py-2">
              <span className="font-mono font-semibold">{a.country === "*" ? t("default") : a.country}</span>
              <span>{a.beneficiary}</span>
              <span className="text-ink-3">{a.bankName ?? ""} · {a.currency}</span>
              {!a.active && <Badge tone="neutral">{t("inactive")}</Badge>}
              <span className="ms-auto flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setForm({ ...empty, ...Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v ?? ""])), active: a.active } as typeof form)}>{t("edit")}</Button>
                <ConfirmDialog
                  trigger={<Button size="sm" variant="ghost">{t("delete")}</Button>}
                  title={t("deleteTitle")}
                  consequence={t("deleteConsequence")}
                  confirmLabel={t("delete")}
                  destructive
                  onConfirm={async () => {
                    await api.delete(`/admin/finance/bank-accounts/${a.id}`);
                    await refresh();
                  }}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {text("country", t("country"))}
        <Field label={t("currency")}>
          {(f) => (
            <Select {...f} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              {BILLING_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          )}
        </Field>
        {text("beneficiary", t("beneficiary"))}
        {text("bankName", t("bankName"))}
        {text("iban", "IBAN", { dir: "ltr" })}
        {text("accountNumber", t("accountNumber"), { dir: "ltr" })}
        {text("swift", "BIC/SWIFT", { dir: "ltr" })}
      </div>
      <Field label={t("instructions")} hint={t("instructionsHint")}>
        {(f) => <Textarea {...f} rows={2} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />}
      </Field>
      <Checkbox label={t("active")} checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
      <div className="flex gap-2">
        <Button loading={busy} onClick={save}>{form.id ? t("update") : t("add")}</Button>
        {form.id && <Button variant="secondary" onClick={() => setForm(empty)}>{t("cancel")}</Button>}
      </div>
    </Panel>
  );
}

/** Règlements hors ligne (docs/chantier-encaissement-hors-ligne.md, 5) : factures à référence, validation, coordonnées. */
export default function OfflinePaymentsPage() {
  const t = useTranslations("admin.finance.offline");
  const errMsg = useErrorMessage();
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("OPEN");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const { data = [], refetch } = useQuery({
    queryKey: ["admin-offline-invoices", status, search],
    queryFn: () => api.get<OfflineInvoice[]>(`/admin/finance/offline-invoices?status=${status}&q=${encodeURIComponent(search)}`),
  });

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <FinanceNav />
      <div className="grid gap-6">
        <Panel className="grid gap-4 p-5">
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(q.trim());
            }}
          >
            <Field label={t("search")} className="min-w-64 flex-1">{(f) => <Input {...f} dir="ltr" placeholder="FV-7KQ4M2-X" value={q} onChange={(e) => setQ(e.target.value)} />}</Field>
            <Select aria-label={t("status")} value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="w-auto">
              {STATUSES.map((s) => <option key={s} value={s}>{t(`statuses.${s}`)}</option>)}
            </Select>
            <Button type="submit" variant="secondary">{t("searchButton")}</Button>
          </form>
          {data.length === 0 ? (
            <p className="text-sm text-ink-3">{t("empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-line text-start text-xs text-ink-3">
                    <th className="px-3 py-2 text-start font-medium">{t("table.reference")}</th>
                    <th className="px-3 py-2 text-start font-medium">{t("table.tenant")}</th>
                    <th className="px-3 py-2 text-start font-medium">{t("table.plan")}</th>
                    <th className="px-3 py-2 text-end font-medium">{t("table.amount")}</th>
                    <th className="px-3 py-2 text-start font-medium">{t("table.date")}</th>
                    <th className="px-3 py-2 text-start font-medium">{t("table.status")}</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.map((inv) => {
                    const payment = inv.payments[0];
                    return (
                      <tr key={inv.id}>
                        <td className="px-3 py-2.5 font-mono font-semibold" dir="ltr">{inv.paymentReference}</td>
                        <td className="px-3 py-2.5">{inv.tenant.name}</td>
                        <td className="px-3 py-2.5">
                          {inv.plan} · {t(`kind.${inv.kind}`)}
                          {inv.provisional && inv.status === "OPEN" && <span className="block text-xs text-stamp-ink">{t("provisional")}</span>}
                        </td>
                        <td className="px-3 py-2.5 text-end tabular-nums">{formatFinance(inv.status === "PAID" ? inv.amountPaidCents : inv.amountTotalCents, inv.currency)}</td>
                        <td className="px-3 py-2.5 text-xs text-ink-2">{formatDate(inv.paidAt ?? inv.createdAt)}</td>
                        <td className="px-3 py-2.5">
                          <Badge tone={TONE[inv.status]}>{t(`statuses.${inv.status}`)}</Badge>
                          {payment?.receiptNumber && <span className="block text-xs text-ink-3">{t("receipt", { number: payment.receiptNumber })}</span>}
                        </td>
                        <td className="px-3 py-2.5 text-end">
                          {inv.status === "OPEN" && (
                            <div className="flex justify-end gap-1">
                              <ValidateDialog invoice={inv} onDone={() => void refetch()} />
                              <ConfirmDialog
                                trigger={<Button size="sm" variant="ghost">{t("void")}</Button>}
                                title={t("voidTitle", { reference: inv.paymentReference })}
                                consequence={inv.provisional ? t("voidProvisional") : t("voidConsequence")}
                                confirmLabel={t("void")}
                                destructive
                                onConfirm={async () => {
                                  try {
                                    await api.post(`/admin/finance/offline-invoices/${inv.id}/void`, { reason: "Annulée depuis le back-office" });
                                    await refetch();
                                  } catch (e) {
                                    toast.error(errMsg(e));
                                    throw e;
                                  }
                                }}
                              />
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <BankAccounts />
      </div>
    </>
  );
}
