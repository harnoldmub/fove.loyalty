import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
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
  const t = await getTranslations("public.meta");
  const title = data ? t("joinTitle", { tenant: data.tenant.name }) : t("notFound");
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://fove.digital";
  const image = data?.tenant.logoUrl ?? `${site}/share-icon.png`;
  return {
    title,
    description: data ? t("joinDescriptionTenant", { program: data.program.name, tenant: data.tenant.name }) : undefined,
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

