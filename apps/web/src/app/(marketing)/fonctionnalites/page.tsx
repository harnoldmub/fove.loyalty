import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { localizedPageMeta } from "@/lib/og";
import { FEATURE_GROUPS } from "@/lib/marketing-features";

export async function generateMetadata() {
  return localizedPageMeta("features", "/fonctionnalites");
}

export default async function FeaturesPage() {
  const t = await getTranslations("marketing.features");
  return (
    <div className="mx-auto max-w-6xl px-4 pt-14 sm:px-6">
      <h1 className="font-display text-4xl font-bold sm:text-5xl">{t("title")}</h1>
      <p className="mt-3 max-w-xl text-lg text-ink-2">{t("intro")}</p>
      <div className="mt-14 grid gap-16">
        {FEATURE_GROUPS.map((g) => (
          <section key={g.key} aria-labelledby={`groupe-${g.key}`} className="grid gap-6 md:grid-cols-[14rem_1fr]">
            <h2 id={`groupe-${g.key}`} className="font-display text-2xl font-semibold">{t(`groups.${g.key}.title`)}</h2>
            <dl className="grid gap-6 sm:grid-cols-3">
              {g.items.map((item) => (
                <div
                  key={item.key}
                  id={item.anchor}
                  className="grid scroll-mt-32 content-start gap-1.5 border-t border-line pt-4 transition-colors target:rounded-md target:bg-cobalt-soft target:px-3 target:pb-3 target:ring-2 target:ring-cobalt/30"
                >
                  <dt className="font-medium">
                    {t(`groups.${g.key}.items.${item.key}.title`)}
                    {"paid" in item && item.paid && <span className="ms-2 whitespace-nowrap rounded-full bg-stamp-soft px-2 py-0.5 align-middle text-xs font-medium text-stamp-ink dark:text-stamp">{t("paid")}</span>}
                  </dt>
                  <dd className="text-ink-2">{t(`groups.${g.key}.items.${item.key}.text`)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <div className="mt-20 flex flex-wrap items-center gap-4 rounded-[var(--radius-lg)] bg-cobalt px-6 py-8 text-cobalt-ink sm:px-10">
        <p className="me-auto max-w-lg font-display text-2xl font-semibold">{t("cta")}</p>
        <Button asChild variant="stamp" size="lg">
          <Link href="/signup">{t("start")}</Link>
        </Button>
      </div>
    </div>
  );
}
