"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { Badge, Panel } from "@/components/ui/misc";
import { api, useErrorMessage } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { formatFinance } from "@/components/admin/finance/finance-utils";
import { DataLoader } from "@/components/navigation/data-loader";

interface Payout {
  id: string;
  amountCents: number;
  currency: string;
  method: string;
  status: "PENDING" | "PAID" | "FAILED";
  reference: string | null;
  createdAt: string;
  paidAt: string | null;
  partner: { id: string; name: string; code: string; email: string; payoutInfo: Record<string, string> | null };
  commissions: { id: string; payoutAmountCents: number | null; tenant: { name: string } }[];
}

const STATUSES = ["PENDING", "PAID", "FAILED", "ALL"] as const;
const TONE = { PENDING: "stamp", PAID: "mint", FAILED: "danger" } as const;

/** Coordonnées de versement du partenaire, en une ligne. */
function payoutDetails(info: Record<string, string> | null): string {
  if (!info) return "—";
  return [info.accountHolder ?? info.mobileHolder, info.iban, info.bic, info.bankName, info.mobileProvider, info.mobileNumber].filter(Boolean).join(" · ") || "—";
}

/**
 * Versements mensuels des partenaires : créés le 1er du mois avec les commissions disponibles,
 * à payer avant le 10 (frais de transfert à la charge de FOVE), puis marqués payés ou rejetés.
 */
export function PartnerPayouts() {
  const t = useTranslations("admin.partners.payouts");
  const errMsg = useErrorMessage();
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("PENDING");
  const [refs, setRefs] = useState<Record<string, string>>({});
  const { data = [], refetch, isLoading } = useQuery({ queryKey: ["admin-partner-payouts", status], queryFn: () => api.get<Payout[]>(`/admin/partners/payouts?status=${status}`) });

  const process = async (payout: Payout, action: "PAID" | "REJECTED") => {
    try {
      await api.post(`/admin/partners/payouts/${payout.id}/process`, action === "PAID" ? { status: "PAID", reference: refs[payout.id] || undefined } : { status: "REJECTED", rejectionReason: refs[payout.id] || undefined });
      toast.success(action === "PAID" ? t("paid") : t("rejected"));
      await refetch();
    } catch (e) {
      toast.error(errMsg(e));
      throw e;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-2xl text-sm text-ink-2">{t("help")}</p>
        <Select aria-label={t("status")} className="w-auto" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          {STATUSES.map((s) => <option key={s} value={s}>{t(`statuses.${s}`)}</option>)}
        </Select>
      </div>
      {isLoading ? (
        <DataLoader className="min-h-48" />
      ) : data.length === 0 ? (
        <Panel className="p-12 text-center text-sm text-ink-3">{t("empty")}</Panel>
      ) : (
        data.map((p) => (
          <Panel key={p.id} className="grid gap-3 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-ink">
                  {p.partner.name} <span className="font-mono text-xs text-cobalt">{p.partner.code}</span>
                </p>
                <p className="text-xs text-ink-3">{p.partner.email} · {t("methods.BANK_TRANSFER")}</p>
                <p className="text-xs text-ink-2" dir="auto">{payoutDetails(p.partner.payoutInfo)}</p>
              </div>
              <div className="text-end">
                <p className="font-display text-xl font-bold tabular-nums">{formatFinance(p.amountCents, p.currency)}</p>
                <Badge tone={TONE[p.status]}>{t(`statuses.${p.status}`)}</Badge>
                <p className="mt-1 text-xs text-ink-3">{p.status === "PAID" && p.paidAt ? t("paidOn", { date: formatDate(p.paidAt) }) : t("createdOn", { date: formatDate(p.createdAt) })}</p>
              </div>
            </div>
            {p.commissions.length > 0 && (
              <ul className="grid gap-0.5 text-xs text-ink-2">
                {p.commissions.map((c) => (
                  <li key={c.id} className="flex justify-between gap-2">
                    <span>{c.tenant.name}</span>
                    <span className="tabular-nums">{formatFinance(c.payoutAmountCents ?? 0, p.currency)}</span>
                  </li>
                ))}
              </ul>
            )}
            {p.reference && <p className="font-mono text-xs text-ink-3">{p.reference}</p>}
            {p.status === "PENDING" && (
              <div className="flex flex-wrap items-end gap-2">
                <Field label={t("reference")} className="min-w-56 flex-1">
                  {(f) => <Input {...f} value={refs[p.id] ?? ""} placeholder={t("referencePlaceholder")} onChange={(e) => setRefs({ ...refs, [p.id]: e.target.value })} />}
                </Field>
                <ConfirmDialog
                  trigger={<Button size="sm">{t("markPaid")}</Button>}
                  title={t("markPaidTitle", { amount: formatFinance(p.amountCents, p.currency), name: p.partner.name })}
                  consequence={t("markPaidBody")}
                  confirmLabel={t("markPaid")}
                  onConfirm={() => process(p, "PAID")}
                />
                <ConfirmDialog
                  trigger={<Button size="sm" variant="ghost">{t("reject")}</Button>}
                  title={t("rejectTitle")}
                  consequence={t("rejectBody")}
                  confirmLabel={t("reject")}
                  destructive
                  onConfirm={() => process(p, "REJECTED")}
                />
              </div>
            )}
          </Panel>
        ))
      )}
    </div>
  );
}
