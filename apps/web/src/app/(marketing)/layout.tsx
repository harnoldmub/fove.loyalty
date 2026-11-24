import { SiteFooter, SiteHeader } from "@/components/marketing/site-header";
import { PublicAnalytics } from "@/components/public-analytics";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="contenu">{children}</main>
      <SiteFooter />
      <PublicAnalytics />
    </>
  );
}
