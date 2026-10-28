import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireMe } from "@/lib/session";

export const metadata: Metadata = { title: { default: "Administration FOVE", template: "%s · Administration FOVE" }, robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await requireMe("/admin");
  if (!me.user.isSuperAdmin) notFound();
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/admin" className="flex items-center gap-2">
            <Logo className="text-lg" />
            <span className="text-sm text-ink-3">Administration</span>
          </Link>
          <nav aria-label="Administration" className="flex gap-1 overflow-x-auto text-sm">
            <Link className="rounded-sm px-2.5 py-1.5 text-ink-2 hover:text-ink" href="/admin">Entreprises</Link>
            <Link className="rounded-sm px-2.5 py-1.5 text-ink-2 hover:text-ink" href="/admin/plans">Offres</Link>
            <Link className="rounded-sm px-2.5 py-1.5 text-ink-2 hover:text-ink" href="/admin/system">Intégrations et erreurs</Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {me.tenants.length > 0 && <Link href="/app" className="hidden text-sm text-ink-2 hover:text-ink sm:block">Mon espace</Link>}
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main id="contenu" className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
