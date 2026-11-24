"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Check, CheckCircle2, Copy, MoreVertical, PlusSquare, Share, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogRoot } from "@/components/ui/dialog";

const KBD = "rounded bg-surface px-1 py-0.5 font-mono text-[11px] border";

/** Système du téléphone, pour adapter les explications. */
export function useDeviceOS(): "ios" | "android" | "other" {
  return useSyncExternalStore(
    () => () => undefined,
    () => {
      if (typeof navigator === "undefined") return "other";
      const ua = navigator.userAgent;
      if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
      if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return "ios";
      if (/Android/i.test(ua)) return "android";
      return "other";
    },
    () => "other",
  );
}

/**
 * Bouton « Ajouter à l'écran d'accueil » (invite d'installation native, sinon pas à pas iPhone / Android).
 * Utilisé par la carte d'un commerce et par « Mes cartes ». `texts` remplace les phrases propres à une carte.
 */
export function AddToHomeScreenButton({ tenantName, texts }: { tenantName: string; texts?: { description: string; androidDone: string } }) {
  const t = useTranslations("public.homeScreen");
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [prompt, setPrompt] = useState<(Event & { prompt: () => Promise<void>; userChoice?: Promise<{ outcome: string }> }) | null>(null);

  const os = useDeviceOS();
  const isStandalone = useSyncExternalStore(
    () => () => undefined,
    () => {
      if (typeof window === "undefined") return false;
      return (
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true
      );
    },
    () => false,
  );

  const isInApp = useSyncExternalStore(
    () => () => undefined,
    () => {
      if (typeof navigator === "undefined") return false;
      const ua = navigator.userAgent || "";
      return /FBAN|FBAV|Instagram|Line|Twitter|Snapchat|MicroMessenger|musical_ly|ByteDance/i.test(ua);
    },
    () => false,
  );

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as Event & { prompt: () => Promise<void>; userChoice?: Promise<{ outcome: string }> });
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const handleClick = async () => {
    if (prompt) {
      try {
        await prompt.prompt();
        const choice = await prompt.userChoice;
        if (choice?.outcome === "accepted") {
          toast.success(t("added"));
          return;
        }
      } catch {
        // Fallback vers l'explication si le prompt est ignoré ou échoue
      }
    }
    setOpen(true);
  };

  const handleCopyLink = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        toast.success(t("linkCopied"));
        setTimeout(() => setCopied(false), 2500);
        return;
      } catch {
        // fallback
      }
    }
    toast.info(t("linkFallback", { url }));
  };

  if (isStandalone) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-mint font-medium px-3 py-1.5 rounded-full bg-mint-soft border border-mint/20">
        <CheckCircle2 className="size-3.5" /> {t("installed")}
      </span>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="rounded-full shadow-xs hover:bg-surface-2 transition-all font-medium"
        onClick={handleClick}
        aria-label={t("buttonLabel")}
      >
        <Smartphone className="size-3.5 text-ink-2" />
        <span>{t("button")}</span>
      </Button>

      <DialogRoot open={open} onOpenChange={setOpen}>
        <DialogContent
          title={t("dialogTitle")}
          description={texts?.description ?? t("dialogDescription", { tenant: tenantName })}
          className="sm:max-w-md"
        >
          {os === "ios" ? (
            <div className="grid gap-3 py-1">
              <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-2/60 p-3">
                <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-cobalt/10 text-cobalt font-bold text-xs">
                  1
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">
                    {t.rich("ios.step1", { icon: () => <Share className="inline size-4 text-cobalt align-text-bottom mx-0.5" aria-hidden /> })}
                  </p>
                  <p className="text-xs text-ink-2 mt-0.5">
                    {t("ios.step1Hint")}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-2/60 p-3">
                <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-cobalt/10 text-cobalt font-bold text-xs">
                  2
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">
                    {t.rich("ios.step2", { icon: () => <PlusSquare className="inline size-4 text-ink align-text-bottom mx-0.5" aria-hidden /> })}
                  </p>
                  <p className="text-xs text-ink-2 mt-0.5">
                    {t("ios.step2Hint")}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-2/60 p-3">
                <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-mint/10 text-mint font-bold text-xs">
                  3
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">
                    {t("ios.step3")}
                  </p>
                  <p className="text-xs text-ink-2 mt-0.5">
                    {t("ios.step3Hint")}
                  </p>
                </div>
              </div>

              {isInApp && (
                <div className="rounded-lg bg-stamp-soft/30 p-2.5 text-xs text-ink-2">
                  <p className="font-medium text-stamp-ink dark:text-stamp">
                    {t("ios.inAppTitle")}
                  </p>
                  <p className="text-ink-3 mt-0.5">
                    {t.rich("ios.inAppText", { b: (c) => <strong>{c}</strong> })}
                  </p>
                </div>
              )}
            </div>
          ) : os === "android" ? (
            <div className="grid gap-3 py-1">
              <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-2/60 p-3">
                <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-cobalt/10 text-cobalt font-bold text-xs">
                  1
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">
                    {t.rich("android.step1", { icon: () => <MoreVertical className="inline size-4 text-ink align-text-bottom mx-0.5" aria-hidden /> })}
                  </p>
                  <p className="text-xs text-ink-2 mt-0.5">
                    {t("android.step1Hint")}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-2/60 p-3">
                <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-cobalt/10 text-cobalt font-bold text-xs">
                  2
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">
                    {t.rich("android.step2", { icon: () => <Smartphone className="inline size-4 text-ink align-text-bottom mx-0.5" aria-hidden /> })}
                  </p>
                  <p className="text-xs text-ink-2 mt-0.5">
                    {t("android.step2Hint")}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-2/60 p-3">
                <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-mint/10 text-mint font-bold text-xs">
                  3
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">
                    {t("android.step3")}
                  </p>
                  <p className="text-xs text-ink-2 mt-0.5">
                    {texts?.androidDone ?? t("android.step3Hint", { tenant: tenantName })}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 py-1">
              <p className="text-sm text-ink-2">
                {t("desktop.intro")}
              </p>
              <div className="rounded-xl border border-line bg-surface-2/60 p-3.5 space-y-2 text-xs text-ink-2">
                <p className="font-semibold text-ink">{t("desktop.tipsTitle")}</p>
                <ul className="space-y-1.5 list-disc list-inside">
                  <li>{t("desktop.tip1")}</li>
                  <li>{t("desktop.tip2")}</li>
                  <li>{t.rich("desktop.tip3", { kbd: (c: ReactNode) => <kbd dir="ltr" className={KBD}>{c}</kbd> })}</li>
                </ul>
              </div>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-between items-center gap-2 pt-2 border-t border-line">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCopyLink}
              className="w-full sm:w-auto text-xs text-ink-2 hover:text-ink"
            >
              {copied ? <Check className="size-3.5 text-mint" /> : <Copy className="size-3.5" />}
              <span>{copied ? t("copied") : t("copy")}</span>
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => setOpen(false)}
              className="w-full sm:w-auto"
            >
              {t("gotIt")}
            </Button>
          </div>
        </DialogContent>
      </DialogRoot>
    </>
  );
}
