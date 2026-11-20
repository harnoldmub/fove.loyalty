import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireMe } from "@/lib/session";
import { OnboardingWizard } from "./wizard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("onboarding.meta");
  return { title: t("title"), robots: { index: false } };
}

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const me = await requireMe("/onboarding");
  const { new: fresh } = await searchParams;
  const active = fresh ? null : me.tenants.find((t) => t.id === me.activeTenantId) ?? null;
  return <OnboardingWizard userName={me.user.name} tenant={active ? { id: active.id, name: active.name } : null} />;
}
