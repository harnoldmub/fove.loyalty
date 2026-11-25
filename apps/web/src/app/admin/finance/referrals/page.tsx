"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Gift, Users, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { Badge, PageHeader, Panel } from "@/components/ui/misc";
import { api, useErrorMessage } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { FinanceNav } from "@/components/admin/finance/finance-nav";
import { formatFinance } from "@/components/admin/finance/finance-utils";
import type { ReferralStatus } from "@/lib/referral";

interface ReferralItem {
  id: string;
  referrerTenant: { name: string };
  referredTenant: { name: string };
  status: ReferralStatus;
  creditAmountCents: number;
  creditUsedCents: number;
  creditRemainingCents: number;
  currency: string;
  pendingUntil: string | null;
  earnedAt: string | null;
  expiresAt: string | null;
  cancelReason: string | null;
  createdAt: string;
}

interface ReferralsData {
  /** Monnaie des totaux (conversion au taux comptable). */
  currency: string;
  items: ReferralItem[];
  totalCreditCents: number;
  usedCents: number;
  remainingCents: number;
}

const TONE: Record<ReferralStatus, "neutral" | "cobalt" | "mint" | "stamp" | "danger"> = {
  SIGNED_UP: "neutral",
  PENDING: "cobalt",
  EARNED: "mint",
  CAPPED: "stamp",
  NO_PLAN: "stamp",
  CANCELLED: "danger",
  EXPIRED: "neutral",
};

/** Finance > Parrainages : états, crédits et annulation par l'équipe FOVE (docs/chantier-parrainage.md). */
export default function ReferralsFinancePage() {
  const t = useTranslations("admin.finance.referrals");
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-finance-referrals"],
    queryFn: () => api.get<ReferralsData>("/admin/finance/referrals"),
  });
  const referrals = data?.items ?? [];

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <FinanceNav />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Kpi label={t("credits")} help={t("creditsHelp")} icon={<Gift className="size-4 text-cobalt" />} value={formatFinance(data?.totalCreditCents ?? 0, data?.currency)} />
        <Kpi label={t("remaining")} help={t("used", { amount: formatFinance(data?.usedCents ?? 0, data?.currency) })} icon={<Wallet className="size-4 text-mint" />} value={formatFinance(data?.remainingCents ?? 0, data?.currency)} />
        <Kpi label={t("count")} help={t("countHelp")} icon={<Users className="size-4 text-mint" />} value={String(referrals.length)} />
      </div>

      {isLoading ? (
        <div className="py-20 text-center text-sm text-ink-3">{t("loading")}</div>
      ) : referrals.length === 0 ? (
        <Panel className="py-12 text-center text-sm text-ink-3">{t("empty")}</Panel>
      ) : (
        <Panel className="overflow-x-auto p-0">
          <table className="w-full text-start text-sm">
            <thead className="border-b border-line bg-surface-2 text-xs text-ink-3">
              <tr>
                <th className="px-4 py-3 text-start font-medium">{t("table.date")}</th>
                <th className="px-4 py-3 text-start font-medium">{t("table.referrer")}</th>
                <th className="px-4 py-3 text-start font-medium">{t("table.referred")}</th>
                <th className="px-4 py-3 text-start font-medium">{t("table.status")}</th>
                <th className="px-4 py-3 text-end font-medium">{t("table.credit")}</th>
                <th className="px-4 py-3 text-end font-medium">{t("table.used")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {referrals.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 text-ink-2">{formatDate(r.createdAt)}</td>
                  <td className="px-4 py-3 font-medium">{r.referrerTenant.name}</td>
                  <td className="px-4 py-3">{r.referredTenant.name}</td>
                  <td className="px-4 py-3">
                    <Badge tone={TONE[r.status]}>{t(`status.${r.status}`, { date: r.pendingUntil ? formatDate(r.pendingUntil) : "" })}</Badge>
                    {r.cancelReason && <p className="mt-1 text-xs text-ink-3">{r.cancelReason}</p>}
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums">{r.creditAmountCents > 0 ? formatFinance(r.creditAmountCents, r.currency) : "—"}</td>
                  <td className="px-4 py-3 text-end tabular-nums">{r.creditUsedCents > 0 ? formatFinance(r.creditUsedCents, r.currency) : "—"}</td>
                  <td className="px-4 py-3 text-end">
                    {(r.status === "SIGNED_UP" || r.status === "PENDING" || r.status === "EARNED") && (
                      <CancelReferral id={r.id} onDone={() => qc.invalidateQueries({ queryKey: ["admin-finance-referrals"] })} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </>
  );
}

function Kpi({ label, help, icon, value }: { label: string; help: string; icon: React.ReactNode; value: string }) {
  return (
    <Panel className="p-4">
      <div className="flex items-center justify-between text-xs text-ink-3">
        <span>{label}</span>
        {icon}
      </div>
      <div className="mt-2 font-display text-2xl font-bold tabular text-ink">{value}</div>
      <p className="mt-1 text-xs text-ink-3">{help}</p>
    </Panel>
  );
}

/** Annulation pour abus ou fraude, avec un motif obligatoire (inscrit au journal). */
function CancelReferral({ id, onDone }: { id: string; onDone: () => void }) {
  const t = useTranslations("admin.finance.referrals.cancel");
  const toErrorMessage = useErrorMessage();
  const [reason, setReason] = useState("");
  return (
    <ConfirmDialog
      trigger={<Button variant="ghost" size="sm" className="text-danger hover:text-danger">{t("action")}</Button>}
      title={t("title")}
      consequence={t("consequence")}
      confirmLabel={t("confirm")}
      destructive
      onConfirm={async () => {
        if (reason.trim().length < 3) {
          toast.error(t("reasonRequired"));
          throw new Error("motif requis");
        }
        try {
          await api.post(`/admin/finance/referrals/${id}/cancel`, { reason: reason.trim() });
          toast.success(t("done"));
          onDone();
        } catch (e) {
          toast.error(toErrorMessage(e));
          throw e;
        }
      }}
    >
      <Field label={t("reason")}>{(p) => <Input {...p} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />}</Field>
    </ConfirmDialog>
  );
}
