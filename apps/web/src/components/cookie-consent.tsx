"use client";

import Link from "next/link";
import { Cookie, ShieldCheck, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const CONSENT_STORAGE_KEY = "fove:cookie_consent";

export function openConsentBanner() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("fove:open-consent"));
  }
}

export function CookieSettingsButton({ className }: { className?: string }) {
  const t = useTranslations("common.cookies");
  return (
    <button
      type="button"
      onClick={openConsentBanner}
      className={className ?? "text-start text-ink-2 hover:text-ink transition-colors"}
    >
      {t("settings")}
    </button>
  );
}

/** Charge Microsoft Clarity (extrait officiel) une seule fois, uniquement après consentement. */
function loadClarity(id: string) {
  if (!/^[a-z0-9]+$/i.test(id) || document.getElementById("clarity-init")) return;
  const script = document.createElement("script");
  script.id = "clarity-init";
  script.textContent = `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${id}");clarity("consent");`;
  document.head.appendChild(script);
}

export function CookieConsent({ clarityId }: { clarityId?: string }) {
  const t = useTranslations("common.cookies");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(CONSENT_STORAGE_KEY);
      if (stored === "granted" && clarityId) loadClarity(clarityId);
      if (!stored) {
        // Apparition discrète et fluide après chargement de la page
        const timer = setTimeout(() => setVisible(true), 600);
        return () => clearTimeout(timer);
      }
    } catch {
      // Si localStorage bloqué ou indisponible
    }
  }, [clarityId]);

  useEffect(() => {
    const handleOpen = () => setVisible(true);
    window.addEventListener("fove:open-consent", handleOpen);
    return () => window.removeEventListener("fove:open-consent", handleOpen);
  }, []);

  const updateConsent = (status: "granted" | "denied") => {
    try {
      localStorage.setItem(CONSENT_STORAGE_KEY, status);
    } catch {
      // Ignorer
    }

    if (typeof window !== "undefined") {
      const win = window as unknown as {
        dataLayer?: unknown[];
        gtag?: (...args: unknown[]) => void;
        clarity?: (...args: unknown[]) => void;
      };

      // `gtag` est déclaré par le script d'amorçage GTM (layout racine).
      win.gtag?.("consent", "update", {
        analytics_storage: status,
        ad_storage: status,
        ad_user_data: status,
        ad_personalization: status,
      });
      win.dataLayer = win.dataLayer || [];
      win.dataLayer.push({ event: "fove_consent_update", consent: status });

      if (status === "granted" && clarityId) loadClarity(clarityId);
      else if (typeof win.clarity === "function") win.clarity("consent", false);
    }

    setVisible(false);
  };

  if (!visible) return null;

  return (
    <aside
      aria-label={t("region")}
      role="region"
      className="fixed bottom-4 start-4 end-4 z-50 sm:start-auto sm:end-6 sm:bottom-6 sm:max-w-md animate-in fade-in slide-in-from-bottom-5 duration-300"
    >
      <div className="rounded-2xl border border-line bg-surface/95 dark:bg-[#0c1024]/95 p-4 sm:p-5 shadow-3 backdrop-blur-md">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-cobalt/10 text-cobalt dark:bg-cobalt/20 dark:text-cobalt-light">
              <Cookie className="size-4" aria-hidden="true" />
            </span>
            <p className="font-display text-sm font-semibold text-ink">
              {t("title")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => updateConsent("denied")}
            className="rounded-md p-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cobalt"
            aria-label={t("closeWithoutAccepting")}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <p className="mt-2.5 text-xs text-ink-2 leading-relaxed">
          {t("body")}
          <Link
            href="/confidentialite#cookies"
            className="ms-1 text-ink underline underline-offset-2 hover:text-cobalt transition-colors"
          >
            {t("learnMore")}
          </Link>
        </p>

        <div className="mt-4 flex items-center justify-end gap-2.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => updateConsent("denied")}
            className="text-xs text-ink-2 hover:text-ink h-8 px-3"
          >
            {t("decline")}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => updateConsent("granted")}
            className="text-xs font-semibold h-8 px-4 shadow-sm"
          >
            <ShieldCheck className="size-3.5 me-1" aria-hidden="true" />
            {t("accept")}
          </Button>
        </div>
      </div>
    </aside>
  );
}
