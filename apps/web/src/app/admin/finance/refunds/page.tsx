"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Badge, PageHeader, Panel } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { FinanceNav } from "@/components/admin/finance/finance-nav";
import { formatFinance } from "@/components/admin/finance/finance-utils";
import { DataLoader } from "@/components/navigation/data-loader";

interface PaymentRow {
  id: string;
  reference: string;
  amountCents: number;
  amountRefundedCents: number;
  currency: string;
  status: string;
  createdAt: string;
  tenant: {
    name: string;
  };
}

export default function RefundsPage() {
  const t = useTranslations("admin.finance.refunds");
  const { data, isLoading } = useQuery({
    queryKey: ["admin-finance-refunds"],
    queryFn: () =>
      api.get<{ items: PaymentRow[]; total: number }>(
        "/admin/finance/payments?range=all&status=REFUNDED"
      ),
  });

  const refunds = data?.items ?? [];

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
      />

      <FinanceNav />

      {isLoading ? (
        <DataLoader />
      ) : refunds.length === 0 ? (
        <Panel className="p-12 text-center text-sm text-ink-3">
          {t("empty")}
        </Panel>
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[750px] text-start text-sm">
            <thead className="border-b border-line bg-surface-2 text-xs text-ink-3">
              <tr>
                <th className="py-3 px-4 font-medium">{t("table.date")}</th>
                <th className="py-3 px-4 font-medium">{t("table.reference")}</th>
                <th className="py-3 px-4 font-medium">{t("table.tenant")}</th>
                <th className="py-3 px-4 font-medium text-end">{t("table.initial")}</th>
                <th className="py-3 px-4 font-medium text-end">{t("table.refunded")}</th>
                <th className="py-3 px-4 font-medium">{t("table.status")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {refunds.map((r) => (
                <tr key={r.id} className="hover:bg-surface-2 transition-colors">
                  <td className="py-3.5 px-4 text-xs text-ink-2">{formatDate(r.createdAt)}</td>
                  <td className="py-3.5 px-4 font-mono text-xs font-semibold text-ink">
                    {r.reference}
                  </td>
                  <td className="py-3.5 px-4 font-medium text-ink">{r.tenant.name}</td>
                  <td className="py-3.5 px-4 text-end font-mono text-xs text-ink-3">
                    {formatFinance(r.amountCents, r.currency)}
                  </td>
                  <td className="py-3.5 px-4 text-end font-mono text-xs font-bold text-rose-500" dir="ltr">
                    -{formatFinance(r.amountRefundedCents || r.amountCents, r.currency)}
                  </td>
                  <td className="py-3.5 px-4">
                    <Badge tone="danger">{t("status")}</Badge>
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

