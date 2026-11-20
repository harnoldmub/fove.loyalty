import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { serverGet } from "@/lib/server-api";
import { CardView, type CardData } from "./view";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const t = await getTranslations("public.meta");
  return {
    title: t("cardTitle"),
    robots: { index: false, follow: false },
    manifest: `/card/${token}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: t("cardShortTitle"), statusBarStyle: "black-translucent" },
  };
}

export default async function CardPage({ params }: Props) {
  const { token } = await params;
  if (!token.startsWith("fvc_")) notFound();
  const { data } = await serverGet<CardData>(`/public/cards/${token}`);
  if (!data) notFound();
  return <CardView token={token} initial={data} />;
}
