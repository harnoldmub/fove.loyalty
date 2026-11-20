import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";

export default async function NotFound() {
  const t = await getTranslations("common.notFound");
  return (
    <main id="contenu" className="mx-auto grid min-h-dvh max-w-md content-center justify-items-start gap-4 px-4">
      <h1 className="font-display text-4xl font-semibold">{t("title")}</h1>
      <p className="text-ink-2">{t("body")}</p>
      <Button asChild><Link href="/">{t("home")}</Link></Button>
    </main>
  );
}
