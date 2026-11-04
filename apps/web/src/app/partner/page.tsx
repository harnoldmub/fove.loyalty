import type { Metadata } from "next";
import { requireMe } from "@/lib/session";
import { PartnerDashboard } from "@/components/partner/partner-dashboard";

export const metadata: Metadata = {
  title: "Espace Partenaire Commercial · FOVE",
  robots: { index: false },
};

export default async function PartnerPortalPage() {
  const me = await requireMe("/partner");
  return <PartnerDashboard user={me.user} />;
}
