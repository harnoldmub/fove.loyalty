import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ClientHome } from "@/components/client/client-home";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("client.meta");
  return { title: t("home"), robots: { index: false } };
}

export default function Page() {
  return <ClientHome />;
}
