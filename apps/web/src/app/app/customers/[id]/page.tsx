import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CustomerDetail } from "./view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.meta");
  return { title: t("customer") };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CustomerDetail id={id} />;
}
