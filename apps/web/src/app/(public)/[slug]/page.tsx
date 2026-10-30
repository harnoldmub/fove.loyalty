import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { serverGet } from "@/lib/server-api";
import { JoinForm, type JoinPage } from "../join/[token]/form";

type Props = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(slug) || slug.length < 3 || slug.length > 48) return null;
  return (await serverGet<JoinPage>(`/public/join/${slug.toLowerCase()}`)).data;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await load(slug);
  const title = data ? `Rejoignez ${data.tenant.name}` : "Programme introuvable";
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://fove.digital";
  const image = data?.tenant.logoUrl ?? `${site}/share-icon.png`;
  return {
    title,
    description: data ? `Créez votre carte de fidélité ${data.program.name} chez ${data.tenant.name} en 30 secondes.` : undefined,
    openGraph: { title, images: [{ url: image, secureUrl: image, width: 256, height: 256, alt: data?.tenant.name ?? "FOVE" }] },
    twitter: { card: "summary", title, images: [image] },
  };
}

export default async function TenantPublicSlugPage({ params }: Props) {
  const { slug } = await params;
  const normalized = slug.toLowerCase();
  const data = await load(normalized);
  if (!data) notFound();
  return <JoinForm token={normalized} data={data} />;
}

