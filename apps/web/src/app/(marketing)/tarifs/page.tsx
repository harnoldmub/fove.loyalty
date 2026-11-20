import { getTranslations } from "next-intl/server";
import { Pricing } from "@/components/marketing/pricing";
import { asList, localizedPageMeta } from "@/lib/og";

export async function generateMetadata() {
  return localizedPageMeta("pricing", "/tarifs");
}

type FaqItem = { q: string; a: string };

export default async function PricingPage() {
  const t = await getTranslations("marketing.pricingPage");
  const faq = asList<FaqItem>(t.raw("faq"));
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pt-14 sm:px-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <h1 className="font-display text-4xl font-bold sm:text-5xl">{t("title")}</h1>
      <p className="mt-3 max-w-xl text-lg text-ink-2">{t("intro")}</p>
      <div className="mt-10">
        <Pricing />
      </div>
      <p className="mt-6 text-ink-2">{t("setup")}</p>
      <p className="mt-3 text-sm text-ink-3">{t("whatsapp")}</p>
      <section aria-labelledby="faq" className="mt-20 max-w-3xl">
        <h2 id="faq" className="font-display text-2xl font-semibold">{t("faqTitle")}</h2>
        <div className="mt-6 divide-y divide-line">
          {faq.map((f) => (
            <details key={f.q} className="group py-4">
              <summary className="cursor-pointer list-none font-medium marker:hidden">
                <span className="flex items-center justify-between gap-4">
                  {f.q}
                  <span className="text-ink-3 transition-transform group-open:rotate-45" aria-hidden>+</span>
                </span>
              </summary>
              <p className="mt-2 text-ink-2">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
