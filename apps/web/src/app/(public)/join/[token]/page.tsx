import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { serverGet } from "@/lib/server-api";
import { JoinForm, type JoinPage } from "./form";

type Props = { params: Promise<{ token: string }> };

async function load(token: string) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(token)) return null;
  return (await serverGet<JoinPage>(`/public/join/${token}`)).data;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await load((await params).token);
  const t = await getTranslations("public.meta");
  const title = data ? t("joinTitle", { tenant: data.tenant.name }) : t("notFound");
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://fove.digital";
  const image = data?.tenant.logoUrl ?? `${site}/share-icon.png`;
  return {
    title,
    description: data ? t("joinDescription", { program: data.program.name }) : undefined,
    robots: { index: false },
    openGraph: { title, images: [{ url: image, secureUrl: image, width: 256, height: 256, alt: data?.tenant.name ?? "FOVE" }] },
    twitter: { card: "summary", title, images: [image] },
  };
}

export default async function JoinPageRoute({ params }: Props) {
  const { token } = await params;
  const data = await load(token);
  if (!data) notFound();
  return <JoinForm token={token} data={data} />;
}
