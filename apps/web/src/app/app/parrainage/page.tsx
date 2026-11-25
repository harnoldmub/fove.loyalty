"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Copy, MessageCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, PageHeader, Panel, Skeleton } from "@/components/ui/misc";
import { ErrorNote } from "@/components/ui/misc";
import { api, useErrorMessage } from "@/lib/api";
import { useActiveTenant, useMe } from "@/components/app/me-context";
import { formatDate, formatPrice } from "@/lib/utils";
import type { ReferralStatus, ReferralSummary } from "@/lib/referral";

const STATUS_TONE: Record<ReferralStatus, "neutral" | "cobalt" | "mint" | "stamp" | "danger"> = {
  SIGNED_UP: "neutral",
  PENDING: "cobalt",
  EARNED: "mint",
  CAPPED: "stamp",
  NO_PLAN: "stamp",
  CANCELLED: "danger",
  EXPIRED: "neutral",
};

/** Page « Parrainage » du commerçant (docs/chantier-parrainage.md, section 4). */
export default function ReferralPage() {
  const t = useTranslations("app.referralPage");
  const locale = useLocale();
  const toErrorMessage = useErrorMessage();
  const { data, isLoading, error } = useQuery({ queryKey: ["referrals"], queryFn: () => api.get<ReferralSummary>("/app/referrals") });
  const money = (cents: number) => formatPrice(cents, data?.currency ?? "USD", locale);
  const me = useMe();
  const tenant = useActiveTenant();
  // Candidature partenaire pré-remplie (le formulaire lit ces paramètres).
  const partnerApplyHref = `/partenaires/rejoindre?${new URLSearchParams({
    source: "referral",
    name: me.user.name,
    email: me.user.email,
    company: tenant?.name ?? "",
    strategy: t("partner.strategy", { company: tenant?.name ?? "" }),
  })}`;

  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <PageHeader title={t("title")} description={t("subtitle", { amount: data ? money(data.rewardCents) : "…" })} />
      {isLoading && <Skeleton className="h-64" />}
      {error && <ErrorNote>{toErrorMessage(error)}</ErrorNote>}
      {data && (
        <>
          {data.asReferee && (
            <Panel className="border border-mint/30 bg-mint-soft p-4 text-sm text-ink">
              {t("referee", { name: data.asReferee.referrerName, amount: money(data.asReferee.discountCents) })}
            </Panel>
          )}

          {data.partnerInvite && (
            <Panel className="grid gap-2 border border-cobalt/30 bg-cobalt-soft p-5">
              <h2 className="font-display text-lg font-semibold">{t(data.partnerInvite === "reached" ? "partner.reachedTitle" : "partner.approachingTitle")}</h2>
              <p className="text-sm text-ink-2">{t("partner.body")}</p>
              <div>
                <Button asChild>
                  <Link href={partnerApplyHref}>{t("partner.cta")}</Link>
                </Button>
              </div>
            </Panel>
          )}

          {data.available && data.link ? (
            <Panel className="grid gap-3 p-5">
              <h2 className="font-display text-lg font-semibold">{t("link.title")}</h2>
              <code className="break-all rounded-md bg-surface-2 px-3 py-2 text-sm" dir="ltr">
                {data.link}
              </code>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    void navigator.clipboard.writeText(data.link!);
                    toast.success(t("link.copied"));
                  }}
                >
                  <Copy aria-hidden /> {t("link.copy")}
                </Button>
                <Button asChild className="bg-[#25D366] text-white hover:bg-[#20ba59]">
                  <a href={`https://wa.me/?text=${encodeURIComponent(t("link.message", { url: data.link, amount: money(data.rewardCents) }))}`} target="_blank" rel="noopener noreferrer">
                    <MessageCircle aria-hidden /> {t("link.share")}
                  </a>
                </Button>
              </div>
            </Panel>
          ) : (
            <Panel className="grid gap-3 p-5">
              <h2 className="font-display text-lg font-semibold">{t("locked.title")}</h2>
              <p className="text-sm text-ink-2">{t("locked.body", { amount: money(data.rewardCents) })}</p>
              <div>
                <Button asChild>
                  <Link href="/app/billing">{t("locked.cta")}</Link>
                </Button>
              </div>
            </Panel>
          )}

          <section className="grid gap-3" aria-labelledby="gains">
            <h2 id="gains" className="font-display text-lg font-semibold">
              {t("gains.title")}
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <Panel className="grid gap-1 p-4">
                <span className="text-xs text-ink-3">{t("gains.available")}</span>
                <span className="font-display text-2xl font-semibold tabular-nums">{money(data.credit.availableCents)}</span>
                <span className="text-xs text-ink-3">{t("gains.availableHint")}</span>
              </Panel>
              <Panel className="grid gap-1 p-4">
                <span className="text-xs text-ink-3">{t("gains.earned")}</span>
                <span className="font-display text-2xl font-semibold tabular-nums">{money(data.credit.earnedCents)}</span>
                <span className="text-xs text-ink-3">{t("gains.pending", { count: data.credit.pendingCount })}</span>
              </Panel>
              <Panel className="grid gap-1 p-4">
                <span className="text-xs text-ink-3">{t("gains.used")}</span>
                <span className="font-display text-2xl font-semibold tabular-nums">{money(data.credit.usedCents)}</span>
                {data.credit.nextExpiry && <span className="text-xs text-ink-3">{t("gains.nextExpiry", { date: formatDate(data.credit.nextExpiry, false, locale) })}</span>}
              </Panel>
            </div>
            {data.available && (
              <Panel className="grid gap-2 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium">{t("gains.year", { year: data.year.year })}</span>
                  <span className="tabular-nums text-ink-2">{t("gains.yearProgress", { earned: money(data.year.earnedCents), cap: money(data.year.capCents) })}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={data.year.capCents} aria-valuenow={data.year.earnedCents}>
                  <div className="h-full rounded-full bg-mint" style={{ width: `${Math.min(100, Math.round((data.year.earnedCents / Math.max(1, data.year.capCents)) * 100))}%` }} />
                </div>
                {data.year.remainingCents === 0 && <p className="text-xs text-ink-2">{t("gains.yearReached", { year: data.year.year })}</p>}
              </Panel>
            )}
          </section>

          <section className="grid gap-3" aria-labelledby="filleuls">
            <h2 id="filleuls" className="font-display text-lg font-semibold">
              {t("list.title")}
            </h2>
            {data.referrals.length === 0 ? (
              <Panel className="p-4 text-sm text-ink-2">{t("list.empty")}</Panel>
            ) : (
              <Panel className="overflow-x-auto p-0">
                <table className="w-full text-sm">
                  <thead className="text-start text-xs text-ink-3">
                    <tr className="border-b border-line">
                      <th className="px-4 py-2 text-start font-medium">{t("list.name")}</th>
                      <th className="px-4 py-2 text-start font-medium">{t("list.signedUp")}</th>
                      <th className="px-4 py-2 text-start font-medium">{t("list.status")}</th>
                      <th className="px-4 py-2 text-end font-medium">{t("list.amount")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.referrals.map((r) => (
                      <tr key={r.id} className="border-b border-line last:border-0">
                        <td className="px-4 py-2 font-medium">{r.name}</td>
                        <td className="px-4 py-2 text-ink-2">{formatDate(r.signedUpAt, false, locale)}</td>
                        <td className="px-4 py-2">
                          <Badge tone={STATUS_TONE[r.status]}>
                            {t(`status.${r.status}`, { date: r.pendingUntil ? formatDate(r.pendingUntil, false, locale) : "" })}
                          </Badge>
                        </td>
                        <td className="px-4 py-2 text-end tabular-nums">{r.amountCents > 0 ? money(r.amountCents) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            )}
          </section>

          <section className="grid gap-3" aria-labelledby="conditions">
            <h2 id="conditions" className="font-display text-lg font-semibold">
              {t("terms.title")}
            </h2>
            <Panel className="p-5">
              <ol className="grid list-decimal gap-2 ps-5 text-sm leading-relaxed text-ink-2">
                {(t.raw("terms.items") as string[]).map((item, i) => {
                  // « Titre. Texte » : le titre en gras.
                  const cut = item.indexOf(". ");
                  return (
                    <li key={i}>
                      {cut > 0 ? (
                        <>
                          <strong className="text-ink">{item.slice(0, cut + 1)}</strong>
                          {item.slice(cut + 1)}
                        </>
                      ) : (
                        item
                      )}
                    </li>
                  );
                })}
              </ol>
            </Panel>
          </section>
        </>
      )}
    </div>
  );
}
