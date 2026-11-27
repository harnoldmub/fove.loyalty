import { getTranslations } from "next-intl/server";
import { PageLoader } from "@/components/navigation/page-loader";

/** Affiché dans la zone de contenu pendant le passage d'une page de l'administration à une autre. */
export default async function AdminLoading() {
  const t = await getTranslations("common");
  return <PageLoader label={t("loading")} />;
}
