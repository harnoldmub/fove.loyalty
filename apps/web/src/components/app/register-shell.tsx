"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Lock, LogOut, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Panel } from "@/components/ui/misc";
import { OtpInput } from "@/components/ui/otp-input";
import { DataLoader } from "@/components/navigation/data-loader";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { api, useErrorMessage } from "@/lib/api";
import { useMe } from "./me-context";

interface RegisterState {
  device: { id: string; name: string; establishment: string | null };
  tenant: { id: string; name: string; logoUrl: string | null; primaryColor: string | null };
  lockMinutes: number;
  cashiers: { membershipId: string; name: string; role: string }[];
  current: { membershipId: string; name: string } | null;
}

/**
 * Espace commerçant en mode caisse (docs/chantier-code-caisse.md) : seulement le scanner et la fiche de scan,
 * au nom du caissier déverrouillé ; verrouillage automatique après le délai du commerce.
 */
export function RegisterShell({ children }: { children: ReactNode }) {
  const t = useTranslations("app.register");
  const me = useMe();
  const register = me.register!;
  const router = useRouter();
  const pathname = usePathname();

  const lock = useCallback(async () => {
    await api.post("/app/register/lock").catch(() => undefined);
    router.refresh();
  }, [router]);

  // Seules les pages de caisse : le scanner et sa fiche.
  useEffect(() => {
    if (register.unlocked && !pathname.startsWith("/app/scanner")) router.replace("/app/scanner");
  }, [register.unlocked, pathname, router]);

  // Verrouillage automatique après le délai sans activité (le serveur l'applique aussi).
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!register.unlocked) return;
    const arm = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void lock(), register.lockMinutes * 60_000);
    };
    arm();
    const events = ["pointerdown", "keydown"] as const;
    events.forEach((e) => window.addEventListener(e, arm));
    return () => {
      if (timer.current) clearTimeout(timer.current);
      events.forEach((e) => window.removeEventListener(e, arm));
    };
  }, [register.unlocked, register.lockMinutes, lock]);

  const tenant = me.tenants[0];
  return (
    <div className="min-h-dvh bg-paper">
      <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          {tenant?.logoUrl ? (
            <img src={tenant.logoUrl} alt="" className="size-9 rounded-md object-cover" />
          ) : (
            <span className="grid size-9 place-items-center rounded-md font-display text-lg font-bold text-white" style={{ background: tenant?.primaryColor ?? "var(--cobalt)" }}>
              {tenant?.name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink">{tenant?.name}</p>
            <p className="truncate text-xs text-ink-3">{register.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {register.cashier && (
            <span className="flex items-center gap-1.5 rounded-full bg-cobalt-soft px-3 py-1 text-sm font-medium text-cobalt">
              <UserRound className="size-4" /> {register.cashier.name}
            </span>
          )}
          {register.unlocked && (
            <Button variant="secondary" size="sm" onClick={() => void lock()}>
              <Lock /> {t("switch")}
            </Button>
          )}
          <LocaleSwitcher />
        </div>
      </header>
      <main id="contenu" className="mx-auto w-full max-w-3xl px-4 py-6">
        {register.unlocked ? children : <LockScreen />}
      </main>
    </div>
  );
}

/** « Qui encaisse ? » : choix du collaborateur puis son code à 4 chiffres. */
function LockScreen() {
  const t = useTranslations("app.register");
  const errMsg = useErrorMessage();
  const router = useRouter();
  const { data, isLoading } = useQuery({ queryKey: ["register-state"], queryFn: () => api.get<RegisterState>("/app/register") });
  const [selected, setSelected] = useState<RegisterState["cashiers"][number] | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  const unlock = async (code: string) => {
    if (!selected || code.length !== 4) return;
    setBusy(true);
    try {
      await api.post("/app/register/unlock", { membershipId: selected.membershipId, pin: code });
      router.replace("/app/scanner");
      router.refresh();
    } catch (e) {
      toast.error(errMsg(e));
      setPin("");
      setBusy(false);
    }
  };

  if (isLoading || !data) return <DataLoader />;
  return (
    <div className="mx-auto grid max-w-lg gap-5">
      {!selected ? (
        <Panel className="grid gap-4 p-6">
          <div className="grid gap-1 text-center">
            <h1 className="font-display text-2xl font-bold text-ink">{t("who")}</h1>
            <p className="text-sm text-ink-2">{data.device.establishment ? t("whoHelpAt", { establishment: data.device.establishment }) : t("whoHelp")}</p>
          </div>
          {data.cashiers.length === 0 ? (
            <p className="text-center text-sm text-ink-3">{t("noCashier")}</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {data.cashiers.map((c) => (
                <button
                  key={c.membershipId}
                  type="button"
                  onClick={() => {
                    setSelected(c);
                    setPin("");
                  }}
                  className="grid justify-items-center gap-2 rounded-[var(--radius)] border border-line bg-surface p-4 text-center shadow-xs transition-colors hover:border-cobalt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cobalt"
                >
                  <span className="grid size-12 place-items-center rounded-full bg-cobalt-soft font-display text-lg font-bold text-cobalt">{c.name.slice(0, 1).toUpperCase()}</span>
                  <span className="text-sm font-medium text-ink">{c.name}</span>
                </button>
              ))}
            </div>
          )}
        </Panel>
      ) : (
        <Panel className="grid gap-5 p-6">
          <div className="grid gap-1 text-center">
            <h1 className="font-display text-2xl font-bold text-ink">{t("hello", { name: selected.name })}</h1>
            <p className="text-sm text-ink-2">{t("pinHelp")}</p>
          </div>
          <OtpInput length={4} secret autoFocus value={pin} onChange={setPin} onComplete={(v) => void unlock(v)} disabled={busy} />
          <Button variant="ghost" onClick={() => setSelected(null)}>{t("back")}</Button>
        </Panel>
      )}
      <div className="text-center">
        <ConfirmDialog
          trigger={
            <Button variant="link" size="sm" className="text-ink-3">
              <LogOut /> {t("close")}
            </Button>
          }
          title={t("closeTitle")}
          consequence={t("closeConsequence")}
          confirmLabel={t("closeConfirm")}
          onConfirm={async () => {
            await api.post("/auth/logout").catch(() => undefined);
            window.location.assign("/login");
          }}
        />
      </div>
    </div>
  );
}
