"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Suspense, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { ReferralSummary } from "@/lib/referral";
import { toast } from "sonner";
import { BILLING_CURRENCIES, PAST_DUE_GRACE_DAYS, type BillingCurrency } from "@fove/shared";
import { useCan } from "@/components/app/me-context";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Badge, PageHeader, Panel, Skeleton } from "@/components/ui/misc";
import { api, useErrorMessage } from "@/lib/api";
import { clearPlanChoice } from "@/lib/plan-choice";
import { cn, formatDate, formatNumber, formatPrice } from "@/lib/utils";

interface Plan {
  id: string;
  code: string;
  kind: "FREE" | "PAID" | "CUSTOM";
  name: string;
  description: string;
  /** Prix annuel par monnaie. */
  prices: Partial<Record<BillingCurrency, number>>;
  limits: Record<string, number | null>;
}
interface Billing {
  mode: "stripe" | "mock" | "unavailable";
  subscription: {
    status: string;
    interval: "MONTH" | "YEAR";
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    pastDueSince: string | null;
    provider: "STRIPE" | "MOCK" | "MANUAL";
    plan: Plan;
    /** Offre inférieure choisie, appliquée au renouvellement. */
    scheduledPlan: { code: string; name: string } | null;
  } | null;
  /** Offre dont l'entreprise a réellement les droits (Gratuit après une résiliation, un impayé prolongé…). */
  currentPlan: { code: string; name: string; kind: Plan["kind"] };
  plans: Plan[];
  usage: Record<string, number>;
  limits: Record<string, number | null>;
  currency: {
    /** Monnaie choisie (ou celle du pays) : prix affichés et règlement hors ligne. */
    billing: BillingCurrency;
    /** Monnaie d'un paiement en ligne (USD ou EUR). */
    online: "USD" | "EUR";
    /** Monnaie de l'abonnement en cours, fixe jusqu'au renouvellement. */
    subscription: string | null;
  };
}

const STATUS_TONE: Record<string, "mint" | "stamp" | "danger" | "neutral"> = {
  TRIALING: "stamp",
  ACTIVE: "mint",
  PAST_DUE: "danger",
  CANCELED: "neutral",
  INCOMPLETE: "neutral",
};
const USAGE_KEYS = ["customers", "establishments", "staff", "programs"] as const;

function BillingView() {
  const toErrorMessage = useErrorMessage();
  const t = useTranslations("app.billing");
  const params = useSearchParams();
  const router = useRouter();
  const canWrite = useCan("billing.write");
  const qc = useQueryClient();
  const interval = "YEAR" as const;
  const [pending, setPending] = useState<string | null>(null);
  // Retour de Stripe : l'offre change à réception du webhook, quelques secondes plus tard.
  const awaitingStripe = params.get("checkout") === "success";
  const { data } = useQuery({
    queryKey: ["billing"],
    queryFn: () => api.get<Billing>("/app/billing"),
    refetchInterval: (q) => (awaitingStripe && q.state.data?.subscription?.provider !== "STRIPE" && q.state.dataUpdateCount < 10 ? 3000 : false),
  });

  // Parrainage : remise du filleul sur sa première souscription annuelle, affichée avant le paiement.
  const tReferral = useTranslations("app.referralPage");
  const locale = useLocale();
  const { data: referral } = useQuery({ queryKey: ["referrals"], queryFn: () => api.get<ReferralSummary>("/app/referrals") });

  // Offre choisie sur la page tarifs avant l'inscription : on lance son paiement, une seule fois.
  const wanted = params.get("offre");
  const [launching, setLaunching] = useState<string | null>(null);
  const launched = useRef(false);
  useEffect(() => {
    if (!wanted || !data || launched.current) return;
    launched.current = true;
    clearPlanChoice();
    const plan = data.plans.find((p) => p.code === wanted && p.kind === "PAID");
    const sub = data.subscription;
    const alreadyPaying = sub?.provider === "STRIPE" && sub.status !== "CANCELED" && sub.plan.code === data.currentPlan.code;
    // Déjà abonné : le changement d'offre facturé au prorata passe par la confirmation de la carte.
    if (!plan || !canWrite || data.mode === "unavailable" || alreadyPaying || data.currentPlan.code === plan.code) {
      router.replace("/app/billing");
      return;
    }
    void (async () => {
      setLaunching(plan.name);
      try {
        const res = await api.post<{ url: string }>("/app/billing/checkout", { planCode: plan.code, interval: "YEAR" });
        if (data.mode === "stripe") {
          window.location.assign(res.url);
          return;
        }
        await qc.invalidateQueries({ queryKey: ["billing"] });
        toast.success(t("toasts.mockActivated", { name: plan.name }));
      } catch (e) {
        toast.error(toErrorMessage(e));
      }
      setLaunching(null);
      router.replace("/app/billing");
    })();
  }, [wanted, data, canWrite, qc, router, t, toErrorMessage]);

  useEffect(() => {
    const c = params.get("checkout");
    if (c === "success") toast.success(t("toasts.paid"));
    if (c === "mock" || c === "updated") toast.success(t("toasts.updated"));
    if (c === "scheduled") toast.success(t("toasts.scheduled"));
    if (c === "cancelled") toast.message(t("toasts.cancelled"));
  }, [params, t]);

  if (!data) return <Skeleton className="h-96" />;
  if (launching) {
    return (
      <Panel className="grid place-items-center gap-2 p-10 text-center">
        <p className="font-display text-xl font-semibold">{t("launching", { name: launching })}</p>
        <p className="text-ink-2">{t("openingCheckout")}</p>
      </Panel>
    );
  }
  const sub = data.subscription;
  const current = data.currentPlan;
  // Abonnement terminé (résilié, impayé prolongé) : on affiche l'offre réellement appliquée.
  const subApplies = sub !== null && sub.plan.code === current.code;
  const status = subApplies && sub && STATUS_TONE[sub.status] ? { tone: STATUS_TONE[sub.status]!, label: t(`status.${sub.status}`) } : null;
  const managedByFove = sub !== null && (sub.plan.kind === "CUSTOM" || sub.provider === "MANUAL") && subApplies && current.kind !== "FREE";
  const stripeSubscriber = sub?.provider === "STRIPE" && subApplies && sub.status !== "CANCELED";
  const canCancel = subApplies && sub !== null && sub.plan.kind === "PAID" && !managedByFove && ["ACTIVE", "PAST_DUE"].includes(sub.status) && !sub.cancelAtPeriodEnd;
  const canResume = subApplies && sub !== null && sub.cancelAtPeriodEnd && sub.status !== "CANCELED";
  const graceEnd = sub?.status === "PAST_DUE" && sub.pastDueSince ? new Date(new Date(sub.pastDueSince).getTime() + PAST_DUE_GRACE_DAYS * 86_400_000) : null;
  // Abonnement payé en cours : choisir une autre offre la modifie (supérieure tout de suite, inférieure au renouvellement).
  const paidRunning = subApplies && sub !== null && sub.plan.kind === "PAID" && !managedByFove && sub.status !== "CANCELED" && sub.status !== "INCOMPLETE";
  const scheduled = paidRunning ? (sub?.scheduledPlan ?? null) : null;
  const renewal = sub?.currentPeriodEnd ? formatDate(sub.currentPeriodEnd) : t("periodEnd");

  const refresh = () => qc.invalidateQueries({ queryKey: ["billing"] });

  // Prix dans la monnaie de l'abonnement en cours (fixe jusqu'au renouvellement), sinon dans celle du commerce.
  const priceCurrency = (data.currency.subscription ?? data.currency.billing) as BillingCurrency;
  const priceOf = (p: Plan, currency: BillingCurrency = priceCurrency) => p.prices[currency];
  const money = (cents: number | undefined, currency: string = priceCurrency) => (cents === undefined ? "—" : formatPrice(cents, currency, locale));
  const subPlanPrice = sub ? data.plans.find((p) => p.code === sub.plan.code)?.prices[priceCurrency] : undefined;
  // Monnaie locale (MAD, DZD, CDF) sans abonnement en cours : le paiement en ligne se fait au prix en euros ou en dollars.
  const localCurrency = !data.currency.subscription && data.currency.online !== data.currency.billing;

  const changeCurrency = async (currency: BillingCurrency) => {
    try {
      const res = await api.post<{ effective: "now" | "renewal" }>("/app/billing/currency", { currency });
      await refresh();
      toast.success(res.effective === "renewal" ? t("currency.savedRenewal", { date: renewal }) : t("currency.saved"));
    } catch (e) {
      toast.error(toErrorMessage(e));
    }
  };

  /** Ce qui dépasse les quotas de l'offre visée : rien n'est supprimé, mais plus rien ne peut être ajouté. */
  const overQuota = (p: Plan) =>
    USAGE_KEYS.filter((k) => p.limits[k] != null && (data.usage[k] ?? 0) > p.limits[k]!).map((k) =>
      t("overQuotaItem", { label: t(`usageInline.${k}`), used: formatNumber(data.usage[k] ?? 0), included: formatNumber(p.limits[k]!) }),
    );

  const cancelScheduled = async () => {
    try {
      await api.post("/app/billing/scheduled-change/cancel");
      await refresh();
      toast.success(t("toasts.scheduledCancelled", { name: current.name }));
    } catch (e) {
      toast.error(toErrorMessage(e));
    }
  };

  const choose = async (code: string) => {
    setPending(code);
    try {
      const res = await api.post<{ url: string; mode: string; effective?: "now" | "renewal" }>("/app/billing/checkout", { planCode: code, interval });
      const name = data.plans.find((p) => p.code === code)?.name ?? code;
      if (data.mode === "stripe" && !paidRunning) window.location.assign(res.url);
      else if (res.effective === "renewal") await refresh().then(() => toast.success(t("toasts.downgradeScheduled", { name, date: renewal })));
      else await refresh().then(() => toast.success(data.mode === "stripe" ? t("toasts.changed") : t("toasts.changedMock")));
    } catch (e) {
      toast.error(toErrorMessage(e));
    } finally {
      setPending(null);
    }
  };

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      {referral?.asReferee && (
        <p className="mb-6 rounded-md bg-mint-soft px-4 py-3 text-sm text-ink">
          {tReferral("referee", { name: referral.asReferee.referrerName, amount: formatPrice(referral.asReferee.discountCents, referral.currency, locale) })}
        </p>
      )}
      {data.mode === "mock" && (
        <p className="mb-6 rounded-md bg-stamp-soft px-4 py-3 text-sm text-stamp-ink dark:text-stamp">
          {t("mockMode")}
        </p>
      )}
      {data.mode === "unavailable" && <p className="mb-6 rounded-md bg-surface-2 px-4 py-3 text-sm">{t("unavailable")}</p>}
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Panel className="p-5 sm:p-6">
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-2xl font-semibold">{current.name}</h2>
              {status ? <Badge tone={status.tone}>{status.label}</Badge> : <Badge tone="mint">{t("status.ACTIVE")}</Badge>}
            </div>
            <p className="text-ink-2">
              {sub && !subApplies && `${t("summary.ended", { name: sub.plan.name })} `}
              {current.kind === "FREE" && subApplies && `${t("summary.free")} `}
              {subApplies && sub?.status === "TRIALING" && sub.trialEndsAt && `${t("summary.trial", { date: formatDate(sub.trialEndsAt) })} `}
              {subApplies && sub?.currentPeriodEnd && current.kind !== "FREE" &&
                `${sub.cancelAtPeriodEnd
                  ? t("summary.cancelRequested", { date: formatDate(sub.currentPeriodEnd) })
                  : managedByFove
                    ? t("summary.contract", { date: formatDate(sub.currentPeriodEnd) })
                    : scheduled
                      ? t("summary.scheduled", { name: scheduled.name, date: formatDate(sub.currentPeriodEnd), current: current.name })
                      : t("summary.renewal", { date: formatDate(sub.currentPeriodEnd) })} `}
              {graceEnd && subApplies && t("summary.grace", { date: formatDate(graceEnd) })}
              {managedByFove && t("summary.managed")}
            </p>
            {canWrite && (
              <div className="mt-3 flex flex-wrap gap-2">
                {data.mode === "stripe" && sub?.provider === "STRIPE" && (
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      try {
                        const { url } = await api.post<{ url: string }>("/app/billing/portal");
                        window.location.assign(url);
                      } catch (e) {
                        toast.error(toErrorMessage(e));
                      }
                    }}
                  >
                    {t("portal")}
                  </Button>
                )}
                {scheduled && (
                  <Button variant="secondary" onClick={cancelScheduled}>
                    {t("stayOn", { name: current.name })}
                  </Button>
                )}
                {canResume && (
                  <Button
                    onClick={async () => {
                      try {
                        await api.post("/app/billing/resume");
                        await refresh();
                        toast.success(t("toasts.resumed"));
                      } catch (e) {
                        toast.error(toErrorMessage(e));
                      }
                    }}
                  >
                    {t("resume")}
                  </Button>
                )}
                {canCancel && (
                  <ConfirmDialog
                    trigger={<Button variant="ghost">{t("cancel")}</Button>}
                    title={t("cancelTitle")}
                    consequence={t("cancelConsequence")}
                    confirmLabel={t("cancel")}
                    destructive
                    onConfirm={async () => {
                      await api.post("/app/billing/cancel");
                      await refresh();
                      toast.success(t("toasts.cancelSaved"));
                    }}
                  />
                )}
              </div>
            )}
          </div>
        </Panel>
        <Panel className="p-5 sm:p-6">
          <h2 className="mb-4 font-display text-lg font-semibold">{t("usage")}</h2>
          <dl className="grid gap-3">
            {USAGE_KEYS.map((k) => {
              const used = data.usage[k] ?? 0;
              const limit = data.limits[k];
              return (
                <div key={k} className="grid gap-1">
                  <div className="flex justify-between text-sm">
                    <dt className="text-ink-2">{t(`usageLabels.${k}`)}</dt>
                    <dd className="tabular">{formatNumber(used)} {limit === null ? "" : `/ ${formatNumber(limit ?? 0)}`}</dd>
                  </div>
                  {limit !== null && limit !== undefined && (
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <div className={cn("h-full rounded-full", used >= limit ? "bg-danger" : "bg-cobalt")} style={{ width: `${Math.min(100, (used / limit) * 100)}%` }} />
                    </div>
                  )}
                </div>
              );
            })}
          </dl>
        </Panel>
      </div>

      {canWrite && !managedByFove && (
        <section className="mt-10" aria-labelledby="offres">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="offres" className="font-display text-2xl font-semibold">{t("changePlan")}</h2>
              <p className="text-sm text-ink-2">{t("annual")}</p>
            </div>
            <label className="grid gap-1 text-sm">
              <span className="text-ink-2">{t("currency.label")}</span>
              <select
                className="h-10 rounded-[var(--radius)] border border-line bg-surface px-3 text-sm"
                value={data.currency.billing}
                onChange={(e) => void changeCurrency(e.target.value as BillingCurrency)}
              >
                {BILLING_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {t(`currency.names.${c}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {data.currency.subscription && data.currency.subscription !== data.currency.billing && (
            <p className="mb-4 rounded-md bg-surface-2 px-4 py-3 text-sm text-ink-2">
              {t("currency.pending", { current: t(`currency.names.${data.currency.subscription}`), next: t(`currency.names.${data.currency.billing}`), date: renewal })}
            </p>
          )}
          {localCurrency && (
            <p className="mb-4 rounded-md bg-surface-2 px-4 py-3 text-sm text-ink-2">
              {t("currency.localNote", { currency: t(`currency.names.${data.currency.billing}`), online: t(`currency.names.${data.currency.online}`) })}
            </p>
          )}
          <div className="grid gap-4 md:grid-cols-3">
            {data.plans.filter((p) => p.kind === "PAID").map((p) => {
              const isCurrent = current.code === p.code && subApplies && sub?.status !== "CANCELED";
              const isScheduled = scheduled?.code === p.code;
              const disabled = isCurrent || isScheduled || data.mode === "unavailable";
              const downgrade = paidRunning && sub !== null && (priceOf(p) ?? 0) < (subPlanPrice ?? 0);
              const label = isCurrent ? t("plan.current") : isScheduled ? t("plan.scheduled", { date: renewal }) : downgrade ? t("plan.downgrade", { name: p.name }) : t("plan.upgrade", { name: p.name });
              const over = downgrade ? overQuota(p) : [];
              return (
                <Panel key={p.id} className={cn("grid gap-3 p-5", isCurrent && "ring-2 ring-cobalt")}>
                  <h3 className="font-display text-xl font-semibold">{p.name}</h3>
                  <p className="text-sm text-ink-2">{p.description}</p>
                  <p className="font-display text-3xl font-semibold tabular">
                    {money(priceOf(p))}
                    <span className="text-base font-normal text-ink-3"> {t("plan.perYear")}</span>
                  </p>
                  {localCurrency && p.prices[data.currency.online] !== undefined && (
                    <p className="-mt-2 text-sm text-ink-3">{t("currency.online", { price: money(p.prices[data.currency.online], data.currency.online) })}</p>
                  )}
                  {downgrade && !disabled ? (
                    // Offre inférieure : rien ne change avant le renouvellement, et rien n'est remboursé.
                    <ConfirmDialog
                      trigger={<Button variant="secondary" loading={pending === p.code}>{label}</Button>}
                      title={t("downgrade.title", { name: p.name })}
                      consequence={[
                        t("downgrade.keep", { current: current.name, date: renewal, name: p.name, price: money(priceOf(p)) }),
                        over.length ? ` ${t("downgrade.over", { name: p.name, items: over.join(", ") })}` : "",
                        ` ${t("downgrade.undo")}`,
                      ].join("")}
                      confirmLabel={t("downgrade.confirm", { name: p.name })}
                      onConfirm={() => choose(p.code)}
                    />
                  ) : stripeSubscriber && !disabled ? (
                    // Abonné Stripe, offre supérieure : effet immédiat et facturé au prorata, on confirme avant.
                    <ConfirmDialog
                      trigger={<Button loading={pending === p.code}>{label}</Button>}
                      title={t("upgrade.title", { name: p.name })}
                      consequence={t("upgrade.consequence", { date: renewal, price: money(priceOf(p)) })}
                      confirmLabel={t("plan.upgrade", { name: p.name })}
                      onConfirm={() => choose(p.code)}
                    />
                  ) : (

                    <Button variant={isCurrent || isScheduled ? "secondary" : "primary"} disabled={disabled}
 loading={pending === p.code} onClick={() => choose(p.code)}>
                      {label}
                    </Button>
                  )}
                </Panel>
              );
            })}
          </div>
          <p className="mt-4 text-sm text-ink-2">
            {t.rich("custom", {
              link: (c) => (
                <Link href="/contact?offre=sur-mesure" className="font-medium text-cobalt underline-offset-4 hover:underline">
                  {c}
                </Link>
              ),
            })}
          </p>
        </section>
      )}
    </>
  );
}

export default function BillingPage() {
  return (
    <Suspense>
      <BillingView />
    </Suspense>
  );
}
