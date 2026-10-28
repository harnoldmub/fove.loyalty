import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { serverGet } from "@/lib/server-api";
import { CardView, type CardData } from "./view";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  return {
    title: "Ma carte de fidélité",
    robots: { index: false, follow: false },
    manifest: `/card/${token}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: "Ma carte", statusBarStyle: "black-translucent" },
  };
}

export default async function CardPage({ params }: Props) {
  const { token } = await params;
  if (!token.startsWith("fvc_")) notFound();
  const { data } = await serverGet<CardData>(`/public/cards/${token}`);
  if (!data) notFound();
  return <CardView token={token} initial={data} />;
}
