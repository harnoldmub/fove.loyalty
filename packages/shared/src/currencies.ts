export interface CurrencyDefinition {
  code: string;
  symbol: string;
  name: string;
  label: string;
}

export const SUPPORTED_CURRENCIES: CurrencyDefinition[] = [
  { code: "EUR", symbol: "€", name: "Euro", label: "EUR (€) — Euro" },
  { code: "USD", symbol: "$", name: "Dollar américain", label: "USD ($) — Dollar US" },
  { code: "CDF", symbol: "FC", name: "Franc congolais", label: "CDF (FC) — Franc congolais" },
  { code: "XOF", symbol: "CFA", name: "Franc CFA (UEMOA)", label: "XOF (CFA) — Franc CFA Afrique de l’Ouest" },
  { code: "XAF", symbol: "CFA", name: "Franc CFA (CEMAC)", label: "XAF (CFA) — Franc CFA Afrique Centrale" },
  { code: "CAD", symbol: "$", name: "Dollar canadien", label: "CAD ($) — Dollar canadien" },
  { code: "GBP", symbol: "£", name: "Livre sterling", label: "GBP (£) — Livre sterling" },
  { code: "CHF", symbol: "CHF", name: "Franc suisse", label: "CHF — Franc suisse" },
  { code: "MAD", symbol: "DH", name: "Dirham marocain", label: "MAD (DH) — Dirham marocain" },
  { code: "RWF", symbol: "FRw", name: "Franc rwandais", label: "RWF (FRw) — Franc rwandais" },
  { code: "GNF", symbol: "FG", name: "Franc guinéen", label: "GNF (FG) — Franc guinéen" },
];

export const COUNTRY_CURRENCY_MAP: Record<string, string> = {
  // Zone Euro
  FR: "EUR",
  BE: "EUR",
  DE: "EUR",
  ES: "EUR",
  IT: "EUR",
  PT: "EUR",
  NL: "EUR",
  IE: "EUR",
  AT: "EUR",
  FI: "EUR",
  GR: "EUR",
  LU: "EUR",
  MC: "EUR",
  AD: "EUR",
  SM: "EUR",
  VA: "EUR",
  ME: "EUR",
  XK: "EUR",
  EE: "EUR",
  LV: "EUR",
  LT: "EUR",
  SK: "EUR",
  SI: "EUR",
  CY: "EUR",
  MT: "EUR",
  HR: "EUR",
  GP: "EUR",
  MQ: "EUR",
  GF: "EUR",
  RE: "EUR",
  YT: "EUR",
  PM: "EUR",

  // UEMOA (Afrique de l'Ouest)
  CI: "XOF",
  SN: "XOF",
  BJ: "XOF",
  BF: "XOF",
  ML: "XOF",
  NE: "XOF",
  TG: "XOF",
  GW: "XOF",

  // CEMAC (Afrique Centrale)
  CM: "XAF",
  CG: "XAF",
  GA: "XAF",
  TD: "XAF",
  CF: "XAF",
  GQ: "XAF",

  // RD Congo
  CD: "CDF",

  // Autres pays d'Afrique
  MA: "MAD",
  TN: "TND",
  DZ: "DZD",
  RW: "RWF",
  GN: "GNF",
  AO: "AOA",
  ZA: "ZAR",

  // Amériques
  CA: "CAD",
  US: "USD",

  // Europe hors zone Euro
  GB: "GBP",
  CH: "CHF",
};

/** Retourne la devise par défaut pour un pays ISO (ex: FR -> EUR, CI -> XOF, CD -> CDF, US -> USD). */
export function defaultCurrencyForCountry(countryCode: string | null | undefined): string {
  if (!countryCode) return "USD";
  const upper = countryCode.trim().toUpperCase();
  return COUNTRY_CURRENCY_MAP[upper] ?? "USD";
}

/** Symbole usuel de la devise (ex: EUR -> €, USD -> $, CDF -> FC). */
export function getCurrencySymbol(currency: string | null | undefined): string {
  if (!currency) return "$";
  const found = SUPPORTED_CURRENCIES.find((c) => c.code === currency.toUpperCase());
  return found?.symbol ?? currency;
}
