import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SignupForm } from "@/components/auth-forms";
import { redirectIfSignedIn } from "@/lib/session";
import { freeCustomerLimit } from "@/lib/free-plan";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.meta");
  return { title: t("signup"), robots: { index: false } };
}

type Props = { searchParams: Promise<{ next?: string | string[]; offre?: string | string[] }> };

export default async function Page({ searchParams }: Props) {
  await redirectIfSignedIn(await searchParams);
  const freeCustomers = await freeCustomerLimit();
  return (
    <Suspense>
      <SignupForm freeCustomers={freeCustomers} />
    </Suspense>
  );
}
