import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { localizedPageMeta } from "@/lib/og";

export async function generateMetadata() {
  return localizedPageMeta("features", "/fonctionnalites");
}

/** Groupes et fonctionnalités, dans l’ordre d’affichage ; les textes sont dans `marketing.features.groups`. */
const groups = [
  { key: "program", items: ["points", "rules", "rewards"] },
  { key: "customers", items: ["qr", "wallet", "push", "geo", "crm"] },
  { key: "team", items: ["roles", "stores", "audit"] },
  { key: "tools", items: ["stats", "shop", "widget"] },
] as const;

export default async function FeaturesPage() {
  const t = await getTranslations("marketing.features");
  return (
    <div className="mx-auto max-w-6xl px-4 pt-14 sm:px-6">
      <h1 className="font-display text-4xl font-bold sm:text-5xl">{t("title")}</h1>
      <p className="mt-3 max-w-xl text-lg text-ink-2">{t("intro")}</p>
      <div className="mt-14 grid gap-16">
        {groups.map((g) => (
          <section key={g.key} aria-labelledby={`groupe-${g.key}`} className="grid gap-6 md:grid-cols-[14rem_1fr]">
            <h2 id={`groupe-${g.key}`} className="font-display text-2xl font-semibold">{t(`groups.${g.key}.title`)}</h2>
            <dl className="grid gap-6 sm:grid-cols-3">
              {g.items.map((item) => (
                <div key={item} className="grid content-start gap-1.5 border-t border-line pt-4">
                  <dt className="font-medium">{t(`groups.${g.key}.items.${item}.title`)}</dt>
                  <dd className="text-ink-2">{t(`groups.${g.key}.items.${item}.text`)}</dd>
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
