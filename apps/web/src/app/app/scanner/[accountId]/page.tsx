import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CheckoutView } from "./view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.meta");
  return { title: t("checkout") };
}

export default async function Page({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  return <CheckoutView accountId={accountId} />;
}
