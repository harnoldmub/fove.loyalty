import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LoginForm } from "@/components/auth-forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.meta");
  return { title: t("login"), robots: { index: false } };
}

export default function Page() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
