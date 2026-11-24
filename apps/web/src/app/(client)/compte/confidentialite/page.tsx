import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalDocument } from "@/components/client/legal-document";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("client.legal");
  return { title: (t.raw("privacy") as { title: string }).title };
}

export default function Page() {
  return <LegalDocument doc="privacy" />;
}
