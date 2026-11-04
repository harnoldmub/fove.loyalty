import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireMe } from "@/lib/session";

export const metadata: Metadata = { title: { default: "Administration", template: "%s · Administration FOVE" }, robots: { index: false } };

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
