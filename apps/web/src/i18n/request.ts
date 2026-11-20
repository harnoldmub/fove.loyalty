import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, NAMESPACES, type Locale } from "./config";

/** Langue choisie (cookie) ou déduite par le proxy (pays, puis navigateur). */
export async function resolveLocale(): Promise<Locale> {
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  const fromProxy = (await headers()).get("x-fove-locale");
  return isLocale(fromProxy) ? fromProxy : DEFAULT_LOCALE;
}

async function load(locale: Locale) {
  const parts = await Promise.all(
    NAMESPACES.map(async (ns) => [ns, (await import(`../../messages/${locale}/${ns}.json`)).default] as const),
  );
  return Object.fromEntries(parts);
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  const [messages, fallback] = await Promise.all([load(locale), locale === DEFAULT_LOCALE ? null : load(DEFAULT_LOCALE)]);
  return {
    locale,
    // Une clé absente dans une langue retombe sur le français plutôt que d'afficher son nom.
    messages: fallback ? deepMerge(fallback, messages) : messages,
    timeZone: "Europe/Paris",
  };
});

function deepMerge(base: Record<string, unknown>, over: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const b = out[k];
    // Les tableaux (listes lues avec t.raw) remplacent le français en bloc.
    const objects = v && typeof v === "object" && !Array.isArray(v) && b && typeof b === "object" && !Array.isArray(b);
    out[k] = objects ? deepMerge(b as Record<string, unknown>, v as Record<string, unknown>) : v;
  }
  return out;
}
