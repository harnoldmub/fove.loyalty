import { getTranslations } from "next-intl/server";
import { localizedPageMeta } from "@/lib/og";

export async function generateMetadata() {
  return localizedPageMeta("privacy", "/confidentialite");
}

export default async function PrivacyPage() {
  const t = await getTranslations("marketing.privacy");
  return (
    <article className="mx-auto max-w-3xl px-4 pt-14 sm:px-6 [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-semibold [&_p]:mt-3 [&_p]:text-ink-2 [&_li]:text-ink-2 [&_ul]:mt-3 [&_ul]:grid [&_ul]:list-disc [&_ul]:gap-1.5 [&_ul]:ps-5">
      <h1 className="font-display text-4xl font-bold">{t("title")}</h1>
      <p>{t("intro")}</p>

      <h2>{t("controller.title")}</h2>
      <p>{t("controller.text")}</p>

      <h2>{t("data.title")}</h2>
      <ul>
        <li>{t("data.customers")}</li>
        <li>{t("data.teams")}</li>
      </ul>

      <h2>{t("consent.title")}</h2>
      <p>{t("consent.text")}</p>

      <h2>{t("rights.title")}</h2>
      <p>{t("rights.text")}</p>

      <h2>{t("retention.title")}</h2>
      <p>{t("retention.text")}</p>

      <h2>{t("security.title")}</h2>
      <p>{t("security.text")}</p>
    </article>
  );
}
