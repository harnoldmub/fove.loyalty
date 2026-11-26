"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import * as Menu from "@radix-ui/react-dropdown-menu";
import {
  BarChart3,
  Building2,
  ChevronsUpDown,
  CreditCard,
  Gift,
  Home,
  LogOut,
  Megaphone,
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
import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Logo } from "@/components/brand";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { SwitchingOverlay } from "@/components/app/switching-overlay";
import { UpgradeNudge } from "@/components/app/upgrade";
import { LoaderCircle, type LucideIcon } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { api, EMAIL_NOT_VERIFIED_EVENT, useErrorMessage } from "@/lib/api";
import { DialogContent, DialogRoot } from "@/components/ui/dialog";
import { useIsNativeApp } from "@/lib/native-app";
import { cn } from "@/lib/utils";
import { useActiveTenant, useMe } from "./me-context";

const NAV = [
  { href: "/app", key: "overview", icon: Home, permission: "analytics.read" },
  { href: "/app/scanner", key: "scanner", icon: ScanLine, permission: "transactions.create" },
  { href: "/app/customers", key: "customers", icon: Users, permission: "customers.read" },
  { href: "/app/transactions", key: "transactions", icon: ReceiptText, permission: "transactions.read" },
  { href: "/app/programs", key: "programs", icon: Sparkles, permission: "programs.read" },
  { href: "/app/rewards", key: "rewards", icon: Gift, permission: "rewards.read" },
  { href: "/app/analytics", key: "analytics", icon: BarChart3, permission: "analytics.read" },
  { href: "/app/establishments", key: "establishments", icon: Building2, permission: "establishments.read" },
  { href: "/app/team", key: "team", icon: UserCog, permission: "members.read" },
  { href: "/app/integrations", key: "integrations", icon: Plug, permission: "integrations.read" },
  { href: "/app/billing", key: "billing", icon: CreditCard, permission: "billing.read" },
  { href: "/app/parrainage", key: "referral", icon: Megaphone, permission: "billing.read" },
  { href: "/app/settings", key: "settings", icon: Settings, permission: "tenant.read" },
] as const;

const MOBILE = ["/app", "/app/scanner", "/app/customers", "/app/transactions"];

function useNav() {
  const me = useMe();
  const native = useIsNativeApp();
  // L'abonnement se gère sur le web : pas de paiement dans l'app mobile.
  return NAV.filter((n) => me.permissions.includes(n.permission) && !(native && n.href === "/app/billing"));
}

function isActive(pathname: string, href: string) {
  return href === "/app" ? pathname === "/app" : pathname.startsWith(href);
}

function TenantSwitcher() {
  const toErrorMessage = useErrorMessage();
  const t = useTranslations("app.shell");
  const me = useMe();
  const tenant = useActiveTenant();
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const switchTo = async (id: string, name: string) => {
    setSwitchingTo(name);
    try {
      await api.post("/auth/switch-tenant", { tenantId: id });
      // Rechargement complet : l'écran d'attente reste affiché jusqu'à la nouvelle page.
      window.location.assign("/app");
    } catch (e) {
      setSwitchingTo(null);
      toast.error(toErrorMessage(e));
    }
  };
  return (
    <>
    {switchingTo && <SwitchingOverlay name={switchingTo} />}
    <Menu.Root>
      <Menu.Trigger className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-start hover:bg-surface-2">
        {tenant?.logoUrl ? (
          <img src={tenant.logoUrl} alt="" className="size-9 shrink-0 rounded-sm border border-line bg-white object-cover" />
        ) : (
          <span className="grid size-9 shrink-0 place-items-center rounded-sm font-display font-bold text-white" style={{ background: tenant?.primaryColor ?? "var(--cobalt)" }}>
            {tenant?.name.slice(0, 1).toUpperCase() ?? "?"}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{tenant?.name ?? t("support")}</span>
          <span className="block truncate text-xs text-ink-3">{me.user.name}</span>
        </span>
        <ChevronsUpDown className="size-4 text-ink-3" aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="start" sideOffset={6} className="z-50 min-w-60 rounded-md bg-surface p-1 shadow-2">
          {me.tenants.map((tn) => (
            <Menu.Item key={tn.id} onSelect={() => tn.id !== me.activeTenantId && switchTo(tn.id, tn.name)} className="flex cursor-pointer items-center gap-2 rounded-sm px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-surface-2">
              {tn.logoUrl ? (
                <img src={tn.logoUrl} alt="" className="size-5 shrink-0 rounded-full border border-line bg-white object-cover" />
              ) : (
                <span className="size-2.5 rounded-full" style={{ background: tn.primaryColor }} />
              )}
              <span className="flex-1 truncate">{tn.name}</span>
              {tn.id === me.activeTenantId && <span className="text-xs text-ink-3">{t("active")}</span>}
            </Menu.Item>
          ))}
          <Menu.Separator className="my-1 h-px bg-line" />
          <Menu.Item asChild className="block cursor-pointer rounded-sm px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-surface-2">
            <Link href="/onboarding?new=1">{t("addBusiness")}</Link>
          </Menu.Item>
          {me.user.isSuperAdmin && (
            <Menu.Item asChild className="flex cursor-pointer items-center gap-2 rounded-sm px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-surface-2">
              <Link href="/admin">
                <ShieldCheck className="size-4" aria-hidden /> {t("foveAdmin")}
              </Link>
            </Menu.Item>
          )}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
    </>
  );
}

async function logout() {
  await api.post("/auth/logout").catch(() => undefined);
  window.location.assign("/login");
}

/** Icône d'un onglet : remplacée par un indicateur de chargement tant que la page demandée n'est pas affichée. */
function NavIcon({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  const { pending } = useLinkStatus();
  return pending ? (
    <LoaderCircle className={cn(className, "animate-spin text-cobalt motion-reduce:animate-none")} aria-hidden />
  ) : (
    <Icon className={className} aria-hidden />
  );
}

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations("app.nav");
  const pathname = usePathname();
  const items = useNav();
  return (
    <nav aria-label={t("label")} className="grid gap-0.5">
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
            <NavIcon icon={n.icon} className={cn("size-[18px]", active ? "text-cobalt" : "text-ink-3")} />
            {t(n.key)}
          </Link>
        );
      })}
    </nav>
  );
}

function SupportBanner() {
  const t = useTranslations("app.shell");
  const me = useMe();
  if (!me.support) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 bg-stamp px-4 py-2 text-sm text-stamp-ink">
      {t("supportBanner")}
      <button
        className="font-medium underline"
        onClick={async () => {
          await api.post("/admin/support/end");
          window.location.assign("/admin");
        }}
      >
        {t("endSupport")}
      </button>
    </div>
  );
}

/**
 * Compte antérieur à la connexion par code, email jamais confirmé : se reconnecter avec le code
 * reçu par email confirme l'adresse (docs/chantier-connexion-otp.md).
 */
async function confirmWithCode(email: string) {
  await api.post("/auth/logout").catch(() => undefined);
  window.location.assign(`/login?${new URLSearchParams({ email, next: window.location.pathname })}`);
}

function VerifyBanner() {
  const t = useTranslations("app.shell");
  const me = useMe();
  if (me.user.emailVerifiedAt || me.support) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-cobalt-soft px-4 py-2 text-center text-sm text-ink">
      {t("verifyBanner", { email: me.user.email })}
      <button className="font-medium text-cobalt underline" onClick={() => void confirmWithCode(me.user.email)}>
        {t("confirmWithCode")}
      </button>
    </div>
  );
}

/**
 * Fenêtre « Confirmez d'abord votre email » : s'ouvre dès qu'une action est refusée avec
 * `email_not_verified` (inviter, exporter, importer, envois groupés, intégrations, > 50 clients).
 */
function VerifyEmailDialog() {
  const t = useTranslations("app.shell");
  const me = useMe();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onRefused = () => setOpen(true);
    window.addEventListener(EMAIL_NOT_VERIFIED_EVENT, onRefused);
    return () => window.removeEventListener(EMAIL_NOT_VERIFIED_EVENT, onRefused);
  }, []);
  if (me.user.emailVerifiedAt) return null;
  return (
    <DialogRoot open={open} onOpenChange={setOpen}>
      <DialogContent title={t("verifyDialog.title")} description={t("verifyDialog.body", { email: me.user.email })}>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            {t("verifyDialog.close")}
          </Button>
          <Button onClick={() => void confirmWithCode(me.user.email)}>{t("confirmWithCode")}</Button>
        </div>
      </DialogContent>
    </DialogRoot>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations("app.shell");
  const tn = useTranslations("app.nav");
  const pathname = usePathname();
  const items = useNav();
  const [open, setOpen] = useState(false);
  const mobile = items.filter((n) => MOBILE.includes(n.href));

  return (
    <div className="min-h-dvh">
      <SupportBanner />
      <VerifyBanner />
      <VerifyEmailDialog />
      <div className="lg:grid lg:grid-cols-[264px_1fr]">
        <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-e border-line px-4 py-5 lg:flex">
          <Link href="/app" className="px-2" aria-label={t("dashboard")}>
            <Logo />
          </Link>
          <TenantSwitcher />
          <div className="-mx-1 flex-1 overflow-y-auto px-1">
            <SideNav />
          </div>
          <div className="flex items-center justify-between border-t border-line pt-4">
            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut /> {t("logout")}
            </Button>
            <LocaleSwitcher />
            <ThemeToggle />
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-paper/90 px-4 backdrop-blur lg:hidden">
            <Link href="/app" aria-label={t("dashboard")}>
              <Logo className="text-lg" />
            </Link>
            <div className="ms-auto flex items-center">
              <LocaleSwitcher />
              <ThemeToggle />
              <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label={t("openMenu")} aria-expanded={open}>
                <MenuIcon />
              </Button>
            </div>
          </header>

          {open && (
            <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={t("menu")}>
              <button className="absolute inset-0 bg-[rgb(13_20_48/0.45)]" aria-label={t("closeMenu")} onClick={() => setOpen(false)} />
              <div className="absolute inset-y-0 end-0 flex w-[min(320px,88vw)] flex-col gap-5 overflow-y-auto bg-paper p-4 shadow-2">
                <div className="flex items-center justify-between">
                  <span className="font-display text-lg font-semibold">{t("menu")}</span>
                  <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label={t("closeMenu")}>
                    <X />
                  </Button>
                </div>
                <TenantSwitcher />
                <SideNav onNavigate={() => setOpen(false)} />
                <Button variant="secondary" onClick={logout}>
                  <LogOut /> {t("logout")}
                </Button>
              </div>
            </div>
          )}

          <main id="contenu" className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:pb-12 lg:pt-10">
            <UpgradeNudge />
            {children}
          </main>

          <nav aria-label={t("quickNav")} className="fixed inset-x-0 bottom-0 z-30 grid border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden" style={{ gridTemplateColumns: `repeat(${mobile.length}, 1fr)` }}>
            {mobile.map((n) => {
              const active = isActive(pathname, n.href);
              return (
                <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} className={cn("grid justify-items-center gap-0.5 py-2.5 text-[0.7rem] text-ink-3", active && "text-cobalt")}>
                  <NavIcon icon={n.icon} className="size-5" />
                  {n.href === "/app" ? tn("home") : tn(n.key)}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </div>
  );
}
