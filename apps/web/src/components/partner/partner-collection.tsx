"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogRoot } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { Badge, Panel } from "@/components/ui/misc";
import { api, useErrorMessage } from "@/lib/api";
import { formatDate, formatPrice } from "@/lib/utils";

interface CollectionOverview {
  status: {
    enabled: boolean;
    capEurCents: number;
    outstandingEurCents: number;
    overdueReference: string | null;
    blocked: "not_approved" | "disabled" | "overdue" | "cap" | null;
    feePercent: number;
  };
  history: { id: string; date: string; tenantName: string; reference: string | null; amountCents: number; currency: string; receiptNumber: string | null; statement: { reference: string; status: string } | null; disputed: boolean }[];
  statements?: { id: string; reference: string; periodStart: string; currency: string; collectedCents: number; commissionsCents: number; feesCents: number; balanceCents: number; paidCents: number; status: "ISSUED" | "PAID" | "SETTLED"; dueAt: string }[];
}

interface Client {
  tenantId: string;
  name: string;
  planCode: string;
  planName: string | null;
  provider: string | null;
  periodEnd: string | null;
  currency: string;
}

interface Quote {
  reference: string;
  tenantName: string;
  planName: string;
  kind: "new" | "renewal";
  amountCents: number;
  currency: string;
}

const PLAN_CODES = ["starter", "business", "premium"] as const;
const METHODS = ["CASH", "MOBILE_MONEY", "BANK_TRANSFER"] as const;

/**
 * Onglet « Encaissements » de l'espace partenaire (docs/chantier-encaissement-hors-ligne.md, 6) :
 * encaisser par référence, souscrire ou renouveler ses clients, inscrire un commerce, suivre son
 * encours, ses encaissements et ses relevés mensuels.
 */
export function PartnerCollection({ partnerCode }: { partnerCode: string }) {
  const t = useTranslations("partner.collection");
  const locale = useLocale();
  const errMsg = useErrorMessage();
  const money = (cents: number, currency: string) => formatPrice(cents, currency, locale);
  const { data: plans = [] } = useQuery({ queryKey: ["plans"], queryFn: () => api.get<{ code: string; name: string }[]>("/plans") });
  const { data, refetch } = useQuery({ queryKey: ["partner-collection"], queryFn: () => api.get<CollectionOverview>("/partner/collection") });
  const { data: clients = [], refetch: refetchClients } = useQuery({ queryKey: ["partner-collection-clients"], queryFn: () => api.get<Client[]>("/partner/collection/clients") });
  const [reference, setReference] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [receipt, setReceipt] = useState("");
  const [method, setMethod] = useState<(typeof METHODS)[number]>("CASH");
  const [busy, setBusy] = useState(false);
  const [clientPlan, setClientPlan] = useState<Record<string, string>>({});
  const [invite, setInvite] = useState({ name: "", business: "", email: "" });
  const blocked = data?.status.blocked ?? null;

  const lookup = async (ref: string) => {
    setBusy(true);
    try {
      setQuote(await api.get<Quote>(`/partner/collection/lookup?reference=${encodeURIComponent(ref)}`));
      setReceipt("");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const invoiceFor = async (client: Client) => {
    setBusy(true);
    try {
      const planCode = clientPlan[client.tenantId] ?? (client.planCode !== "free" ? client.planCode : "starter");
      setQuote(await api.post<Quote>("/partner/collection/invoice", { tenantId: client.tenantId, planCode }));
      setReceipt("");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const collect = async () => {
    if (!quote) return;
    setBusy(true);
    try {
      await api.post("/partner/collection/collect", { reference: quote.reference, receiptNumber: receipt || undefined, method });
      toast.success(t("collected", { name: quote.tenantName }));
      setQuote(null);
      setReference("");
      await Promise.all([refetch(), refetchClients()]);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const signupLink = () => {
    const url = new URL(`/p/${partnerCode}`, window.location.origin);
    url.searchParams.set("to", "signup");
    if (invite.name) url.searchParams.set("name", invite.name);
    if (invite.business) url.searchParams.set("business", invite.business);
    if (invite.email) url.searchParams.set("email", invite.email);
    return url.toString();
  };

  return (
    <div className="space-y-6">
      {/* Encours et garde-fous */}
      <Panel className="grid gap-3 p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-ink">{t("title")}</h2>
            <p className="text-sm text-ink-2">{t("subtitle", { fee: data?.status.feePercent ?? 5 })}</p>
          </div>
          {data && (
            <div className="text-end">
              <p className="text-xs text-ink-3">{t("outstanding")}</p>
              <p className="font-display text-xl font-bold tabular">
                {money(data.status.outstandingEurCents, "EUR")} <span className="text-sm font-normal text-ink-3">/ {money(data.status.capEurCents, "EUR")}</span>
              </p>
            </div>
          )}
        </div>
        {data && (
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className={`h-full rounded-full ${blocked === "cap" ? "bg-danger" : "bg-cobalt"}`} style={{ width: `${Math.min(100, (data.status.outstandingEurCents / Math.max(1, data.status.capEurCents)) * 100)}%` }} />
          </div>
        )}
        {blocked && <p className="rounded-md bg-stamp-soft px-4 py-3 text-sm text-stamp-ink">{t(`blocked.${blocked}`, { reference: data?.status.overdueReference ?? "" })}</p>}
      </Panel>

      {/* Encaisser par référence */}
      <Panel className="grid gap-3 p-6">
        <h3 className="font-display text-base font-semibold">{t("byReference.title")}</h3>
        <p className="text-sm text-ink-2">{t("byReference.help")}</p>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (reference.trim()) void lookup(reference.trim());
          }}
        >
          <Field label={t("byReference.label")} className="min-w-56 flex-1">
            {(f) => <Input {...f} dir="ltr" placeholder="FV-7KQ4M2-X" value={reference} onChange={(e) => setReference(e.target.value)} />}
          </Field>
          <Button type="submit" loading={busy && !quote} disabled={Boolean(blocked)}>{t("byReference.search")}</Button>
        </form>
      </Panel>

      {/* Mes clients : souscription et renouvellement */}
      <Panel className="grid gap-3 p-6">
        <h3 className="font-display text-base font-semibold">{t("clients.title")}</h3>
        {clients.length === 0 ? (
          <p className="text-sm text-ink-3">{t("clients.empty")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {clients.map((c) => (
              <li key={c.tenantId} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <div className="min-w-40 flex-1">
                  <p className="font-semibold text-ink">{c.name}</p>
                  <p className="text-xs text-ink-3">
                    {c.planName ? t("clients.until", { plan: c.planName, date: c.periodEnd ? formatDate(c.periodEnd, false, locale) : "—" }) : t("clients.free")}
                  </p>
                </div>
                <Select aria-label={t("clients.plan")} className="w-auto" value={clientPlan[c.tenantId] ?? (c.planCode !== "free" ? c.planCode : "starter")} onChange={(e) => setClientPlan({ ...clientPlan, [c.tenantId]: e.target.value })}>
                  {PLAN_CODES.map((code) => <option key={code} value={code}>{plans.find((p) => p.code === code)?.name ?? code}</option>)}
                </Select>
                <Button size="sm" variant="secondary" disabled={Boolean(blocked) || busy} onClick={() => invoiceFor(c)}>
                  {c.planName ? t("clients.renew") : t("clients.subscribe")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* Inscrire un commerce : lien d'inscription pré-rempli, le compte reste au commerçant */}
      <Panel className="grid gap-3 p-6">
        <h3 className="font-display text-base font-semibold">{t("invite.title")}</h3>
        <p className="text-sm text-ink-2">{t("invite.help")}</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <Field label={t("invite.name")}>{(f) => <Input {...f} value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} />}</Field>
          <Field label={t("invite.business")}>{(f) => <Input {...f} value={invite.business} onChange={(e) => setInvite({ ...invite, business: e.target.value })} />}</Field>
          <Field label={t("invite.email")}>{(f) => <Input {...f} type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />}</Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              void navigator.clipboard?.writeText(signupLink());
              toast.success(t("invite.copied"));
            }}
          >
            {t("invite.copy")}
          </Button>
          <Button asChild variant="secondary">
            <a href={`https://wa.me/?text=${encodeURIComponent(t("invite.message", { url: typeof window !== "undefined" ? signupLink() : "" }))}`} target="_blank" rel="noopener noreferrer">
              {t("invite.whatsapp")}
            </a>
          </Button>
          <Button asChild variant="ghost">
            <a href={typeof window !== "undefined" ? signupLink() : "#"} target="_blank" rel="noopener noreferrer">{t("invite.open")}</a>
          </Button>
        </div>
      </Panel>

      {/* Relevés mensuels */}
      {data?.statements && data.statements.length > 0 && (
        <Panel className="grid gap-3 p-6">
          <h3 className="font-display text-base font-semibold">{t("statements.title")}</h3>
          <ul className="divide-y divide-line text-sm">
            {data.statements.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="font-mono font-semibold" dir="ltr">{s.reference}</span>
                <span className="text-ink-3">{formatDate(s.periodStart, false, locale)}</span>
                <span className="ms-auto tabular">
                  {s.balanceCents >= 0 ? t("statements.owe", { amount: money(s.balanceCents - s.paidCents, s.currency) }) : t("statements.credit", { amount: money(-s.balanceCents, s.currency) })}
                </span>
                <Badge tone={s.status === "ISSUED" ? "stamp" : "mint"}>{t(`statements.status.${s.status}`)}</Badge>
                {s.status === "ISSUED" && <span className="w-full text-xs text-ink-3">{t("statements.due", { date: formatDate(s.dueAt, false, locale), reference: s.reference })}</span>}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {/* Historique */}
      <Panel className="grid gap-3 p-6">
        <h3 className="font-display text-base font-semibold">{t("history.title")}</h3>
        {!data?.history.length ? (
          <p className="text-sm text-ink-3">{t("history.empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <tbody className="divide-y divide-line">
                {data.history.map((h) => (
                  <tr key={h.id}>
                    <td className="py-2.5 pe-3 text-xs text-ink-2">{formatDate(h.date, false, locale)}</td>
                    <td className="py-2.5 pe-3 font-semibold">{h.tenantName}</td>
                    <td className="py-2.5 pe-3 font-mono text-xs" dir="ltr">{h.reference}</td>
                    <td className="py-2.5 pe-3 text-end tabular">{money(h.amountCents, h.currency)}</td>
                    <td className="py-2.5 text-end">
                      {h.disputed ? <Badge tone="danger">{t("history.disputed")}</Badge> : h.statement ? <Badge tone="neutral">{h.statement.reference}</Badge> : <Badge tone="stamp">{t("history.toSettle")}</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Confirmation de l'encaissement */}
      <DialogRoot open={quote !== null} onOpenChange={(o) => !busy && !o && setQuote(null)}>
        {quote && (
          <DialogContent title={t("confirm.title", { name: quote.tenantName })} description={t("confirm.description", { plan: quote.planName, kind: t(`confirm.kind.${quote.kind}`) })}>
            <div className="grid gap-3">
              <div className="rounded-md bg-surface-2 px-4 py-3">
                <p className="text-xs text-ink-3">{t("confirm.amount")}</p>
                <p className="font-display text-2xl font-bold tabular">{money(quote.amountCents, quote.currency)}</p>
                <p className="font-mono text-xs text-ink-3" dir="ltr">{quote.reference}</p>
              </div>
              <Field label={t("confirm.method")}>
                {(f) => (
                  <Select {...f} value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
                    {METHODS.map((m) => <option key={m} value={m}>{t(`confirm.methods.${m}`)}</option>)}
                  </Select>
                )}
              </Field>
              <Field label={t("confirm.receipt")} hint={t("confirm.receiptHint")}>{(f) => <Input {...f} value={receipt} onChange={(e) => setReceipt(e.target.value)} />}</Field>
              <p className="text-sm text-ink-2">{t("confirm.warning", { amount: money(quote.amountCents, quote.currency) })}</p>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" disabled={busy} onClick={() => setQuote(null)}>{t("confirm.cancel")}</Button>
                <Button loading={busy} onClick={collect}>{t("confirm.submit")}</Button>
              </div>
            </div>
          </DialogContent>
        )}
      </DialogRoot>
    </div>
  );
}
