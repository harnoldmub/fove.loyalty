import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ReportForm } from "./form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("public.collectionReport");
  return { title: t("title"), robots: { index: false } };
}

type Props = { searchParams: Promise<{ token?: string | string[] }> };

/** « Signaler un problème » depuis l'email de confirmation d'un encaissement fait par un partenaire. */
export default async function CollectionReportPage({ searchParams }: Props) {
  const raw = (await searchParams).token;
  const token = typeof raw === "string" ? raw.slice(0, 200) : "";
  return (
    <main className="mx-auto grid min-h-[70dvh] max-w-lg content-center gap-6 px-4 py-12">
      <ReportForm token={token} />
    </main>
  );
}
