import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminMfaGate } from "@/components/admin/admin-mfa-gate";
import { serverGet } from "@/lib/server-api";
import { isAdmin, requireMe } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.layout");
  return { title: { default: t("title"), template: t("titleTemplate") }, robots: { index: false } };
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await requireMe("/admin");
  if (!isAdmin(me.user)) notFound();
  // Double authentification : activation ou code de l'application avant toute page de l'administration.
  const { data: mfa } = await serverGet<{ required: boolean; enabled: boolean; verified: boolean }>("/auth/mfa", true);
  if (mfa && !mfa.verified) return <AdminMfaGate enabled={mfa.enabled} email={me.user.email} />;

  return (
    <AdminShell
      user={{ name: me.user.name, email: me.user.email }}
      hasMerchantAccess={me.tenants.length > 0}
      hasPartnerAccess={me.spaces.partner}
    >
      {children}
    </AdminShell>
  );
}
