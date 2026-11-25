import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LoginForm } from "@/components/auth-forms";
import { redirectIfSignedIn } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.meta");
  return { title: t("login"), robots: { index: false } };
}

type Props = { searchParams: Promise<{ next?: string | string[]; offre?: string | string[] }> };

export default async function Page({ searchParams }: Props) {
  await redirectIfSignedIn(await searchParams);
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
