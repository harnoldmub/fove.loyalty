"use client";

import Link from "next/link";
import { Cookie, ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const CONSENT_STORAGE_KEY = "fove:cookie_consent";

export function openConsentBanner() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("fove:open-consent"));
  }
}

export function CookieSettingsButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={openConsentBanner}
      className={className ?? "text-left text-ink-2 hover:text-ink transition-colors"}
    >
      Gestion des cookies
    </button>
  );
}

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(CONSENT_STORAGE_KEY);
      if (!stored) {
        // Apparition discrète et fluide après chargement de la page
        const timer = setTimeout(() => setVisible(true), 600);
        return () => clearTimeout(timer);
      }
    } catch {
      // Si localStorage bloqué ou indisponible
    }
  }, []);

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
        gtag?: (...args: unknown[]) => void;
        clarity?: (...args: unknown[]) => void;
      };

      if (typeof win.gtag === "function") {
        win.gtag("consent", "update", {
          analytics_storage: status,
          ad_storage: status,
          ad_user_data: status,
          ad_personalization: status,
        });
      }

      if (typeof win.clarity === "function") {
        win.clarity("consent", status === "granted");
      }
    }

    setVisible(false);
  };

  if (!visible) return null;

  return (
    <aside
      aria-label="Consentement aux cookies"
      role="region"
      className="fixed bottom-4 left-4 right-4 z-50 sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-md animate-in fade-in slide-in-from-bottom-5 duration-300"
    >
      <div className="rounded-2xl border border-line bg-surface/95 dark:bg-[#0c1024]/95 p-4 sm:p-5 shadow-3 backdrop-blur-md">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-cobalt/10 text-cobalt dark:bg-cobalt/20 dark:text-cobalt-light">
              <Cookie className="size-4" aria-hidden="true" />
            </span>
            <p className="font-display text-sm font-semibold text-ink">
              Respect de votre vie privée
            </p>
          </div>
          <button
            type="button"
            onClick={() => updateConsent("denied")}
            className="rounded-md p-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cobalt"
            aria-label="Fermer sans accepter"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <p className="mt-2.5 text-xs text-ink-2 leading-relaxed">
          Nous mesurons l&apos;audience (Google Analytics, Clarity) pour améliorer votre expérience sur FOVE. Vos données restent sécurisées et ne sont jamais revendues.
          <Link
            href="/confidentialite"
            className="ml-1 text-ink underline underline-offset-2 hover:text-cobalt transition-colors"
          >
            En savoir plus
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
            Refuser
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => updateConsent("granted")}
            className="text-xs font-semibold h-8 px-4 shadow-sm"
          >
            <ShieldCheck className="size-3.5 mr-1" aria-hidden="true" />
            Accepter
          </Button>
        </div>
      </div>
    </aside>
  );
}
