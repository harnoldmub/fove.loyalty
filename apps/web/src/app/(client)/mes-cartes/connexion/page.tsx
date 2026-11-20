import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ClientLogin } from "@/components/client/client-login";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("client.meta");
  return { title: t("login"), robots: { index: false } };
}

export default function Page() {
  return (
    <Suspense>
      <ClientLogin />
    </Suspense>
  );
}
