"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as Menu from "@radix-ui/react-dropdown-menu";
import {
  BarChart3,
  Building2,
  ChevronsUpDown,
  CreditCard,
  Gift,
  Home,
  LogOut,
  Menu as MenuIcon,
  Plug,
  ReceiptText,
  ScanLine,
  Settings,
  ShieldCheck,
  Sparkles,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useActiveTenant, useMe } from "./me-context";

const NAV = [
  { href: "/app", label: "Vue d’ensemble", icon: Home, permission: "analytics.read" },
  { href: "/app/scanner", label: "Scanner", icon: ScanLine, permission: "transactions.create" },
  { href: "/app/customers", label: "Clients", icon: Users, permission: "customers.read" },
  { href: "/app/transactions", label: "Transactions", icon: ReceiptText, permission: "transactions.read" },
  { href: "/app/programs", label: "Programmes", icon: Sparkles, permission: "programs.read" },
  { href: "/app/rewards", label: "Récompenses", icon: Gift, permission: "rewards.read" },
  { href: "/app/analytics", label: "Statistiques", icon: BarChart3, permission: "analytics.read" },
  { href: "/app/establishments", label: "Établissements", icon: Building2, permission: "establishments.read" },
  { href: "/app/team", label: "Collaborateurs", icon: UserCog, permission: "members.read" },
  { href: "/app/integrations", label: "Intégrations", icon: Plug, permission: "integrations.read" },
  { href: "/app/billing", label: "Abonnement", icon: CreditCard, permission: "billing.read" },
  { href: "/app/settings", label: "Paramètres", icon: Settings, permission: "tenant.read" },
];

const MOBILE = ["/app", "/app/scanner", "/app/customers", "/app/transactions"];

function useNav() {
  const me = useMe();
  return NAV.filter((n) => me.permissions.includes(n.permission));
}

function isActive(pathname: string, href: string) {
  return href === "/app" ? pathname === "/app" : pathname.startsWith(href);
}

function TenantSwitcher() {
  const me = useMe();
  const tenant = useActiveTenant();
  const router = useRouter();
  const switchTo = async (id: string) => {
    try {
      await api.post("/auth/switch-tenant", { tenantId: id });
      router.refresh();
      window.location.assign("/app");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <Menu.Root>
      <Menu.Trigger className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-surface-2">
        <span className="grid size-9 shrink-0 place-items-center rounded-sm font-display font-bold text-white" style={{ background: tenant?.primaryColor ?? "var(--cobalt)" }}>
          {tenant?.name.slice(0, 1).toUpperCase() ?? "?"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{tenant?.name ?? "Support"}</span>
          <span className="block truncate text-xs text-ink-3">{me.user.name}</span>
        </span>
        <ChevronsUpDown className="size-4 text-ink-3" aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="start" sideOffset={6} className="z-50 min-w-60 rounded-md bg-surface p-1 shadow-2">
          {me.tenants.map((t) => (
            <Menu.Item key={t.id} onSelect={() => t.id !== me.activeTenantId && switchTo(t.id)} className="flex cursor-pointer items-center gap-2 rounded-sm px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-surface-2">
              <span className="size-2.5 rounded-full" style={{ background: t.primaryColor }} />
              <span className="flex-1 truncate">{t.name}</span>
              {t.id === me.activeTenantId && <span className="text-xs text-ink-3">actif</span>}
            </Menu.Item>
          ))}
          <Menu.Separator className="my-1 h-px bg-line" />
          <Menu.Item asChild className="block cursor-pointer rounded-sm px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-surface-2">
            <Link href="/onboarding?new=1">Ajouter une entreprise</Link>
          </Menu.Item>
          {me.user.isSuperAdmin && (
            <Menu.Item asChild className="flex cursor-pointer items-center gap-2 rounded-sm px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-surface-2">
              <Link href="/admin">
                <ShieldCheck className="size-4" aria-hidden /> Administration FOVE
              </Link>
            </Menu.Item>
          )}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

async function logout() {
  await api.post("/auth/logout").catch(() => undefined);
  window.location.assign("/login");
}

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const items = useNav();
  return (
    <nav aria-label="Espace commerçant" className="grid gap-0.5">
      {items.map((n) => {
        const active = isActive(pathname, n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn("flex items-center gap-3 rounded-md px-3 py-2 text-[0.95rem] text-ink-2 hover:bg-surface-2 hover:text-ink", active && "bg-surface text-ink shadow-1")}
          >
            <n.icon className={cn("size-[18px]", active ? "text-cobalt" : "text-ink-3")} aria-hidden />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

function SupportBanner() {
  const me = useMe();
  if (!me.support) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 bg-stamp px-4 py-2 text-sm text-stamp-ink">
      Accès support en lecture seule : chaque consultation est journalisée.
      <button
        className="font-medium underline"
        onClick={async () => {
          await api.post("/admin/support/end");
          window.location.assign("/admin");
        }}
      >
        Terminer l’accès
      </button>
    </div>
  );
}

function VerifyBanner() {
  const me = useMe();
  const [sent, setSent] = useState(false);
  if (me.user.emailVerifiedAt || me.support) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-cobalt-soft px-4 py-2 text-center text-sm text-ink">
      Confirmez votre email ({me.user.email}) pour activer l’abonnement et les intégrations.
      <button
        className="font-medium text-cobalt underline disabled:opacity-60"
        disabled={sent}
        onClick={async () => {
          try {
            await api.post("/auth/resend-verification");
            setSent(true);
            toast.success("Email de confirmation envoyé");
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      >
        {sent ? "Email envoyé" : "Renvoyer l’email"}
      </button>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const items = useNav();
  const [open, setOpen] = useState(false);
  const mobile = items.filter((n) => MOBILE.includes(n.href));

  return (
    <div className="min-h-dvh">
      <SupportBanner />
      <VerifyBanner />
      <div className="lg:grid lg:grid-cols-[264px_1fr]">
        <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-line px-4 py-5 lg:flex">
          <Link href="/app" className="px-2" aria-label="Tableau de bord">
            <Logo />
          </Link>
          <TenantSwitcher />
          <div className="-mx-1 flex-1 overflow-y-auto px-1">
            <SideNav />
          </div>
          <div className="flex items-center justify-between border-t border-line pt-4">
            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut /> Déconnexion
            </Button>
            <ThemeToggle />
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-paper/90 px-4 backdrop-blur lg:hidden">
            <Link href="/app" aria-label="Tableau de bord">
              <Logo className="text-lg" />
            </Link>
            <div className="ml-auto flex items-center">
              <ThemeToggle />
              <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Ouvrir le menu" aria-expanded={open}>
                <MenuIcon />
              </Button>
            </div>
          </header>

          {open && (
            <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
              <button className="absolute inset-0 bg-[rgb(13_20_48/0.45)]" aria-label="Fermer le menu" onClick={() => setOpen(false)} />
              <div className="absolute inset-y-0 right-0 flex w-[min(320px,88vw)] flex-col gap-5 overflow-y-auto bg-paper p-4 shadow-2">
                <div className="flex items-center justify-between">
                  <span className="font-display text-lg font-semibold">Menu</span>
                  <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Fermer le menu">
                    <X />
                  </Button>
                </div>
                <TenantSwitcher />
                <SideNav onNavigate={() => setOpen(false)} />
                <Button variant="secondary" onClick={logout}>
                  <LogOut /> Déconnexion
                </Button>
              </div>
            </div>
          )}

          <main id="contenu" className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:pb-12 lg:pt-10">
            {children}
          </main>

          <nav aria-label="Navigation rapide" className="fixed inset-x-0 bottom-0 z-30 grid border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden" style={{ gridTemplateColumns: `repeat(${mobile.length}, 1fr)` }}>
            {mobile.map((n) => {
              const active = isActive(pathname, n.href);
              return (
                <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} className={cn("grid justify-items-center gap-0.5 py-2.5 text-[0.7rem] text-ink-3", active && "text-cobalt")}>
                  <n.icon className="size-5" aria-hidden />
                  {n.href === "/app" ? "Accueil" : n.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </div>
  );
}
