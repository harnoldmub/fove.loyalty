"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Building2, QrCode, ScanLine, Sparkles, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, Panel, Skeleton } from "@/components/ui/misc";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { useActiveTenant, useCan } from "./me-context";
import { TenantWalletBroadcast } from "./card-share";
import { UpgradeCard } from "./upgrade";

interface Overview {
  periodDays: number;
  members: number;
  newMembers: number;
  pointsDistributed: number;
  pointsUsed: number;
  rewardsRedeemed: number;
  returningCustomers: number;
  segments?: {
    VIP: number;
    REGULAR: number;
    NEW: number;
    AT_RISK: number;
    DORMANT: number;
  };
  atRiskCount?: number;
  establishments?: {
    id: string;
    name: string;
    city: string | null;
    scans: number;
    points: number;
  }[];
  daily: { day: string; visits: number; points: number; enrollments: number }[];
}

function Stat({ label, value, help }: { label: string; value: number; help: string }) {
  return (
    <div className="grid gap-1">
      <dt className="text-sm text-ink-2">{label}</dt>
      <dd className="font-display text-3xl font-semibold tabular">{formatNumber(value)}</dd>
      <dd className="text-xs text-ink-3">{help}</dd>
    </div>
  );
}

function ActivityChart({ daily }: { daily: Overview["daily"] }) {
  const t = useTranslations("app.overview.chart");
  const format = useFormatter();
  const shortDay = (day: string) => format.dateTime(new Date(day), { day: "numeric", month: "short" });
  const max = Math.max(1, ...daily.map((d) => d.visits));
  const total = daily.reduce((s, d) => s + d.visits, 0);
  return (
    <figure className="grid gap-3">
      <figcaption className="flex items-baseline justify-between">
        <span className="font-display text-lg font-semibold">{t("title")}</span>
        <span className="text-sm text-ink-3 tabular">{t("total", { total: formatNumber(total) })}</span>
      </figcaption>
      <div className="flex h-40 items-end gap-[2px]" role="img" aria-label={t("ariaLabel", { max })}>
        {daily.map((d) => (
          <div key={d.day} className="group relative flex-1">
            <div
              className="w-full rounded-t-[3px] bg-cobalt/85 transition-colors group-hover:bg-cobalt"
              style={{ height: `${Math.max(d.visits ? 4 : 1, (d.visits / max) * 160)}px`, opacity: d.visits ? 1 : 0.25 }}
            />
            <span className="pointer-events-none absolute bottom-full start-1/2 z-10 mb-1 hidden -translate-x-1/2 rtl:translate-x-1/2 whitespace-nowrap rounded-sm bg-ink px-2 py-1 text-xs text-paper group-hover:block">
              {t("tooltip", { day: shortDay(d.day), count: d.visits })}
            </span>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-xs text-ink-3">
        <span>{daily[0] && shortDay(daily[0].day)}</span>
        <span>{t("today")}</span>
      </div>
      <table className="sr-only">
        <caption>{t("caption")}</caption>
        <tbody>
          {daily.map((d) => (
            <tr key={d.day}>
              <th scope="row">{d.day}</th>
              <td>{d.visits}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export function OverviewView({ mode }: { mode: "home" | "analytics" }) {
  const t = useTranslations("app.overview");
  const tenant = useActiveTenant();
  const canScan = useCan("transactions.create");
  const canWrite = useCan("customers.write");
  const canRead = useCan("analytics.read");
  const canManagePrograms = useCan("programs.write");
  const [days, setDays] = useState("30");
  const { data, isLoading } = useQuery({
    queryKey: ["overview", days],
    queryFn: () => api.get<Overview>(`/app/analytics/overview?days=${days}`),
    enabled: canRead,
  });

  if (!canRead) {
    return (
      <EmptyState
        icon={<ScanLine />}
        title={t("staff.title", { name: tenant?.name ?? "" })}
        action={
          <Button asChild size="lg">
            <Link href="/app/scanner">{t("scanCard")}</Link>
          </Button>
        }
      >
        {t("staff.body")}
      </EmptyState>
    );
  }

  const segments = data?.segments;
  const totalClassified = segments ? segments.VIP + segments.REGULAR + segments.NEW + segments.AT_RISK + segments.DORMANT : 0;

  return (
    <>
      <PageHeader
        title={mode === "home" ? (tenant?.name ?? t("title")) : t("analyticsTitle")}
        description={mode === "home" ? t("homeDescription") : t("analyticsDescription")}
        actions={
          mode === "home" ? (
            <>
              {canScan && (
                <Button asChild>
                  <Link href="/app/scanner">
                    <ScanLine /> {t("scanCard")}
                  </Link>
                </Button>
              )}
              {canWrite && (
                <Button asChild variant="secondary">
                  <Link href="/app/customers?new=1">
                    <UserPlus /> {t("newCustomer")}
                  </Link>
                </Button>
              )}
              {canManagePrograms && <TenantWalletBroadcast />}
            </>
          ) : (
            <Tabs value={days} onValueChange={setDays}>
              <TabsList aria-label={t("period")}>
                <TabsTrigger value="7">{t("days", { count: 7 })}</TabsTrigger>
                <TabsTrigger value="30">{t("days", { count: 30 })}</TabsTrigger>
                <TabsTrigger value="90">{t("days", { count: 90 })}</TabsTrigger>
              </TabsList>
            </Tabs>
          )
        }
      />

      {isLoading || !data ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : data.members === 0 ? (
        <EmptyState
          icon={<QrCode />}
          title={t("empty.title")}
          action={
            <Button asChild>
              <Link href="/app/programs">{t("empty.action")}</Link>
            </Button>
          }
        >
          {t("empty.body")}
        </EmptyState>
      ) : (
        <div className="grid gap-6">
          {/* Métriques clés */}
          <Panel className="p-5 sm:p-6">
            <dl className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-6">
              <Stat label={t("stats.members")} value={data.members} help={t("stats.membersHelp")} />
              <Stat label={t("stats.newMembers")} value={data.newMembers} help={t("stats.newMembersHelp", { count: data.periodDays })} />
              <Stat label={t("stats.returning")} value={data.returningCustomers} help={t("stats.returningHelp")} />
              <Stat label={t("stats.distributed")} value={data.pointsDistributed} help={t("stats.distributedHelp")} />
              <Stat label={t("stats.used")} value={data.pointsUsed} help={t("stats.usedHelp")} />
              <Stat label={t("stats.rewards")} value={data.rewardsRedeemed} help={t("stats.rewardsHelp")} />
            </dl>
          </Panel>

          {/* Graphique d'activité journalière */}
          <Panel className="p-5 sm:p-6">
            <ActivityChart daily={data.daily} />
          </Panel>

          {/* Intelligence RFM & Segmentation Sidely */}
          {segments && totalClassified > 0 && (
            <div className="grid gap-6 lg:grid-cols-2">
              <Panel className="p-5 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Users className="size-5 text-cobalt" />
                    <h2 className="font-display text-lg font-semibold">{t("segments.title")}</h2>
                  </div>
                  <Button asChild variant="ghost" size="sm" className="text-xs">
                    <Link href="/app/customers">{t("segments.view")}</Link>
                  </Button>
                </div>

                <div className="grid gap-3 text-sm">
                  <div className="flex items-center justify-between p-2 rounded-md bg-surface">
                    <span className="flex items-center gap-2">
                      <Sparkles className="size-4 text-cobalt" />
                      <span>{t("segments.vip")}</span>
                    </span>
                    <span className="font-semibold tabular">{segments.VIP}</span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-md bg-surface">
                    <span className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-mint" />
                      <span>{t("segments.regular")}</span>
                    </span>
                    <span className="font-semibold tabular">{segments.REGULAR}</span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-md bg-surface">
                    <span className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-mint/50" />
                      <span>{t("segments.new")}</span>
                    </span>
                    <span className="font-semibold tabular">{segments.NEW}</span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-md bg-stamp-soft border border-stamp/40">
                    <span className="flex items-center gap-2 text-stamp-ink dark:text-stamp">
                      <AlertTriangle className="size-4" />
                      <span className="font-medium">{t("segments.atRisk")}</span>
                    </span>
                    <span className="font-semibold tabular text-stamp-ink dark:text-stamp">{segments.AT_RISK}</span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-md bg-surface">
                    <span className="flex items-center gap-2 text-ink-3">
                      <span className="size-2 rounded-full bg-ink-3" />
                      <span>{t("segments.dormant")}</span>
                    </span>
                    <span className="font-semibold tabular text-ink-3">{segments.DORMANT}</span>
                  </div>
                </div>

                {segments.AT_RISK > 0 && (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md bg-stamp-soft p-3 text-sm text-stamp-ink dark:text-stamp">
                    <span>{t.rich("segments.atRiskAlert", { count: segments.AT_RISK, strong: (c) => <strong>{c}</strong> })}</span>
                    <Button asChild size="sm" variant="secondary" className="shrink-0">
                      <Link href="/app/customers">{t("segments.remind")}</Link>
                    </Button>
                  </div>
                )}
              </Panel>

              {/* Performance par Établissement (Retail SFA) */}
              <Panel className="p-5 sm:p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Building2 className="size-5 text-cobalt" />
                  <h2 className="font-display text-lg font-semibold">{t("establishments.title")}</h2>
                </div>

                {data.establishments && data.establishments.length > 0 ? (
                  <div className="grid gap-3">
                    {data.establishments.map((est) => (
                      <div key={est.id} className="flex items-center justify-between p-3 rounded-md bg-surface border border-line">
                        <div>
                          <p className="font-medium text-ink">{est.name}</p>
                          <p className="text-xs text-ink-3">{est.city || t("establishments.mainShop")}</p>
                        </div>
                        <div className="text-end">
                          <p className="font-semibold tabular text-ink">{t("establishments.scans", { count: est.scans, formatted: formatNumber(est.scans) })}</p>
                          <p className="text-xs text-ink-3 tabular">{t("establishments.points", { formatted: formatNumber(est.points) })}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-ink-3">{t("establishments.single")}</p>
                )}
              </Panel>
            </div>
          )}
        </div>
      )}
      {mode === "home" && <UpgradeCard />}
    </>
  );
}
