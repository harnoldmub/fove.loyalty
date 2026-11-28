"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Badge, PageHeader, Panel } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { formatDate, formatNumber, formatPrice } from "@/lib/utils";
import { DataLoader } from "@/components/navigation/data-loader";

interface Stats { tenants: number; suspended: number; newTenants30d: number; subscriptionsByStatus: Record<string, number>; activeByPlan: Record<string, number>; paying: number; free: number; mrrCents: number; customers: number; accounts: number; transactions30d: number }
interface TenantRow { id: string; name: string; slug: string; status: string; createdAt: string; settings?: { logoUrl: string | null; primaryColor: string } | null; subscription: { status: string; provider: string; plan: { code: string; name: string; kind: "FREE" | "PAID" | "CUSTOM" } } | null; _count: { customers: number; accounts: number; memberships: number } }

export default function AdminHome() {
  const t = useTranslations("admin.home");
  const [q, setQ] = useState("");
  const { data: stats, isLoading } = useQuery({ queryKey: ["admin-stats"], queryFn: () => api.get<Stats>("/admin/stats") });
  const { data: tenants = [] } = useQuery({ queryKey: ["admin-tenants", q], queryFn: () => api.get<TenantRow[]>(`/admin/tenants${q ? `?q=${encodeURIComponent(q)}` : ""}`) });
  if (isLoading) {
    return (
      <>
        <PageHeader title={t("title")} description={t("description")} />
        <DataLoader />
      </>
    );
  }
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      {stats && (
        <Panel className="mb-6 p-5">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
            {[
              [t("stats.tenants"), stats.tenants, t("stats.tenantsHelp", { count: stats.newTenants30d })],
              [t("stats.paying"), stats.paying, t("stats.payingHelp", { free: stats.free, trialing: stats.subscriptionsByStatus.TRIALING ?? 0 })],
              [t("stats.cards"), stats.accounts, t("stats.cardsHelp", { count: stats.transactions30d })],
              [t("stats.suspended"), stats.suspended, t("stats.suspendedHelp")],
            ].map(([l, v, help]) => (
              <div key={l as string} className="grid content-start gap-0.5">
                <dt className="text-sm text-ink-2">{l}</dt>
                <dd className="font-display text-3xl font-semibold tabular">{formatNumber(v as number)}</dd>
                <dd className="text-xs text-ink-3">{help}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 border-t border-line pt-4 text-sm text-ink-2">
            {t.rich("mrrNote", { amount: formatPrice(stats.mrrCents), strong: (chunks) => <strong className="text-ink tabular">{chunks}</strong> })}
          </p>
        </Panel>
      )}
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
        <Input type="search" aria-label={t("searchLabel")} placeholder={t("searchPlaceholder")} className="ps-10" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {/* Mobile : une ligne par entreprise ; le tableau complet à partir de la tablette. */}
      <Panel className="overflow-hidden md:hidden">
        <ul className="divide-y divide-line">
          {tenants.map((tenant) => (
            <li key={tenant.id}>
              <Link href={`/admin/tenants/${tenant.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface-2">
                {tenant.settings?.logoUrl ? (
                  <img src={tenant.settings.logoUrl} alt="" className="size-10 shrink-0 rounded-lg border border-line bg-surface object-cover" />
                ) : (
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg font-display text-sm font-bold text-white shadow-xs" style={{ background: tenant.settings?.primaryColor ?? "var(--cobalt)" }}>
                    {tenant.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">{tenant.name}</span>
                  <span className="block truncate text-sm text-ink-3">
                    {tenant.subscription ? tenant.subscription.plan.name : t("noPlan")} · {t("customersCount", { count: tenant._count.customers })}
                  </span>
                </span>
                {tenant.status === "SUSPENDED" ? (
                  <Badge tone="danger">{t("badges.suspended")}</Badge>
                ) : tenant.subscription?.status === "TRIALING" ? (
                  <Badge tone="cobalt">{t("badges.trial")}</Badge>
                ) : tenant.subscription?.status === "ACTIVE" && tenant.subscription.plan.kind !== "FREE" ? (
                  <Badge tone="mint">{t("badges.paid")}</Badge>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[680px] text-start text-sm">
          <thead className="text-ink-3">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">{t("table.tenant")}</th>
              <th scope="col" className="px-4 py-3 font-medium">{t("table.plan")}</th>
              <th scope="col" className="px-4 py-3 font-medium">{t("table.customers")}</th>
              <th scope="col" className="px-4 py-3 font-medium">{t("table.cards")}</th>
              <th scope="col" className="px-4 py-3 font-medium">{t("table.team")}</th>
              <th scope="col" className="px-4 py-3 font-medium">{t("table.createdAt")}</th>
              <th scope="col" className="px-4 py-3"><span className="sr-only">{t("table.actions")}</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {tenants.map((tenant) => {
              const subStatus = tenant.subscription?.status;
              const isTrial = subStatus === "TRIALING";
              const isActive = subStatus === "ACTIVE" && tenant.subscription?.plan.kind !== "FREE";

              return (
                <tr key={tenant.id} className="transition-colors hover:bg-surface-2">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {tenant.settings?.logoUrl ? (
                        <img src={tenant.settings.logoUrl} alt="" className="size-9 shrink-0 rounded-lg border border-line bg-surface object-cover" />
                      ) : (
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg font-display text-xs font-bold text-white shadow-xs" style={{ background: tenant.settings?.primaryColor ?? "var(--cobalt)" }}>
                          {tenant.name.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <div className="min-w-0">
                        <Link href={`/admin/tenants/${tenant.id}`} className="font-semibold text-ink hover:text-cobalt hover:underline block truncate">
                          {tenant.name}
                        </Link>
                        <span className="block text-xs text-ink-3">{tenant.slug}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {tenant.subscription ? (
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-ink">{tenant.subscription.plan.name}</span>
                        <Badge tone={isActive ? "mint" : isTrial ? "cobalt" : "neutral"}>
                          {isTrial ? t("badges.trial") : isActive ? t("badges.paid") : subStatus === "ACTIVE" ? t("badges.active") : tenant.subscription.status}
                        </Badge>
                      </div>
                    ) : (
                      <Badge tone="neutral">{t("badges.none")}</Badge>
                    )}
                    {tenant.status === "SUSPENDED" && <Badge tone="danger" className="ms-2">{t("badges.suspended")}</Badge>}
                  </td>
                  <td className="px-4 py-3 tabular font-semibold text-ink">{formatNumber(tenant._count.customers)}</td>
                  <td className="px-4 py-3 tabular text-ink-2">{formatNumber(tenant._count.accounts)}</td>
                  <td className="px-4 py-3 tabular text-ink-2">{tenant._count.memberships}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink-3">{formatDate(tenant.createdAt)}</td>
                  <td className="px-4 py-3 text-end">
                    <Button asChild variant="secondary" size="sm">
                      <Link href={`/admin/tenants/${tenant.id}`} aria-label={t("openNamed", { name: tenant.name })}>{t("open")}</Link>
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
