import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/app/shell";
import { RegisterShell } from "@/components/app/register-shell";
import { MeProvider } from "@/components/app/me-context";
import { requireMe } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.meta");
  return { title: { default: t("app"), template: "%s · FOVE" }, robots: { index: false } };
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireMe("/app");
  // Appareil en mode caisse : écran de caisse seulement (docs/chantier-code-caisse.md).
  if (me.register) {
    return (
      <MeProvider me={me}>
        <RegisterShell>{children}</RegisterShell>
      </MeProvider>
    );
  }
  // Sans commerce : l'espace d'arrivée du compte (administration ou partenaire), sinon la création du commerce.
  if (!me.activeTenantId) redirect(me.tenants.length === 0 && me.home !== "/app" ? me.home : "/onboarding");
  const active = me.tenants.find((t) => t.id === me.activeTenantId);
  if (active && !active.onboardingCompleted && (me.role === "OWNER" || me.role === "MANAGER")) redirect("/onboarding");
  return (
    <MeProvider me={me}>
      <AppShell>{children}</AppShell>
    </MeProvider>
  );
}
