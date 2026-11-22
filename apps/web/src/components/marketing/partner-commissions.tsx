"use client";

import Link from "next/link";
import { ArrowRight, Check, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CurrencyToggle } from "./currency-toggle";
import { useLocale, useTranslations } from "next-intl";
import { useMarketingCurrency } from "@/lib/marketing-currency";
import { formatNumber, formatPrice } from "@/lib/utils";

const PLANS = [
  { plan: "Essentiel", key: "starter", priceCents: 9900, featured: false, features: ["annual", "net", "tracking"] },
  { plan: "Business", key: "business", priceCents: 19900, featured: true, features: ["annual", "net", "fastPayout"] },
  { plan: "Réseau", key: "premium", priceCents: 39900, featured: false, features: ["annual", "net", "support"] },
] as const;

const COMMISSION_RATE = 20;

export function PartnerCommissions() {
  const { currency } = useMarketingCurrency();
  const t = useTranslations("partner.commissions");
  const locale = useLocale();
  const money = currency === "EUR" ? "EUR" : "USD";
  const rate = `${formatNumber(COMMISSION_RATE, locale)}%`;

  return (
    <section className="mb-24">
      <div className="text-center max-w-2xl mx-auto mb-10">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-mint-soft px-3 py-1 text-xs font-semibold text-mint-ink mb-3">
          <TrendingUp className="size-3.5" aria-hidden /> {t("badge")}
        </div>
        <h2 className="font-display text-2xl sm:text-3xl font-bold text-ink mb-3">
          {t("title")}
        </h2>
        <p className="text-sm text-ink-2 mb-6">
          {t("subtitle")}
        </p>

        {/* Sélecteur de devise interactif */}
        <div className="flex justify-center">
          <CurrencyToggle />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {PLANS.map((c) => (
          <div
            key={c.plan}
            className={`rounded-2xl border p-6 shadow-sm flex flex-col justify-between  ${
              c.featured
                ? "border-cobalt bg-surface relative ring-1 ring-cobalt"
                : "border-line bg-surface"
            }`}
          >
            <div>
              {c.featured && (
                <span className="absolute -top-3 end-6 rounded-full bg-cobalt px-3 py-0.5 text-xs font-semibold text-cobalt-ink">
                  {t("recommended")}
                </span>
              )}
              <h3 className="font-display text-xl font-bold text-ink">{c.plan}</h3>
              <p className="text-sm text-ink-3 mb-4">{t(`plans.${c.key}`)}</p>

              <div className="mb-6 rounded-xl bg-surface-2 p-4">
                <div className="text-xs text-ink-3">
                  {t("clientPrice", { price: t("perYear", { price: formatPrice(c.priceCents, money, locale) }) })}
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="font-display text-3xl font-extrabold text-ink tabular">{formatPrice((c.priceCents * COMMISSION_RATE) / 100, money, locale)}</span>
                  <span className="text-xs font-semibold text-mint-ink">
                    {t("rate", { rate })}
                  </span>
                </div>
              </div>

              <ul className="space-y-2 text-sm text-ink-2">
                {c.features.map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <Check className="size-3.5 text-mint shrink-0" aria-hidden />
                    <span>{t(`features.${f}`)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-10 text-center">
        <Button asChild size="lg" className="px-8 font-semibold shadow-md">
          <Link href="/partenaires/rejoindre">
            {t("cta")}
            <ArrowRight className="size-4 ms-2 rtl-flip" aria-hidden />
          </Link>
        </Button>
        <p className="mt-2.5 text-xs text-ink-3">
          {t("footnote")}
        </p>
      </div>
    </section>
  );
}
