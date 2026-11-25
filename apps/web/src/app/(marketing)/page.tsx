import Link from "next/link";
import { BarChart3, Gift, QrCode, ScanLine, Store, Users } from "lucide-react";
import { StampDemo } from "@/components/marketing/stamp-demo";
import { WalletNotificationDemo } from "@/components/marketing/wallet-notification-demo";
import { Pricing } from "@/components/marketing/pricing";
import { Button } from "@/components/ui/button";
import { getTranslations } from "next-intl/server";
import { localizedPageMeta, siteUrl } from "@/lib/og";
import { serverGet } from "@/lib/server-api";
import type { Plan } from "@/components/marketing/pricing-table";

export async function generateMetadata() {
  return localizedPageMeta("home", "/");
}

/** Fourchette de prix annuels en euros (monnaie de référence), lue dans les offres de l'API (jamais codée en dur). */
function offersFrom(plans: Plan[] | null) {
  const priced = (plans ?? []).filter((p) => p.kind === "FREE" || (p.kind === "PAID" && p.prices.EUR !== undefined));
  if (!priced.length) return undefined;
  const yearly = priced.map((p) => (p.kind === "FREE" ? 0 : p.prices.EUR! / 100));
  return {
    "@type": "AggregateOffer",
    priceCurrency: "EUR",
    lowPrice: String(Math.min(...yearly)),
    highPrice: String(Math.max(...yearly)),
    offerCount: String(priced.length),
  };
}

const homeJsonLd = (t: (key: string) => string, plans: Plan[] | null) => ({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
      name: "FOVE",
      alternateName: "FOVE by Dizayna",
      url: siteUrl,
      logo: `${siteUrl}/icon-512.png`,
      description: t("jsonLd.organization"),
      brand: {
        "@type": "Brand",
        name: "FOVE",
      },
      parentOrganization: {
        "@type": "Organization",
        name: "Dizayna",
      },
    },
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      url: siteUrl,
      name: "FOVE",
      inLanguage: t("meta.inLanguage"),
      publisher: { "@id": `${siteUrl}/#organization` },
    },
    {
      "@type": "SoftwareApplication",
      name: "FOVE",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web, iOS (Apple Wallet), Android (Google Wallet)",
      url: siteUrl,
      description: t("jsonLd.application"),
      offers: offersFrom(plans),
    },
  ],
});

const steps = [
  { icon: QrCode, key: "qr" },
  { icon: Users, key: "signup" },
  { icon: ScanLine, key: "scan" },
] as const;

const counter = [
  { icon: Gift, key: "rewards" },
  { icon: Store, key: "stores" },
  { icon: BarChart3, key: "stats" },
] as const;

export default async function HomePage() {
  const [t, tm, { data: plans }] = await Promise.all([
    getTranslations("marketing.home"),
    getTranslations("marketing"),
    serverGet<Plan[]>("/plans"),
  ]);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homeJsonLd(tm, plans)) }}
      />
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-12 sm:px-6 md:grid-cols-[1.1fr_1fr] md:pt-20 lg:gap-16">
        <div>
          <h1 className="font-display text-[2.6rem] font-bold leading-[1.02] sm:text-6xl lg:text-[4.4rem]">{t("hero.title")}</h1>
          <p className="mt-6 max-w-[34rem] text-lg text-ink-2">
            {t("hero.text")}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/signup">{t("hero.cta")}</Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link href="/#tarifs">{t("hero.pricing")}</Link>
            </Button>
          </div>
          <p className="mt-4 text-sm text-ink-3">{t("hero.note")}</p>

          <div className="mt-8 border-t border-line pt-6">
            <p className="text-sm text-ink-2">{t("hero.wallet")}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3" aria-label={t("hero.walletLabel")}>
              <img src="/wallet/add-to-apple-wallet.svg" alt="Apple Wallet" height={40} className="h-10 w-auto shrink-0 select-none" />
              <img src="/wallet/add-to-google-wallet.svg" alt="Google Wallet" height={40} className="h-10 w-auto shrink-0 select-none" />
            </div>
          </div>
        </div>
        <StampDemo />
      </section>

      <section aria-labelledby="etapes" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 id="etapes" className="max-w-xl font-display text-3xl font-semibold sm:text-4xl">{t("steps.title")}</h2>
        <ol className="mt-10 grid gap-8 md:grid-cols-3 md:gap-6">
          {steps.map((s, i) => (
            <li key={s.key} className="relative grid content-start gap-3 border-t-2 border-ink pt-5">
              <span className="font-display text-sm font-semibold text-cobalt">{t("steps.step", { number: i + 1 })}</span>
              <s.icon className="size-6 text-ink" aria-hidden />
              <h3 className="font-display text-xl font-semibold">{t(`steps.${s.key}.title`)}</h3>
              <p className="text-ink-2">{t(`steps.${s.key}.text`)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="wallet-push" className="border-y border-line bg-surface/50 py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <WalletNotificationDemo />
        </div>
      </section>

      <section aria-labelledby="comptoir" className="bg-surface py-20">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 md:grid-cols-[1fr_1.3fr]">
          <div>
            <h2 id="comptoir" className="font-display text-3xl font-semibold sm:text-4xl">{t("counter.title")}</h2>
            <p className="mt-4 max-w-md text-ink-2">
              {t("counter.text")}
            </p>
            <Button asChild variant="link" className="mt-4">
              <Link href="/fonctionnalites">{t("counter.link")}</Link>
            </Button>
          </div>
          <dl className="grid gap-8">
            {counter.map((c) => (
              <div key={c.key} className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <dt className="contents">
                  <span className="grid size-11 place-items-center rounded-md bg-cobalt-soft text-cobalt">
                    <c.icon className="size-5" aria-hidden />
                  </span>
                  <span className="self-center font-display text-lg font-semibold">{t(`counter.${c.key}.title`)}</span>
                </dt>
                <dd className="col-start-2 text-ink-2">{t(`counter.${c.key}.text`)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section aria-labelledby="enligne" className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 sm:px-6 md:grid-cols-2">
        <div>
          <h2 id="enligne" className="font-display text-3xl font-semibold sm:text-4xl">{t("online.title")}</h2>
          <p className="mt-4 max-w-md text-ink-2">
            {t("online.text")}
          </p>
          <Button asChild variant="secondary" className="mt-6">
            <Link href="/developpeurs">{t("online.docs")}</Link>
          </Button>
        </div>
        <pre className="overflow-x-auto rounded-[var(--radius-lg)] bg-[#14204a] p-5 text-[0.82rem] leading-relaxed text-[#dfe5ff] shadow-2" aria-label={t("online.codeLabel")} dir="ltr">
          <code>{`await fove.orderPaid({
  programId,
  externalOrderId: order.id,
  customer: { externalId: user.id, email: user.email },
  amount: "125.90",
  currency: "EUR",
  paidAt: order.paidAt,
});
// ${t("online.codeComment")}`}</code>
        </pre>
      </section>

      <section id="tarifs" aria-labelledby="tarifs-titre" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
        <h2 id="tarifs-titre" className="font-display text-3xl font-semibold sm:text-4xl">{t("pricing.title")}</h2>
        <p className="mt-3 max-w-xl text-ink-2">{t("pricing.text")}</p>
        <div className="mt-10">
          <Pricing />
        </div>
      </section>
    </>
  );
}
