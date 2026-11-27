import { getTranslations } from "next-intl/server";
import { PageLoader } from "@/components/navigation/page-loader";

/** Affiché pendant le chargement de l'espace client (Mes cartes, compte). */
export default async function ClientLoading() {
  const t = await getTranslations("common");
  return <PageLoader label={t("loading")} />;
}
