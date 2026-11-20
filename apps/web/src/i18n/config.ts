/** Langues de l'interface. Le français reste la langue de référence. */
export const LOCALES = ["fr", "en", "ar", "es"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fr";
export const LOCALE_COOKIE = "FOVE_LOCALE";

export const LOCALE_NAMES: Record<Locale, string> = { fr: "Français", en: "English", ar: "العربية", es: "Español" };
/** Code BCP 47 pour Intl (dates, nombres, prix). */
export const INTL_LOCALE: Record<Locale, string> = { fr: "fr-FR", en: "en-GB", ar: "ar", es: "es-ES" };

export const isLocale = (value: unknown): value is Locale => typeof value === "string" && (LOCALES as readonly string[]).includes(value);
export const isRtl = (locale: Locale) => locale === "ar";

/**
 * Fichiers de messages, un par zone (`messages/<langue>/<zone>.json`) pour
 * pouvoir traduire chaque partie du produit indépendamment.
 */
export const NAMESPACES = ["common", "marketing", "auth", "public", "onboarding", "app", "admin", "partner", "client", "errors"] as const;

const BY_COUNTRY: Record<string, Locale> = {};
const assign = (locale: Locale, codes: string) => codes.split(" ").forEach((c) => (BY_COUNTRY[c] = locale));
assign("fr", "FR BE CH LU MC CD CG CI SN CM GA BJ BF ML NE TG GN TD CF MG BI RW DJ KM HT GP MQ GF RE YT NC PF PM BL MF WF");
assign("ar", "DZ MA TN LY EG SD MR SA AE QA KW BH OM YE JO LB SY IQ PS");
assign("es", "ES MX AR CO CL PE VE EC GT CU BO DO HN PY SV NI CR PA UY GQ PR");

/** Langue par défaut d'un pays (ISO alpha-2) ; l'anglais pour les autres. */
export function localeForCountry(country: string | null | undefined): Locale {
  if (!country) return DEFAULT_LOCALE;
  return BY_COUNTRY[country.toUpperCase()] ?? "en";
}

/** Première langue gérée dans un en-tête Accept-Language. */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale | null {
  for (const part of (header ?? "").split(",")) {
    const tag = part.split(";")[0]?.trim().toLowerCase().slice(0, 2);
    if (isLocale(tag)) return tag;
  }
  return null;
}
