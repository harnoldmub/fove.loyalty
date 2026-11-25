/**
 * Monnaies de facturation de FOVE (docs/chantier-multi-devises.md). Distinctes
 * des monnaies des programmes de fidélité (currencies.ts) : elles servent au prix
 * des offres, aux factures, au parrainage et aux partenaires.
 *
 * Les montants sont en centièmes de l'unité (`…Cents`) pour toutes les monnaies.
 */

export const BILLING_CURRENCIES = ["EUR", "USD", "MAD", "DZD", "CDF"] as const;
export type BillingCurrency = (typeof BILLING_CURRENCIES)[number];

/** Monnaies payables en ligne (Stripe). Les autres se règlent hors ligne. */
export const ONLINE_CURRENCIES = ["EUR", "USD"] as const;
export type OnlineCurrency = (typeof ONLINE_CURRENCIES)[number];

/** Monnaie de référence : les autres prix en sont tirés ; consolidation de la Finance. */
export const REFERENCE_CURRENCY: BillingCurrency = "EUR";

/** Monnaies de versement des partenaires. */
export const PAYOUT_CURRENCIES = ONLINE_CURRENCIES;

export function isBillingCurrency(value: unknown): value is BillingCurrency {
  return typeof value === "string" && (BILLING_CURRENCIES as readonly string[]).includes(value);
}

export function isOnlineCurrency(value: unknown): value is OnlineCurrency {
  return typeof value === "string" && (ONLINE_CURRENCIES as readonly string[]).includes(value);
}

/** Monnaie d'un paiement en ligne : MAD et DZD paient le prix en euros, CDF le prix en dollars. */
export function onlineCurrencyFor(currency: BillingCurrency): OnlineCurrency {
  if (isOnlineCurrency(currency)) return currency;
  return currency === "CDF" ? "USD" : "EUR";
}

/** Pays de la zone euro (et territoires qui utilisent l'euro). */
const EURO_COUNTRIES = new Set([
  "FR", "BE", "DE", "ES", "IT", "PT", "NL", "IE", "AT", "FI", "GR", "LU", "MC", "AD", "SM", "VA", "ME", "XK",
  "EE", "LV", "LT", "SK", "SI", "CY", "MT", "HR", "GP", "MQ", "GF", "RE", "YT", "PM", "BL", "MF",
]);

/** Monnaie de facturation par défaut d'un pays : la RDC est facturée en dollars. */
export function defaultBillingCurrency(country: string | null | undefined): BillingCurrency {
  const code = country?.trim().toUpperCase() ?? "";
  if (EURO_COUNTRIES.has(code)) return "EUR";
  if (code === "MA") return "MAD";
  if (code === "DZ") return "DZD";
  return "USD";
}

/** Monnaie de facturation d'un commerce : son choix, sinon celle de son pays. */
export function resolveBillingCurrency(chosen: string | null | undefined, country: string | null | undefined): BillingCurrency {
  return isBillingCurrency(chosen) ? chosen : defaultBillingCurrency(country);
}

export type PriceGrid = Record<BillingCurrency, number>;

/**
 * Grille initiale des prix annuels (seed et initialisation). Une fois en base,
 * les prix se modifient dans l'administration, jamais ici.
 */
export const DEFAULT_PLAN_PRICES: Record<string, PriceGrid> = {
  starter: { EUR: 8_900, USD: 9_900, MAD: 99_000, DZD: 1_800_000, CDF: 29_500_000 },
  business: { EUR: 17_900, USD: 19_900, MAD: 199_000, DZD: 3_600_000, CDF: 59_000_000 },
  premium: { EUR: 34_900, USD: 39_900, MAD: 379_000, DZD: 7_000_000, CDF: 115_000_000 },
};

/** Parrainage : remise du filleul et crédit du parrain, dans la monnaie du commerce. */
export const REFERRAL_REWARD: PriceGrid = { EUR: 2_000, USD: 2_000, MAD: 20_000, DZD: 400_000, CDF: 6_500_000 };

/** Parrainage : plafond de crédit du parrain par année civile (limité aussi au prix annuel de son offre). */
export const REFERRAL_YEARLY_CAP: PriceGrid = { EUR: 20_000, USD: 20_000, MAD: 200_000, DZD: 4_000_000, CDF: 65_000_000 };

export function referralRewardCents(currency: string | null | undefined): number {
  return isBillingCurrency(currency) ? REFERRAL_REWARD[currency] : REFERRAL_REWARD.USD;
}

export function referralCapCents(currency: string | null | undefined): number {
  return isBillingCurrency(currency) ? REFERRAL_YEARLY_CAP[currency] : REFERRAL_YEARLY_CAP.USD;
}

/** Taux comptables initiaux : unités de la monnaie pour 1 €. Tenus ensuite dans l'admin. */
export const DEFAULT_FX_RATES: Record<Exclude<BillingCurrency, "EUR">, number> = { USD: 1.12, MAD: 10.8, DZD: 150, CDF: 3300 };

/**
 * Conversion avec un taux exprimé en « unités pour 1 € ». `rates` contient
 * les taux de toutes les monnaies sauf l'euro (implicite : 1).
 */
export function convertCents(amountCents: number, from: string, to: string, rates: Record<string, number>): number | null {
  if (from === to) return amountCents;
  const rateFrom = from === "EUR" ? 1 : rates[from];
  const rateTo = to === "EUR" ? 1 : rates[to];
  if (!rateFrom || !rateTo) return null;
  return Math.round((amountCents / rateFrom) * rateTo);
}
