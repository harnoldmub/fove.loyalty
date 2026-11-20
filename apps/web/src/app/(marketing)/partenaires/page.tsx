import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Check,
  ChevronRight,
  CreditCard,
  Gift,
  HelpCircle,
  QrCode,
  ShieldCheck,
  Smartphone,
  TrendingUp,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { PartnerCommissions } from "@/components/marketing/partner-commissions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("partner.landing.meta");
  return { title: t("title"), description: t("description") };
}

const STEPS = [
  { num: "01", key: "apply" },
  { num: "02", key: "review" },
  { num: "03", key: "link" },
  { num: "04", key: "earn" },
] as const;

const PROFILES = ["agencies", "developers", "freelancers", "consultants", "entrepreneurs", "networks"] as const;

const FAQS = ["who", "attribution", "base", "withdraw", "fees", "both"] as const;

export default async function PartenairesPage() {
  const t = await getTranslations("partner.landing");
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
      {/* HERO SECTION */}
      <section className="text-center max-w-3xl mx-auto mb-20 sm:mb-28">
        <div className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-ink-2 shadow-xs mb-6">
          <span className="size-2 rounded-full bg-[#C7FF3D]" />
          {t("hero.badge")}
        </div>

        <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-ink mb-6">
          {t("hero.title")}
        </h1>

        <p className="text-lg sm:text-xl text-ink-2 leading-relaxed mb-10">
          {t("hero.subtitle")}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button asChild size="lg" className="w-full sm:w-auto font-semibold shadow-md">
            <Link href="/partenaires/rejoindre">
              {t("hero.cta")}
              <ArrowRight className="size-4 ms-1.5 rtl-flip" />
            </Link>
          </Button>

          <Button asChild variant="secondary" size="lg" className="w-full sm:w-auto">
            <a href="#comment-ca-marche">{t("hero.howItWorks")}</a>
          </Button>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-ink-3">
          <span className="flex items-center gap-1.5">
            <Check className="size-4 text-emerald-500" /> {t("hero.perkFree")}
          </span>
          <span className="flex items-center gap-1.5">
            <Check className="size-4 text-emerald-500" /> {t("hero.perkCommission")}
          </span>
          <span className="flex items-center gap-1.5">
            <Check className="size-4 text-emerald-500" /> {t("hero.perkPayment")}
          </span>
        </div>
      </section>

      {/* SECTION : COMMENT ÇA MARCHE */}
      <section id="comment-ca-marche" className="mb-24 scroll-mt-20">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-ink mb-3">
            {t("steps.title")}
          </h2>
          <p className="text-sm text-ink-2">{t("steps.subtitle")}</p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => (
            <div
              key={step.num}
              className="relative rounded-2xl border border-line bg-surface p-6 shadow-xs flex flex-col justify-between"
            >
              <div>
                <span className="font-mono text-3xl font-black text-[#C7FF3D] mb-4 block">
                  {step.num}
                </span>
                <h3 className="font-display text-lg font-semibold text-ink mb-2">
                  {t(`steps.${step.key}.title`)}
                </h3>
                <p className="text-xs text-ink-2 leading-relaxed">{t(`steps.${step.key}.desc`)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION : PROFILS CIBLÉS */}
      <section className="mb-24">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-ink mb-3">
            {t("profiles.title")}
          </h2>
          <p className="text-sm text-ink-2">
            {t("profiles.subtitle")}
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {PROFILES.map((p) => (
            <div
              key={p}
              className="rounded-xl border border-line bg-surface p-5 hover:border-cobalt/40 transition-colors shadow-xs"
            >
              <h3 className="font-display text-base font-semibold text-ink mb-2 flex items-center gap-2">
                <span className="size-2 rounded-full bg-[#C7FF3D]" />
                {t(`profiles.${p}.title`)}
              </h3>
              <p className="text-xs text-ink-2 leading-relaxed">{t(`profiles.${p}.desc`)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION : GRILLE DES COMMISSIONS */}
      <PartnerCommissions />

      {/* SECTION : AVANTAGES DU PARTENAIRE */}
      <section className="mb-24 rounded-2xl border border-line bg-surface p-8 sm:p-12 shadow-xs">
        <div className="max-w-2xl mb-8">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-ink mb-3">
            {t("tools.title")}
          </h2>
          <p className="text-sm text-ink-2">
            {t("tools.subtitle")}
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <span className="grid size-10 place-items-center rounded-lg bg-cobalt/10 text-cobalt">
              <QrCode className="size-5" />
            </span>
            <h3 className="font-display text-sm font-semibold text-ink">{t("tools.qr.title")}</h3>
            <p className="text-xs text-ink-2">
              {t("tools.qr.desc")}
            </p>
          </div>

          <div className="space-y-2">
            <span className="grid size-10 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Smartphone className="size-5" />
            </span>
            <h3 className="font-display text-sm font-semibold text-ink">{t("tools.whatsapp.title")}</h3>
            <p className="text-xs text-ink-2">
              {t("tools.whatsapp.desc")}
            </p>
          </div>

          <div className="space-y-2">
            <span className="grid size-10 place-items-center rounded-lg bg-[#C7FF3D]/20 text-black dark:text-[#C7FF3D]">
              <TrendingUp className="size-5" />
            </span>
            <h3 className="font-display text-sm font-semibold text-ink">{t("tools.pipeline.title")}</h3>
            <p className="text-xs text-ink-2">
              {t("tools.pipeline.desc")}
            </p>
          </div>

          <div className="space-y-2">
            <span className="grid size-10 place-items-center rounded-lg bg-amber-500/10 text-amber-500">
              <Wallet className="size-5" />
            </span>
            <h3 className="font-display text-sm font-semibold text-ink">{t("tools.payouts.title")}</h3>
            <p className="text-xs text-ink-2">
              {t("tools.payouts.desc")}
            </p>
          </div>

          <div className="space-y-2">
            <span className="grid size-10 place-items-center rounded-lg bg-cobalt/10 text-cobalt">
              <ShieldCheck className="size-5" />
            </span>
            <h3 className="font-display text-sm font-semibold text-ink">{t("tools.attribution.title")}</h3>
            <p className="text-xs text-ink-2">
              {t("tools.attribution.desc")}
            </p>
          </div>

          <div className="space-y-2">
            <span className="grid size-10 place-items-center rounded-lg bg-rose-500/10 text-rose-500">
              <Zap className="size-5" />
            </span>
            <h3 className="font-display text-sm font-semibold text-ink">{t("tools.support.title")}</h3>
            <p className="text-xs text-ink-2">
              {t("tools.support.desc")}
            </p>
          </div>
        </div>
      </section>

      {/* SECTION : FAQ */}
      <section className="mb-24 max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-ink mb-3">
            {t("faq.title")}
          </h2>
          <p className="text-sm text-ink-2">{t("faq.subtitle")}</p>
        </div>

        <div className="divide-y divide-line rounded-2xl border border-line bg-surface p-6">
          {FAQS.map((faq) => (
            <div key={faq} className="py-4 first:pt-0 last:pb-0">
              <h3 className="font-display text-sm font-semibold text-ink mb-1.5 flex items-start gap-2">
                <HelpCircle className="size-4 text-cobalt shrink-0 mt-0.5" />
                <span>{t(`faq.${faq}.q`)}</span>
              </h3>
              <p className="text-xs text-ink-2 ps-6 leading-relaxed">{t(`faq.${faq}.a`)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="rounded-2xl bg-black text-white p-8 sm:p-14 text-center border border-white/10 shadow-2xl">
        <h2 className="font-display text-3xl sm:text-4xl font-bold mb-4 tracking-tight">
          {t("finalCta.title")}
        </h2>
        <p className="text-sm sm:text-base text-neutral-300 max-w-xl mx-auto mb-8 leading-relaxed">
          {t("finalCta.subtitle")}
        </p>
        <Button asChild size="lg" className="bg-[#C7FF3D] text-black hover:bg-[#b8f52e] font-bold text-sm px-8 shadow-lg">
          <Link href="/partenaires/rejoindre">
            {t("finalCta.cta")}
            <ArrowRight className="size-4 ms-1.5 rtl-flip" />
          </Link>
        </Button>
      </section>
    </div>
  );
}
