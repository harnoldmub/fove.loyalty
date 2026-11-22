import { LoaderCircle } from "lucide-react";
import { getTranslations } from "next-intl/server";

/** Affiché dans la zone de contenu pendant le passage d'une page de l'espace commerçant à une autre. */
export default async function AppLoading() {
  const t = await getTranslations("common");
  return (
    <div role="status" aria-live="polite" className="grid min-h-[50dvh] place-items-center">
      <div className="grid justify-items-center gap-3 text-ink-2">
        <LoaderCircle className="size-7 animate-spin text-cobalt motion-reduce:animate-none" aria-hidden />
        <p className="text-sm">{t("loading")}</p>
      </div>
    </div>
  );
}
