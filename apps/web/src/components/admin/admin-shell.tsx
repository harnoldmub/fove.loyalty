"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  Activity,
  Building2,
  CreditCard,
  LogOut,
  Menu,
  MessageSquare,
  ShieldCheck,
  Store,
  Users,
  X,
} from "lucide-react";
import { Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface AdminShellProps {
  user: {
    name: string;
    email: string;
  };
  hasMerchantAccess: boolean;
  children: ReactNode;
}

const NAV_GROUPS = [
  {
    title: "Commerces",
    items: [
      {
        href: "/admin",
        label: "Entreprises",
        icon: Building2,
        exact: true,
      },
      {
        href: "/admin/customers",
        label: "Clients et cartes",
        icon: Users,
        exact: false,
      },
    ],
  },
  {
    title: "Relation commerciale",
    items: [
      {
        href: "/admin/messages",
        label: "Messages et prospects",
        icon: MessageSquare,
        exact: false,
      },
    ],
  },
  {
    title: "Configuration",
    items: [
      {
        href: "/admin/plans",
        label: "Offres et abonnements",
        icon: CreditCard,
        exact: false,
      },
      {
        href: "/admin/system",
        label: "Intégrations et erreurs",
        icon: Activity,
        exact: false,
      },
    ],
  },
];

export function AdminShell({ user, hasMerchantAccess, children }: AdminShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string, exact: boolean) => {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  };

  const handleLogout = async () => {
    try {
      await api.post("/auth/logout");
      window.location.assign("/login");
    } catch {
      window.location.assign("/login");
    }
  };

  const navContent = (
    <div className="flex h-full flex-col justify-between">
      {/* Haut : Logo & Navigation */}
      <div>
        <div className="flex h-16 items-center gap-3 border-b border-line px-5">
          <Link href="/admin" className="flex items-center gap-2.5 focus-visible:outline-none">
            <Logo className="text-lg" />
          </Link>
          <span className="ml-auto rounded-md bg-surface-2 px-2 py-0.5 text-xs font-medium text-ink-2">Admin</span>
        </div>

        <nav aria-label="Menu administration" className="grid gap-6 p-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="mb-1.5 px-3 text-xs font-medium text-ink-3">
                {group.title}
              </p>
              <ul className="grid gap-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href, item.exact);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        className={cn(
                          "flex items-center gap-3 rounded-md px-3 py-2 text-[0.95rem] transition-colors",
                          active ? "bg-surface-2 font-medium text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
                        )}
                      >
                        <Icon className={cn("size-[18px] shrink-0", active ? "text-cobalt" : "text-ink-3")} aria-hidden />
                        <span className="flex-1 truncate">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      {/* Bas : Profil Super Admin & Liens rapides */}
      <div className="border-t border-line p-4">
        {hasMerchantAccess && (
          <Link
            href="/app"
            className="mb-3 flex items-center gap-2 rounded-md px-3 py-2 text-sm text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <Store className="size-4 text-ink-3" aria-hidden />
            Mon espace commerçant
          </Link>
        )}

        <div className="grid gap-2 rounded-md bg-surface-2 p-3">
          <div className="min-w-0" title={`${user.name} · ${user.email}`}>
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="size-4 shrink-0 text-mint" aria-hidden />
              <span className="truncate text-sm font-medium text-ink">{user.name}</span>
            </div>
            <span className="block truncate text-xs text-ink-3">{user.email}</span>
          </div>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex h-9 items-center gap-2 rounded-md px-2 text-sm text-ink-2 transition-colors hover:bg-surface hover:text-ink"
            >
              <LogOut className="size-4" aria-hidden /> Déconnexion
            </button>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-paper lg:grid lg:grid-cols-[16rem_1fr]">
      {/* Sidebar Desktop fixe */}
      <aside className="hidden border-r border-line bg-surface lg:block lg:min-h-dvh">
        <div className="sticky top-0 h-dvh overflow-y-auto">
          {navContent}
        </div>
      </aside>

      {/* Header Mobile avec Hamburger */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-line bg-surface px-4 lg:hidden">
        <Link href="/admin" className="flex items-center gap-2">
          <Logo className="text-lg" />
          <span className="rounded-md bg-surface-2 px-2 py-0.5 text-xs font-medium text-ink-2">Admin</span>
        </Link>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="grid size-9 place-items-center rounded-lg border border-line bg-surface text-ink hover:bg-surface-2"
            aria-label={mobileOpen ? "Fermer le menu" : "Ouvrir le menu"}
          >
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </header>

      {/* Tiroir Mobile */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-[rgb(13_20_48/0.45)]"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="fixed inset-y-0 left-0 w-72 max-w-[85vw] border-r border-line bg-surface shadow-2" role="dialog" aria-modal="true" aria-label="Menu administration">
            {navContent}
          </aside>
        </div>
      )}

      {/* Contenu principal */}
      <main id="contenu" className="mx-auto w-full min-w-0 max-w-6xl px-4 py-8 sm:px-8 lg:py-10">
        {children}
      </main>
    </div>
  );
}
