"use client";

import { useSyncExternalStore } from "react";

export type MarketingCurrency = "USD" | "EUR";

const CURRENCY_COOKIE = "fove_currency";

function detectBrowserCurrency(): MarketingCurrency {
  if (typeof window === "undefined") return "USD";

  // 1. Préférence manuelle enregistrée dans les cookies
  const match = document.cookie.match(new RegExp(`(?:^|; )${CURRENCY_COOKIE}=([^;]*)`));
  if (match && (match[1] === "USD" || match[1] === "EUR")) {
    return match[1] as MarketingCurrency;
  }

  // 2. Préférence manuelle enregistrée dans localStorage
  try {
    const saved = localStorage.getItem(CURRENCY_COOKIE);
    if (saved === "USD" || saved === "EUR") {
      return saved as MarketingCurrency;
    }
  } catch {
    // ignore
  }

  // 3. Détection automatique par fuseau horaire (ex: Europe/Paris, Europe/Brussels -> EUR)
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (tz.startsWith("Europe/")) return "EUR";
  } catch {
    // ignore
  }

  // 4. Détection automatique par langues du navigateur (ex: fr-FR, de-DE, es-ES -> EUR)
  const nav = typeof navigator !== "undefined" ? navigator : null;
  const langs = [nav?.language, ...(nav?.languages || [])].filter(Boolean) as string[];
  const isEuroLocale = langs.some((l) =>
    /-(FR|BE|DE|ES|IT|PT|NL|IE|AT|FI|GR|LU|EE|LV|LT|SK|SI|CY|MT|HR)$/i.test(l),
  );
  if (isEuroLocale) return "EUR";

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
  symbol: string;
  setCurrency: (c: MarketingCurrency) => void;
  isEuro: boolean;
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

  return {
    currency,
    symbol: currency === "EUR" ? "€" : "$",
    setCurrency: setMarketingCurrency,
    isEuro: currency === "EUR",
  };
}
