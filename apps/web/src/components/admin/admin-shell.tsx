"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  Activity,
  ArrowUpRight,
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
import { Badge } from "@/components/ui/misc";
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
    title: "GESTION COMMERCES",
    items: [
      {
        href: "/admin",
        label: "Entreprises",
        icon: Building2,
        exact: true,
      },
      {
        href: "/admin/customers",
        label: "Clients & Cartes",
        icon: Users,
        exact: false,
      },
    ],
  },
  {
    title: "RELATION COMMERCIALE",
    items: [
      {
        href: "/admin/messages",
        label: "Messages & Leads",
        icon: MessageSquare,
        exact: false,
      },
    ],
  },
  {
    title: "CONFIGURATION & SYSTÈME",
    items: [
      {
        href: "/admin/plans",
        label: "Offres & Abonnements",
        icon: CreditCard,
        exact: false,
      },
      {
        href: "/admin/system",
        label: "Intégrations & Erreurs",
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
            <Logo className="text-xl" />
          </Link>
          <span className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[0.68rem] font-semibold tracking-wider text-ink-3 uppercase">
            Admin
          </span>
        </div>

        <nav aria-label="Menu administration" className="grid gap-6 p-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="px-3 text-[0.68rem] font-semibold tracking-wider text-ink-3 uppercase mb-1.5">
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
                          "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                          active
                            ? "bg-cobalt text-white shadow-xs font-semibold"
                            : "text-ink-2 hover:bg-surface-2 hover:text-ink"
                        )}
                      >
                        <Icon className={cn("size-4 shrink-0", active ? "text-white" : "text-ink-3")} aria-hidden />
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
            className="mb-3 flex items-center justify-between rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-surface-3 hover:border-line-2"
          >
            <span className="flex items-center gap-2">
              <Store className="size-3.5 text-cobalt" />
              <span>Espace Commerçant</span>
            </span>
            <ArrowUpRight className="size-3.5 text-ink-3" />
          </Link>
        )}

        <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-2/60 p-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-emerald-600" />
              <span className="truncate text-xs font-semibold text-ink">{user.name}</span>
            </div>
            <span className="block truncate text-[0.7rem] text-ink-3">{user.email}</span>
          </div>

          <div className="flex items-center gap-1">
            <ThemeToggle />
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Se déconnecter"
              className="grid size-8 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-surface-3 hover:text-danger"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-background lg:grid lg:grid-cols-[16rem_1fr]">
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
          <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[0.68rem] font-semibold text-ink-3 uppercase">
            Admin
          </span>
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
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 w-72 max-w-[85vw] border-r border-line bg-surface shadow-2xl">
            {navContent}
          </aside>
        </div>
      )}

      {/* Contenu principal */}
      <main id="contenu" className="min-w-0 px-4 py-8 sm:px-8 max-w-7xl">
        {children}
      </main>
    </div>
  );
}
