import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

interface LegalDoc {
  title: string;
  updated: string;
  intro: string[];
  sections: { title: string; paragraphs?: string[]; items?: string[] }[];
}

/**
 * Texte juridique du compte client FOVE (conditions ou confidentialité), lu dans `client.legal`.
 * Rédigé en français ; les autres langues l'affichent en français avec une mention, en attendant
 * la traduction de la version validée.
 */
export async function LegalDocument({ doc }: { doc: "terms" | "privacy" }) {
  const t = await getTranslations("client.legal");
  const locale = await getLocale();
  const content = t.raw(doc) as LegalDoc;
  const other = doc === "terms" ? { href: "/compte/confidentialite", label: t("privacyLink") } : { href: "/compte/conditions", label: t("termsLink") };

  return (
    <div className="grid gap-4">
      {t("frenchOnly") && <p className="rounded-md bg-surface-2 px-4 py-3 text-sm text-ink-2">{t("frenchOnly")}</p>}
      {t("draft") && <p className="rounded-md bg-stamp-soft px-4 py-3 text-sm text-stamp-ink dark:text-stamp">{t("draft")}</p>}
      <article
        lang={locale === "fr" ? undefined : "fr"}
        dir="ltr"
        className="[&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_p]:mt-3 [&_p]:leading-relaxed [&_p]:text-ink-2 [&_li]:leading-relaxed [&_li]:text-ink-2 [&_ul]:mt-3 [&_ul]:grid [&_ul]:list-disc [&_ul]:gap-2 [&_ul]:ps-5"
      >
        <h1 className="font-display text-3xl font-bold">{content.title}</h1>
        <p className="text-sm">{content.updated}</p>
        {content.intro.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        {content.sections.map((s) => (
          <section key={s.title}>
            <h2>{s.title}</h2>
            {s.paragraphs?.map((p, i) => <p key={i}>{p}</p>)}
            {s.items && (
              <ul>
                {s.items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </article>
      <p className="mt-6 text-sm">
        <Link href={other.href} className="text-cobalt underline underline-offset-4">
          {other.label}
        </Link>
      </p>
    </div>
  );
}
