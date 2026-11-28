import { getTranslations } from "next-intl/server";
import { PageLoader } from "@/components/navigation/page-loader";

/**
 * Passage d'un espace à un autre (vitrine → espace commerçant, connexion → administration…) : l'espace
 * d'arrivée prépare sa session côté serveur. Entre deux pages d'un même espace, c'est le chargement de
 * cet espace qui s'affiche (app/app, admin, partner, (client)).
 */
export default async function RootLoading() {
  const t = await getTranslations("common");
  return (
    <div className="bg-paper">
      <PageLoader label={t("loading")} className="min-h-dvh" />
    </div>
  );
}
