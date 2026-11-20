import type { Request } from "express";

/**
 * Langues gérées par l'API. Le français reste la langue de référence : tout
 * texte sans traduction retombe sur lui. Même table que `apps/web/src/i18n/config.ts`.
 */
export const LOCALES = ["fr", "en", "ar", "es"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fr";
export const LOCALE_COOKIE = "FOVE_LOCALE";

/** Code BCP 47 pour Intl (dates, nombres, pluriels). */
export const INTL_LOCALE: Record<Locale, string> = { fr: "fr-FR", en: "en-GB", ar: "ar", es: "es-ES" };

export const isLocale = (value: unknown): value is Locale => typeof value === "string" && (LOCALES as readonly string[]).includes(value);

/** Valeur stockée ou reçue → langue gérée, sinon null. */
export function normalizeLocale(value: unknown): Locale | null {
  if (typeof value !== "string") return null;
  const tag = value.trim().toLowerCase().slice(0, 2);
  return isLocale(tag) ? tag : null;
}

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

/** Première langue gérée dans un en-tête Accept-Language (ordre de l'en-tête, poids q respectés). */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale | null {
  const parts = (header ?? "")
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      return { tag: tag?.trim() ?? "", q: q ? Number(q.slice(2)) || 0 : 1, index };
    })
    .filter((p) => p.tag && p.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  for (const part of parts) {
    const locale = normalizeLocale(part.tag);
    if (locale) return locale;
  }
  return null;
}

/** Langue explicitement demandée par la requête : cookie FOVE_LOCALE, puis Accept-Language. */
export function requestLocaleOrNull(req: Pick<Request, "headers"> & { cookies?: Record<string, unknown> }): Locale | null {
  return normalizeLocale(req.cookies?.[LOCALE_COOKIE]) ?? localeFromAcceptLanguage(req.headers?.["accept-language"]);
}

/** Langue d'affichage d'une réponse : cookie, Accept-Language, sinon français. */
export function requestLocale(req: Pick<Request, "headers"> & { cookies?: Record<string, unknown> }): Locale {
  return requestLocaleOrNull(req) ?? DEFAULT_LOCALE;
}

/** Langue d'un commerce pour ses clients : réglage enregistré, sinon langue du pays. */
export function tenantLocale(settings: { locale?: string | null; country?: string | null } | null | undefined): Locale {
  return normalizeLocale(settings?.locale) ?? localeForCountry(settings?.country ?? null);
}

/** Langue d'un utilisateur (emails) : préférence enregistrée, sinon repli fourni, sinon français. */
export function userLocale(user: { locale?: string | null } | null | undefined, fallback: Locale = DEFAULT_LOCALE): Locale {
  return normalizeLocale(user?.locale) ?? fallback;
}

const pluralRules = new Map<Locale, Intl.PluralRules>();
/** Catégorie de pluriel CLDR (one, two, few, many, other, zero). */
export function pluralCategory(locale: Locale, count: number): Intl.LDMLPluralRule {
  let rules = pluralRules.get(locale);
  if (!rules) pluralRules.set(locale, (rules = new Intl.PluralRules(INTL_LOCALE[locale])));
  return rules.select(count);
}

/** Choisit la forme selon la catégorie CLDR ; `other` sert de repli. `#` est remplacé par le nombre. */
export function plural(locale: Locale, count: number, forms: Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }): string {
  const form = (count === 0 && forms.zero) || forms[pluralCategory(locale, count)] || forms.other;
  return form.replace(/#/g, String(count));
}

/** Remplace les variables `{nom}` d'un gabarit. */
export function format(template: string, params: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in params ? String(params[key]) : match));
}
