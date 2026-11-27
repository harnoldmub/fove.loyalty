import { INTL_LOCALE, type Locale } from "./locale";

/** Montant en centièmes, formaté dans la langue du destinataire (« 89 € », « 1 800 000 DZD »). */
export function formatMoney(cents: number, currency: string, locale: Locale): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], { style: "currency", currency, minimumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
}

/** Date longue dans la langue du destinataire (« 27 novembre 2026 »). */
export function formatDay(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { dateStyle: "long" }).format(date);
}
