import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireMe } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.layout");
  return { title: { default: t("title"), template: t("titleTemplate") }, robots: { index: false } };
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await requireMe("/admin");
  const canAccessAdmin =
    me.user.isSuperAdmin ||
    me.user.adminRole === "SUPER_ADMIN" ||
    me.user.adminRole === "ASSOCIATE" ||
    me.user.adminRole === "FINANCE_MANAGER";

  if (!canAccessAdmin) notFound();

  return (
    <AdminShell
      user={{ name: me.user.name, email: me.user.email }}
      hasMerchantAccess={me.tenants.length > 0}
    >
      {children}
    </AdminShell>
  );
}
