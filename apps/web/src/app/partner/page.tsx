import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireMe } from "@/lib/session";
import { PartnerDashboard } from "@/components/partner/partner-dashboard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("partner.portal.meta");
  return { title: t("title"), robots: { index: false } };
}

export default async function PartnerPortalPage() {
  const me = await requireMe("/partner");
  return <PartnerDashboard user={me.user} spaces={me.spaces} />;
}
