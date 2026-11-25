import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ClientLogin } from "@/components/client/client-login";
import { redirectIfClientSignedIn } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("client.meta");
  return { title: t("login"), robots: { index: false } };
}

type Props = { searchParams: Promise<{ next?: string | string[]; code?: string | string[] }> };

export default async function Page({ searchParams }: Props) {
  await redirectIfClientSignedIn(await searchParams);
  return (
    <Suspense>
      <ClientLogin />
    </Suspense>
  );
}
