"use client";

import { useSyncExternalStore } from "react";
import { BILLING_CURRENCIES, isBillingCurrency, onlineCurrencyFor, type BillingCurrency } from "@fove/shared";

/** Monnaie d'affichage des prix sur la vitrine (docs/chantier-multi-devises.md). */
export type MarketingCurrency = BillingCurrency;
export const MARKETING_CURRENCIES = BILLING_CURRENCIES;

/** Cookie partagé avec le proxy, qui le pose d'après le pays du visiteur (comme la langue). */
export const CURRENCY_COOKIE = "fove_currency";

/** Fuseaux horaires des pays à monnaie dédiée, quand le pays n'est pas connu (pas d'en-tête Cloudflare). */
const TIMEZONE_CURRENCY: Record<string, BillingCurrency> = {
  "Africa/Casablanca": "MAD",
  "Africa/El_Aaiun": "MAD",
  "Africa/Algiers": "DZD",
  "Africa/Kinshasa": "USD",
  "Africa/Lubumbashi": "USD",
};

function detectBrowserCurrency(): MarketingCurrency {
  if (typeof window === "undefined") return "USD";

  // 1. Choix enregistré (cookie, posé aussi par le proxy selon le pays)
  const match = document.cookie.match(new RegExp(`(?:^|; )${CURRENCY_COOKIE}=([^;]*)`));
  if (match && isBillingCurrency(match[1])) return match[1];

  // 2. Choix enregistré dans localStorage
  try {
    const saved = localStorage.getItem(CURRENCY_COOKIE);
    if (isBillingCurrency(saved)) return saved;
  } catch {
    // ignore
  }

  // 3. Fuseau horaire (Europe/… -> EUR, Africa/Casablanca -> MAD…)
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (TIMEZONE_CURRENCY[tz]) return TIMEZONE_CURRENCY[tz];
    if (tz.startsWith("Europe/")) return "EUR";
  } catch {
    // ignore
  }

  // 4. Langues du navigateur (fr-FR, de-DE… -> EUR ; fr-MA, ar-MA -> MAD ; ar-DZ -> DZD)
  const nav = typeof navigator !== "undefined" ? navigator : null;
  const langs = [nav?.language, ...(nav?.languages || [])].filter(Boolean) as string[];
  if (langs.some((l) => /-MA$/i.test(l))) return "MAD";
  if (langs.some((l) => /-DZ$/i.test(l))) return "DZD";
  if (langs.some((l) => /-(FR|BE|DE|ES|IT|PT|NL|IE|AT|FI|GR|LU|EE|LV|LT|SK|SI|CY|MT|HR)$/i.test(l))) return "EUR";

  return "USD";
}

let listeners: Array<() => void> = [];
let currentCurrency: MarketingCurrency = typeof window !== "undefined" ? detectBrowserCurrency() : "USD";

function emitChange() {
  for (const listener of listeners) listener();
}

export function setMarketingCurrency(c: MarketingCurrency) {
  if (currentCurrency === c) return;
  currentCurrency = c;
  if (typeof document !== "undefined") {
    document.cookie = `${CURRENCY_COOKIE}=${c}; path=/; max-age=31536000; SameSite=Lax`;
    try {
      localStorage.setItem(CURRENCY_COOKIE, c);
    } catch {
      // ignore
    }
  }
  emitChange();
}

export function useMarketingCurrency(): {
  currency: MarketingCurrency;
  /** Monnaie d'un paiement en ligne (USD ou EUR) ; les monnaies locales se règlent aussi hors ligne. */
  online: "USD" | "EUR";
  isLocal: boolean;
  setCurrency: (c: MarketingCurrency) => void;
} {
  const currency = useSyncExternalStore(
    (onStoreChange) => {
      listeners.push(onStoreChange);
      return () => {
        listeners = listeners.filter((l) => l !== onStoreChange);
      };
    },
    () => currentCurrency,
    () => "USD" as MarketingCurrency,
  );
  const online = onlineCurrencyFor(currency);
  return { currency, online, isLocal: online !== currency, setCurrency: setMarketingCurrency };
}
