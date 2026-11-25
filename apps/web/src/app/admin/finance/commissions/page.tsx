"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, PageHeader, Panel } from "@/components/ui/misc";
import { api, useErrorMessage } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { FinanceNav } from "@/components/admin/finance/finance-nav";
import { formatFinance, formatPct } from "@/components/admin/finance/finance-utils";
import { PartnerModal } from "@/components/admin/finance/partner-modal";

interface PartnerRow {
  id: string;
  name: string;
  code: string;
  email: string;
  phone: string | null;
  company: string | null;
  commissionRatePercent: number;
  totalSalesCount: number;
  totalEarnedCents: number;
  pendingCents: number;
  paidCents: number;
  /** Monnaie des totaux (euros, taux comptable). */
  currency: string;
}

interface CommissionRow {
  id: string;
  amountCents: number;
  /** Monnaie du paiement du commerçant. */
  currency: string;
  ratePercent: number;
  status: string;
  createdAt: string;
  paidAt: string | null;
  partner: {
    id: string;
    name: string;
    code: string;
  };
  invoice: {
    id: string;
    number: string;
    amountTotalCents: number;
    tenant: {
      name: string;
    };
  } | null;
}

export default function CommissionsPage() {
  const t = useTranslations("admin.finance.commissions");
  const errMsg = useErrorMessage();
  const [partnerModalOpen, setPartnerModalOpen] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);

  const { data: partnersData, refetch: refetchPartners, isLoading: loadingPartners } = useQuery({
    queryKey: ["admin-finance-partners"],
    queryFn: () => api.get<PartnerRow[]>("/admin/finance/partners"),
  });

  const { data: commissionsData, refetch: refetchCommissions, isLoading: loadingComms } = useQuery({
    queryKey: ["admin-finance-commissions"],
    queryFn: () =>
      api.get<{ currency: string; items: CommissionRow[]; totalPendingCents: number; totalPaidCents: number }>(
        "/admin/finance/commissions"
      ),
  });

  const partners = partnersData ?? [];
  const commissions = commissionsData?.items ?? [];

  const handlePayCommission = async (id: string) => {
    setPayingId(id);
    try {
      await api.post(`/admin/finance/commissions/${id}/pay`);
      refetchPartners();
      refetchCommissions();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setPayingId(null);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title={t("title")}
          description={t("description")}
        />
        <Button onClick={() => setPartnerModalOpen(true)} className="gap-2" variant="primary">
          <Plus className="size-4" />
          {t("newPartner")}
        </Button>
      </div>

      <FinanceNav />

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <Panel className="p-4">
          <div className="text-xs text-ink-3">{t("kpi.partners")}</div>
          <div className="mt-1 font-display text-2xl font-bold tabular text-ink">
            {partners.length}
          </div>
          <p className="mt-1 text-xs text-ink-3">{t("kpi.partnersHelp")}</p>
        </Panel>

        <Panel className="p-4">
          <div className="text-xs text-ink-3">{t("kpi.pending")}</div>
          <div className="mt-1 font-display text-2xl font-bold tabular text-amber-500">
            {formatFinance(commissionsData?.totalPendingCents ?? 0, commissionsData?.currency)}
          </div>
          <p className="mt-1 text-xs text-ink-3">{t("kpi.pendingHelp")}</p>
        </Panel>

        <Panel className="p-4">
          <div className="text-xs text-ink-3">{t("kpi.paid")}</div>
          <div className="mt-1 font-display text-2xl font-bold tabular text-emerald-600 dark:text-emerald-400">
            {formatFinance(commissionsData?.totalPaidCents ?? 0, commissionsData?.currency)}
          </div>
          <p className="mt-1 text-xs text-ink-3">{t("kpi.paidHelp")}</p>
        </Panel>
      </div>

      {/* Tableau 1 : Liste des Partenaires */}
      <div className="mb-8 space-y-3">
        <h3 className="font-display text-base font-semibold text-ink">{t("partnersTitle")}</h3>
        {loadingPartners ? (
          <div className="py-10 text-center text-sm text-ink-3">{t("loading")}</div>
        ) : partners.length === 0 ? (
          <Panel className="p-8 text-center text-sm text-ink-3">
            {t("partnersEmpty")}
          </Panel>
        ) : (
          <Panel className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-start text-sm">
              <thead className="border-b border-line bg-surface-2 text-xs text-ink-3">
                <tr>
                  <th className="py-3 px-4 font-medium">{t("table.partner")}</th>
                  <th className="py-3 px-4 font-medium">{t("table.code")}</th>
                  <th className="py-3 px-4 font-medium text-center">{t("table.rate")}</th>
                  <th className="py-3 px-4 font-medium text-center">{t("table.sales")}</th>
                  <th className="py-3 px-4 font-medium text-end">{t("table.earned")}</th>
                  <th className="py-3 px-4 font-medium text-end">{t("table.pending")}</th>
                  <th className="py-3 px-4 font-medium text-end">{t("table.paid")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {partners.map((p) => (
                  <tr key={p.id} className="hover:bg-surface-2 transition-colors">
                    <td className="py-3.5 px-4">
                      <Link
                        href={`/admin/partners?q=${encodeURIComponent(p.code)}`}
                        className="block truncate font-semibold text-ink hover:text-cobalt hover:underline"
                      >
                        {p.name}
                      </Link>
                      <div className="text-xs text-ink-3">{p.email}</div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs font-bold text-cobalt" dir="ltr">
                      {p.code}
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono text-xs text-ink-2">
                      {formatPct(p.commissionRatePercent).replace(/^\+/, "")}
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono text-xs font-bold text-ink">
                      {p.totalSalesCount}
                    </td>
                    <td className="py-3.5 px-4 text-end font-mono text-xs font-semibold text-ink">
                      {formatFinance(p.totalEarnedCents, p.currency)}
                    </td>
                    <td className="py-3.5 px-4 text-end font-mono text-xs font-bold text-amber-500">
                      {formatFinance(p.pendingCents, p.currency)}
                    </td>
                    <td className="py-3.5 px-4 text-end font-mono text-xs text-emerald-600 dark:text-emerald-400">
                      {formatFinance(p.paidCents, p.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )}
      </div>

      {/* Tableau 2 : Historique des Commissions */}
      <div className="space-y-3">
        <h3 className="font-display text-base font-semibold text-ink">{t("logTitle")}</h3>
        {loadingComms ? (
          <div className="py-10 text-center text-sm text-ink-3">{t("loading")}</div>
        ) : commissions.length === 0 ? (
          <Panel className="p-8 text-center text-sm text-ink-3">
            {t("logEmpty")}
          </Panel>
        ) : (
          <Panel className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-start text-sm">
              <thead className="border-b border-line bg-surface-2 text-xs text-ink-3">
                <tr>
                  <th className="py-3 px-4 font-medium">{t("table.date")}</th>
                  <th className="py-3 px-4 font-medium">{t("table.partner")}</th>
                  <th className="py-3 px-4 font-medium">{t("table.invoice")}</th>
                  <th className="py-3 px-4 font-medium text-end">{t("table.saleAmount")}</th>
                  <th className="py-3 px-4 font-medium text-end">{t("table.due")}</th>
                  <th className="py-3 px-4 font-medium">{t("table.status")}</th>
                  <th className="py-3 px-4 font-medium text-end">{t("table.action")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {commissions.map((c) => {
                  const isPending = c.status === "PENDING";
                  return (
                    <tr key={c.id} className="hover:bg-surface-2 transition-colors">
                      <td className="py-3.5 px-4 text-xs text-ink-2">{formatDate(c.createdAt)}</td>
                      <td className="py-3.5 px-4 font-medium text-ink">
                        {c.partner.name} ({c.partner.code})
                      </td>
                      <td className="py-3.5 px-4 text-xs">
                        <div className="font-semibold text-ink">{c.invoice?.tenant.name ?? "—"}</div>
                        <div className="font-mono text-ink-3">{c.invoice?.number}</div>
                      </td>
                      <td className="py-3.5 px-4 text-end font-mono text-xs text-ink-2">
                        {formatFinance(c.invoice?.amountTotalCents ?? 0, c.currency)}
                      </td>
                      <td className="py-3.5 px-4 text-end font-mono text-xs font-bold text-amber-500">
                        {formatFinance(c.amountCents, c.currency)} ({formatPct(c.ratePercent).replace(/^\+/, "")})
                      </td>
                      <td className="py-3.5 px-4">
                        {c.status === "PAID" ? (
                          <Badge tone="mint">{t("status.paid")}</Badge>
                        ) : (
                          <Badge tone="stamp">{t("status.pending")}</Badge>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-end">
                        {isPending ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handlePayCommission(c.id)}
                            disabled={payingId === c.id}
                            className="h-8 gap-1.5 text-xs"
                          >
                            <CheckCircle2 className="size-3.5" />
                            {payingId === c.id ? t("paying") : t("markPaid")}
                          </Button>
                        ) : (
                          <span className="text-xs text-ink-3">
                            {t("paidOn", { date: c.paidAt ? formatDate(c.paidAt) : "—" })}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>
        )}
      </div>

      <PartnerModal
        open={partnerModalOpen}
        onClose={() => setPartnerModalOpen(false)}
        onCreated={() => {
          refetchPartners();
          refetchCommissions();
        }}
      />
    </>
  );
}

