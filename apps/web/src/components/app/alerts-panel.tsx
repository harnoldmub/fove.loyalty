"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/misc";
import { api, useErrorMessage } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { useMe } from "./me-context";

interface Summary {
  alerts: { id: string; kind: string; details: { cashier?: string; customer?: string; customerId?: string; count?: number }; createdAt: string }[];
  cancellationsThisWeek: number;
}

/** Tableau de bord : points à vérifier (annulations répétées) et annulations de la semaine (docs/chantier-code-caisse.md). */
export function AlertsPanel() {
  const t = useTranslations("app.alerts");
  const me = useMe();
  const qc = useQueryClient();
  const errMsg = useErrorMessage();
  const manager = me.role === "OWNER" || me.role === "MANAGER";
  const { data } = useQuery({ queryKey: ["alerts"], queryFn: () => api.get<Summary>("/app/alerts"), enabled: manager });
  if (!manager || !data || (data.alerts.length === 0 && data.cancellationsThisWeek === 0)) return null;
  return (
    <Panel className="mb-6 grid gap-3 border-stamp/40 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold">
          <ShieldAlert className="size-5 text-stamp-ink" aria-hidden /> {t("title")}
        </h2>
        <Button asChild size="sm" variant="secondary">
          <Link href="/app/transactions?kind=CANCELLATIONS">{t("cancellations", { count: data.cancellationsThisWeek })}</Link>
        </Button>
      </div>
      {data.alerts.map((a) => (
        <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-md bg-stamp-soft p-3 text-sm">
          <p className="min-w-0 flex-1 text-ink">
            {t("repeated", { cashier: a.details.cashier ?? "—", customer: a.details.customer ?? "—", count: a.details.count ?? 2 })}
            <span className="block text-xs text-ink-3">{formatDate(a.createdAt, true)}</span>
          </p>
          {a.details.customerId && (
            <Button asChild size="sm" variant="ghost">
              <Link href={`/app/customers/${a.details.customerId}`}>{t("seeCustomer")}</Link>
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              try {
                await api.post(`/app/alerts/${a.id}/resolve`);
                await qc.invalidateQueries({ queryKey: ["alerts"] });
              } catch (e) {
                toast.error(errMsg(e));
              }
            }}
          >
            {t("resolve")}
          </Button>
        </div>
      ))}
    </Panel>
  );
}
