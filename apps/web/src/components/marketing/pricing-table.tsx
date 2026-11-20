"use client";

import Link from "next/link";
import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { PlanFeatures, PlanLimits, QuotaKey } from "@fove/shared";
import { Button } from "@/components/ui/button";
import { cn, formatNumber, formatPrice } from "@/lib/utils";
import { useMarketingCurrency } from "@/lib/marketing-currency";
import { CurrencyToggle } from "./currency-toggle";

export interface Plan {
  code: string;
  kind: "FREE" | "PAID" | "CUSTOM";
  name: string;
  currency: string;
  priceYearlyCents: number;
  features: Partial<PlanFeatures>;
  limits: PlanLimits;
}

const FEATURED = "business";

/** Quantités incluses : un chiffre par offre. */
const QUOTA_ROWS: QuotaKey[] = ["customers", "establishments", "staff", "programs"];

/** Fonctions : incluse ou non. */
const FEATURE_ROWS: { key: string; included: (f: Partial<PlanFeatures>) => boolean }[] = [
  { key: "cards", included: () => true },
  { key: "wallet", included: () => true },
  { key: "exports", included: (f) => Boolean(f.exports) },
  { key: "widget", included: (f) => Boolean(f.widget) },
  { key: "removeBranding", included: (f) => Boolean(f.removeBranding) },
  { key: "walletCampaigns", included: (f) => Boolean(f.walletCampaigns) },
  { key: "whatsappAuto", included: (f) => Boolean(f.whatsappAuto) },
  { key: "api", included: (f) => Boolean(f.api) },
  { key: "integrations", included: (f) => Boolean(f.integrations) },
];

type T = ReturnType<typeof useTranslations>;

function quota(t: T, plan: Plan, key: QuotaKey): string {
  if (plan.kind === "CUSTOM") return t("custom");
  const n = plan.limits[key];
  if (n === null) return t("unlimited");
  if (key === "staff" && n === 1) return t("staffSelf");
  return formatNumber(n);
}

function cta(t: T, plan: Plan, currency: string): { href: string; label: string } {
  if (plan.kind === "CUSTOM") return { href: "/contact?offre=sur-mesure", label: t("contactUs") };
  if (plan.kind === "FREE") return { href: "/signup", label: t("start") };
  return { href: `/signup?offre=${plan.code}&currency=${currency}`, label: t("choose", { name: plan.name }) };
}

const stickyCol = "sticky start-0 z-10 bg-surface";

export function PricingTable({ plans }: { plans: Plan[] }) {
  const t = useTranslations("marketing.pricing");
  const { currency, isEuro } = useMarketingCurrency();
  const featuredCell = (plan: Plan) => plan.code === FEATURED && "bg-cobalt-soft/50";

  const groupRow = (label: string) => (
    <tr>
      <th scope="colgroup" colSpan={plans.length + 1} className="bg-surface-2 px-5 py-2.5 text-start text-xs font-semibold text-ink-3">
        <span className="sticky start-5">{label}</span>
      </th>
    </tr>
  );

  const row = (key: string, label: string, cells: (plan: Plan) => ReactNode) => (
    <tr key={key} className="border-t border-line">
      <th scope="row" className={cn(stickyCol, "px-5 py-3.5 text-start font-normal text-ink-2")}>
        {label}
      </th>
      {plans.map((plan) => (
        <td key={plan.code} className={cn("px-3 py-3.5 text-center", featuredCell(plan))}>
          {cells(plan)}
        </td>
      ))}
    </tr>
  );

  const included = (plan: Plan, f: (typeof FEATURE_ROWS)[number]) => plan.kind === "CUSTOM" || f.included(plan.features);

  const price = (plan: Plan) => (
    <>
      {plan.kind === "CUSTOM" ? t("onQuote") : formatPrice(plan.priceYearlyCents, currency)}
      {plan.kind === "PAID" && <span className="text-sm font-normal text-ink-3">{t("perYear")}</span>}
    </>
  );

  const priceNote = (plan: Plan) =>
    plan.kind === "FREE"
      ? t("noteFree")
      : plan.kind === "CUSTOM"
        ? t("noteCustom")
        : isEuro
          ? t("noteEur")
          : t("noteUsd");

  return (
    <div className="grid gap-4">
      {/* Sélecteur de devise */}
      <div className="flex justify-end pb-1">
        <CurrencyToggle />
      </div>

      {/* Mobile : une carte par offre */}
      <div className="grid gap-4 md:hidden">
        {plans.map((plan) => {
          const action = cta(t, plan, currency);
          return (
            <article key={plan.code} className={cn("rounded-[var(--radius-lg)] bg-surface p-5 shadow-1", plan.code === FEATURED && "ring-2 ring-cobalt")}>
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-display text-lg font-semibold">{plan.name}</h3>
                {plan.code === FEATURED && <span className="text-xs font-medium text-cobalt">{t("recommended")}</span>}
              </div>
              <p className="mt-2 font-display text-2xl font-semibold tabular">{price(plan)}</p>
              <p className="text-xs text-ink-3">{priceNote(plan)}</p>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {QUOTA_ROWS.map((q) => (
                  <div key={q} className="flex justify-between gap-2 border-b border-line pb-1.5">
                    <dt className="text-ink-2">{t(`quotas.${q}`)}</dt>
                    <dd className="font-medium tabular">{quota(t, plan, q)}</dd>
                  </div>
                ))}
              </dl>
              <ul className="mt-4 grid gap-2 text-sm">
                {FEATURE_ROWS.map((f) => (
                  <li key={f.key} className={cn("flex gap-2.5", !included(plan, f) && "text-ink-3")}>
                    {included(plan, f) ? <Check className="mt-0.5 size-4 shrink-0 text-mint" aria-hidden /> : <X className="mt-0.5 size-4 shrink-0 text-ink-3/70" aria-hidden />}
                    <span>
                      {t(`features.${f.key}`)}
                      {!included(plan, f) && <span className="sr-only">{t("notIncludedSuffix")}</span>}
                    </span>
                  </li>
                ))}
              </ul>
              <Button asChild size="sm" className="mt-5 w-full" variant={plan.code === FEATURED ? "primary" : "secondary"}>
                <Link href={action.href}>{action.label}</Link>
              </Button>
            </article>
          );
        })}
      </div>

      {/* Desktop : tableau comparatif */}
      <div className="hidden overflow-x-auto rounded-[var(--radius-lg)] bg-surface shadow-1 md:block">
        <table className="w-full min-w-[760px] border-collapse text-[0.95rem]">
          <caption className="sr-only">{t("caption")}</caption>
          <thead>
            <tr>
              <th scope="col" className={cn(stickyCol, "w-[22%] p-5 text-start align-bottom text-sm font-medium text-ink-2")}>
                {t("compare")}
              </th>
              {plans.map((plan) => {
                const action = cta(t, plan, currency);
                return (
                  <th key={plan.code} scope="col" className={cn("p-4 text-start align-top font-normal", featuredCell(plan), plan.code === FEATURED && "rounded-t-[var(--radius)]")}>
                    <div className="flex min-h-full flex-col gap-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-display text-lg font-semibold text-ink">{plan.name}</span>
                        {plan.code === FEATURED && <span className="text-xs font-medium text-cobalt">{t("recommended")}</span>}
                      </div>
                      <p className="mt-2 font-display text-2xl font-semibold tabular text-ink">{price(plan)}</p>
                      <p className="min-h-8 text-xs text-ink-3">{priceNote(plan)}</p>
                      <Button asChild size="sm" className="mt-4 w-full" variant={plan.code === FEATURED ? "primary" : "secondary"}>
                        <Link href={action.href}>{action.label}</Link>
                      </Button>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {groupRow(t("groupCapacity"))}
            {QUOTA_ROWS.map((q) => row(q, t(`quotas.${q}`), (plan) => <span className="font-medium tabular text-ink">{quota(t, plan, q)}</span>))}
            {groupRow(t("groupFeatures"))}
            {FEATURE_ROWS.map((f) =>
              row(f.key, t(`features.${f.key}`), (plan) =>
                included(plan, f) ? (
                  <>
                    <Check className="mx-auto size-5 text-mint" aria-hidden />
                    <span className="sr-only">{t("included")}</span>
                  </>
                ) : (
                  <>
                    <X className="mx-auto size-5 text-ink-3/70" aria-hidden />
                    <span className="sr-only">{t("notIncluded")}</span>
                  </>
                ),
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
