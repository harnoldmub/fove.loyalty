import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { localizedPageMeta } from "@/lib/og";

export async function generateMetadata() {
  return localizedPageMeta("terms", "/cgu");
}

const strong = (chunks: React.ReactNode) => <strong>{chunks}</strong>;
const linkClass = "text-cobalt underline underline-offset-4";

export default async function TermsPage() {
  const t = await getTranslations("marketing.terms");
  return (
    <article className="mx-auto max-w-3xl px-4 pt-14 sm:px-6 [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-semibold [&_p]:mt-3 [&_p]:text-ink-2 [&_li]:text-ink-2 [&_ul]:mt-3 [&_ul]:grid [&_ul]:list-disc [&_ul]:gap-1.5 [&_ul]:ps-5">
      <h1 className="font-display text-4xl font-bold">{t("title")}</h1>
      <p>{t.rich("intro", { strong })}</p>

      <h2>{t("purpose.title")}</h2>
      <p>{t("purpose.text")}</p>

      <h2>{t("account.title")}</h2>
      <ul>
        <li>{t("account.professionals")}</li>
        <li>{t("account.roles")}</li>
        <li>{t("account.audit")}</li>
      </ul>

      <h2>{t("plans.title")}</h2>
      <ul>
        <li>{t("plans.free")}</li>
        <li>{t("plans.commission")}</li>
        <li>{t.rich("plans.retention", { strong })}</li>
      </ul>

      <h2>{t("duties.title")}</h2>
      <p>{t("duties.text")}</p>

      <h2>{t("dpa.title")}</h2>
      <p>{t.rich("dpa.text", { strong })}</p>
      <ul>
        <li>{t.rich("dpa.ownership", { strong })}</li>
        <li>{t.rich("dpa.isolation", { strong })}</li>
        <li>{t.rich("dpa.rights", { strong })}</li>
        <li>{t.rich("dpa.security", { strong })}</li>
      </ul>

      <h2>{t("availability.title")}</h2>
      <p>{t("availability.text")}</p>

      <h2>{t("termination.title")}</h2>
      <p>{t("termination.text")}</p>

      <h2>{t("contact.title")}</h2>
      <p>
        {t.rich("contact.text", {
          contact: (chunks) => <Link href="/contact" className={linkClass}>{chunks}</Link>,
          privacy: (chunks) => <Link href="/confidentialite" className={linkClass}>{chunks}</Link>,
        })}
      </p>
    </article>
  );
}
