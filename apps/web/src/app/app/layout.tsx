import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/app/shell";
import { MeProvider } from "@/components/app/me-context";
import { requireMe } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.meta");
  return { title: { default: t("app"), template: "%s · FOVE" }, robots: { index: false } };
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireMe("/app");
  if (!me.activeTenantId) redirect(me.user.isSuperAdmin && me.tenants.length === 0 ? "/admin" : "/onboarding");
  const active = me.tenants.find((t) => t.id === me.activeTenantId);
  if (active && !active.onboardingCompleted && (me.role === "OWNER" || me.role === "MANAGER")) redirect("/onboarding");
  return (
    <MeProvider me={me}>
      <AppShell>{children}</AppShell>
    </MeProvider>
  );
}
