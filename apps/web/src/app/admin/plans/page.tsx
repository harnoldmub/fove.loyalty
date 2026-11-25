"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { PageHeader, Panel } from "@/components/ui/misc";
import { BILLING_CURRENCIES, isOnlineCurrency, type BillingCurrency, type PlanFeatures } from "@fove/shared";
import { api, ApiError, useErrorMessage } from "@/lib/api";

interface Plan {
  id: string;
  code: string;
  kind: "FREE" | "PAID" | "CUSTOM";
  name: string;
  description: string;
  /** Prix annuel par monnaie ; tarif Stripe pour EUR et USD. */
  prices: { currency: BillingCurrency; yearlyCents: number; stripePriceId: string | null }[];
  trialDays: number;
  features: PlanFeatures;
  limits: { customers: number | null; establishments: number | null; staff: number | null; programs: number | null };
  active: boolean;
  _count: { subscriptions: number };
}

const LIMITS = ["customers", "establishments", "staff", "programs"] as const;
const FEATURES: (keyof PlanFeatures)[] = ["api", "widget", "integrations", "exports", "walletCampaigns", "whatsappAuto", "removeBranding", "referral"];

function PlanEditor({ plan }: { plan: Plan }) {
  const t = useTranslations("admin.plans");
  const errMsg = useErrorMessage();
  const qc = useQueryClient();
  const [p, setP] = useState(plan);
  // Saisie des prix en unités (« 89 », « 1 990 ») ; vide = pas de prix dans cette monnaie.
  const [prices, setPrices] = useState(() =>
    Object.fromEntries(
      BILLING_CURRENCIES.map((c) => {
        const row = plan.prices.find((r) => r.currency === c);
        return [c, { amount: row ? String(row.yearlyCents / 100) : "", stripe: row?.stripePriceId ?? "" }];
      }),
    ) as Record<BillingCurrency, { amount: string; stripe: string }>,
  );
  const [busy, setBusy] = useState(false);
  const num = (v: string) => (v === "" ? null : Number(v));
  return (
    <Panel className="grid gap-4 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="font-display text-xl font-semibold">{plan.name}</h2>
        <span className="text-sm text-ink-3">
          {t("subscriptionsCount", { count: plan._count.subscriptions })}
        </span>
      </div>
      <p className="-mt-2 text-sm text-ink-3">{t(`kind.${plan.kind}`)}</p>
      <Field label={t("name")}>{(f) => <Input {...f} value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />}</Field>
      <Field label={t("descriptionLabel")}>{(f) => <Input {...f} value={p.description} onChange={(e) => setP({ ...p, description: e.target.value })} />}</Field>
      {plan.kind === "PAID" && (
        <fieldset className="grid gap-3">
          <legend className="mb-1 text-sm font-medium">{t("yearlyPrices")}</legend>
          <p className="-mt-1 text-xs text-ink-3">{t("yearlyPriceHint")}</p>
          {BILLING_CURRENCIES.map((c) => (
            <div key={c} className="grid gap-3 sm:grid-cols-2">
              <Field label={t("yearlyPrice", { currency: c })}>
                {(f) => (
                  <Input
                    {...f}
                    inputMode="decimal"
                    value={prices[c].amount}
                    onChange={(e) => setPrices({ ...prices, [c]: { ...prices[c], amount: e.target.value } })}
                  />
                )}
              </Field>
              {isOnlineCurrency(c) ? (
                <Field label={t("stripePriceId", { currency: c })}>
                  {(f) => <Input {...f} placeholder="price_…" value={prices[c].stripe} onChange={(e) => setPrices({ ...prices, [c]: { ...prices[c], stripe: e.target.value } })} />}
                </Field>
              ) : (
                <p className="self-end pb-2 text-xs text-ink-3">{t("offlineOnly")}</p>
              )}
            </div>
          ))}
        </fieldset>
      )}
      {plan.kind === "PAID" && (
        <Field label={t("trialDays")} hint={t("trialDaysHint")}>
          {(f) => <Input {...f} type="number" value={p.trialDays} onChange={(e) => setP({ ...p, trialDays: Number(e.target.value) })} />}
        </Field>
      )}
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-medium">{t("quotas")}</legend>
        {LIMITS.map((k) => (
          <Field key={k} label={t(`limits.${k}`)}>{(f) => <Input {...f} type="number" value={p.limits[k] ?? ""} onChange={(e) => setP({ ...p, limits: { ...p.limits, [k]: num(e.target.value) } })} />}</Field>
        ))}
      </fieldset>
      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="mb-2 text-sm font-medium">{t("features")}</legend>
        {FEATURES.map((k) => (
          <Checkbox key={k} label={t(`featureLabels.${k}`)} checked={p.features[k]} onChange={(e) => setP({ ...p, features: { ...p.features, [k]: e.target.checked } })} />
        ))}
      </fieldset>
      <Checkbox label={t("onSale")} checked={p.active} onChange={(e) => setP({ ...p, active: e.target.checked })} />
      <Button
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const body = {
              name: p.name,
              description: p.description,
              trialDays: p.trialDays,
              features: p.features,
              limits: p.limits,
              active: p.active,
              ...(plan.kind === "PAID"
                ? {
                    prices: BILLING_CURRENCIES.flatMap((c) => {
                      const raw = prices[c].amount.replace(/\s/g, "").replace(",", ".");
                      if (raw === "") return [];
                      const value = Number(raw);
                      if (!Number.isFinite(value) || value < 0) throw new Error(t("invalidPrice", { currency: c }));
                      return [{ currency: c, yearlyCents: Math.round(value * 100), stripePriceId: isOnlineCurrency(c) ? prices[c].stripe.trim() || null : null }];
                    }),
                  }
                : {}),
            };
            await api.patch(`/admin/plans/${plan.id}`, body);
            qc.invalidateQueries({ queryKey: ["admin-plans"] });
            toast.success(t("saved"));
          } catch (e) {
            toast.error(e instanceof Error && !(e instanceof ApiError) ? e.message : errMsg(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {t("save", { name: plan.name })}
      </Button>
    </Panel>
  );
}

export default function AdminPlans() {
  const t = useTranslations("admin.plans");
  const { data = [] } = useQuery({ queryKey: ["admin-plans"], queryFn: () => api.get<Plan[]>("/admin/plans") });
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">{data.map((p) => <PlanEditor key={p.id} plan={p} />)}</div>
    </>
  );
}
