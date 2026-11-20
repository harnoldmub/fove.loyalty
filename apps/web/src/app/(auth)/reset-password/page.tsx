import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ResetForm } from "@/components/auth-forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.meta");
  return { title: t("resetPassword"), robots: { index: false } };
}

export default function Page() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
