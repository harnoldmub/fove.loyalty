import { getTranslations } from "next-intl/server";
import { PageLoader } from "@/components/navigation/page-loader";

/** Affiché pendant le chargement de l'espace partenaire. */
export default async function PartnerLoading() {
  const t = await getTranslations("common");
  return <PageLoader label={t("loading")} className="min-h-dvh" />;
}
