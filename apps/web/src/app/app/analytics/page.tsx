import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { OverviewView } from "@/components/app/overview";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.meta");
  return { title: t("analytics") };
}

export default function AnalyticsPage() {
  return <OverviewView mode="analytics" />;
}
