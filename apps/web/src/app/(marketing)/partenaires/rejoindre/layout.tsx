import { namespacedPageMeta } from "@/lib/og";

export async function generateMetadata() {
  return namespacedPageMeta("partner.join.meta", "/partenaires/rejoindre");
}

export default function JoinPartnerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
