import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireMe } from "@/lib/session";

export const metadata: Metadata = { title: { default: "Administration FOVE", template: "%s · Administration FOVE" }, robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await requireMe("/admin");
  if (!me.user.isSuperAdmin) notFound();

  return (
    <AdminShell
      user={{ name: me.user.name, email: me.user.email }}
      hasMerchantAccess={me.tenants.length > 0}
    >
      {children}
    </AdminShell>
  );
}
