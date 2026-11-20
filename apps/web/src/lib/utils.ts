import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { INTL_LOCALE, isLocale } from "@/i18n/config";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Langue des formats : celle de la page (attribut lang posé par le layout).
 * Côté serveur, passer la langue explicitement (getLocale de next-intl).
 */
function intlLocale(locale?: string) {
  const lang = locale ?? (typeof document !== "undefined" ? document.documentElement.lang : "fr");
  return INTL_LOCALE[isLocale(lang) ? lang : "fr"];
}

export function formatNumber(n: number, locale?: string) {
  return new Intl.NumberFormat(intlLocale(locale)).format(n);
}

export function formatPrice(cents: number, currency = "EUR", locale?: string) {
  return new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency, minimumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
}

export function formatDate(value: string | Date, withTime = false, locale?: string) {
  return new Intl.DateTimeFormat(intlLocale(locale), withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(new Date(value));
}

export function newIdempotencyKey(prefix = "web") {
  return `${prefix}-${crypto.randomUUID()}`;
}
