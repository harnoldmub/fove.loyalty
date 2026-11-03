/**
 * Catalogue des offres FOVE : source unique des valeurs initiales (seed,
 * initialisation automatique de l'API). Une fois en base, prix et quotas se
 * modifient dans l'administration, jamais ici.
 */

/** Fonctions activables par offre (alias de type : assignable à un champ JSON Prisma). */
export type PlanFeatures = {
  /** API publique v1 et webhooks sortants. */
  api: boolean;
  /** Widget pour le site du commerçant. */
  widget: boolean;
  /** Connexion boutique en ligne (connecteur e-commerce). */
  integrations: boolean;
  /** Export des données d'un client (RGPD). */
  exports: boolean;
  /** Notifications Wallet envoyées à toutes les cartes d'un programme. */
  walletCampaigns: boolean;
  /** Envoi WhatsApp automatique par FOVE (sinon lien wa.me envoyé par le commerçant). */
  whatsappAuto: boolean;
  /** Retire la mention « Propulsé par FOVE » du widget et de la carte. */
  removeBranding: boolean;
};

export type QuotaKey = "customers" | "establishments" | "staff" | "programs";
/** Quotas par offre, `null` = illimité. */
export type PlanLimits = Record<QuotaKey, number | null>;

/** FREE : offre par défaut ; PAID : achetable en ligne ; CUSTOM : sur devis, attribuée par l'admin. */
export type PlanKindCode = "FREE" | "PAID" | "CUSTOM";

export const PLAN_FEATURE_KEYS = ["api", "widget", "integrations", "exports", "walletCampaigns", "whatsappAuto", "removeBranding"] as const;
export const QUOTA_KEYS = ["customers", "establishments", "staff", "programs"] as const;

export interface PlanDefinition {
  code: string;
  kind: PlanKindCode;
  name: string;
  description: string;
  currency: string;
  priceMonthlyCents: number;
  priceYearlyCents: number;
  trialDays: number;
  features: PlanFeatures;
  limits: PlanLimits;
  sortOrder: number;
}

const PAID_FEATURES = { exports: true, widget: true, walletCampaigns: true, whatsappAuto: true, removeBranding: true };

export const FREE_PLAN_FEATURES: PlanFeatures = {
  api: false,
  widget: true,
  integrations: false,
  exports: true,
  walletCampaigns: false,
  whatsappAuto: false,
  removeBranding: false,
};

export const FREE_PLAN_LIMITS: PlanLimits = { customers: 100, establishments: 1, staff: 1, programs: 1 };

export const DEFAULT_PLANS: PlanDefinition[] = [
  {
    code: "free",
    kind: "FREE",
    name: "Gratuit",
    description: "Pour démarrer votre programme de fidélité sans engagement.",
    currency: "USD",
    priceMonthlyCents: 0,
    priceYearlyCents: 0,
    trialDays: 0,
    features: FREE_PLAN_FEATURES,
    limits: FREE_PLAN_LIMITS,
    sortOrder: 0,
  },
  {
    code: "starter",
    kind: "PAID",
    name: "Essentiel",
    description: "Pour les petits commerces, salons et indépendants.",
    currency: "USD",
    priceMonthlyCents: 0,
    priceYearlyCents: 9900,
    trialDays: 14,
    features: { ...PAID_FEATURES, api: false, integrations: false },
    limits: { customers: 500, establishments: 1, staff: 3, programs: 1 },
    sortOrder: 1,
  },
  {
    code: "business",
    kind: "PAID",
    name: "Business",
    description: "Pour les boutiques qui veulent développer leur clientèle.",
    currency: "USD",
    priceMonthlyCents: 0,
    priceYearlyCents: 19900,
    trialDays: 14,
    features: { ...PAID_FEATURES, api: true, integrations: true },
    limits: { customers: 2000, establishments: 1, staff: 15, programs: 3 },
    sortOrder: 2,
  },
  {
    code: "premium",
    kind: "PAID",
    name: "Réseau",
    description: "Pour les enseignes qui gèrent plusieurs boutiques.",
    currency: "USD",
    priceMonthlyCents: 0,
    priceYearlyCents: 39900,
    trialDays: 14,
    features: { ...PAID_FEATURES, api: true, integrations: true },
    limits: { customers: 10000, establishments: 3, staff: null, programs: null },
    sortOrder: 3,
  },
  {
    code: "custom",
    kind: "CUSTOM",
    name: "Sur-mesure",
    description: "Pour les réseaux et enseignes aux besoins spécifiques : quotas, accompagnement et contrat sur devis.",
    currency: "USD",
    priceMonthlyCents: 0,
    priceYearlyCents: 0,
    trialDays: 0,
    features: { ...PAID_FEATURES, api: true, integrations: true },
    limits: { customers: null, establishments: null, staff: null, programs: null },
    sortOrder: 4,
  },
];

/**
 * Droits effectifs : valeurs de l'offre, complétées par celles du Gratuit pour
 * toute clé absente, puis remplacées par les dérogations d'un contrat sur-mesure.
 */
export function resolveFeatures(planFeatures: unknown, override?: unknown): PlanFeatures {
  return { ...FREE_PLAN_FEATURES, ...pick<PlanFeatures>(planFeatures, PLAN_FEATURE_KEYS, "boolean"), ...pick<PlanFeatures>(override, PLAN_FEATURE_KEYS, "boolean") };
}

export function resolveLimits(planLimits: unknown, override?: unknown): PlanLimits {
  return { ...FREE_PLAN_LIMITS, ...pick<PlanLimits>(planLimits, QUOTA_KEYS, "limit"), ...pick<PlanLimits>(override, QUOTA_KEYS, "limit") };
}

function pick<T>(source: unknown, keys: readonly string[], type: "boolean" | "limit"): Partial<T> {
  if (!source || typeof source !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const value = (source as Record<string, unknown>)[key];
    if (type === "boolean" ? typeof value === "boolean" : value === null || (typeof value === "number" && Number.isInteger(value) && value >= 0)) {
      out[key] = value;
    }
  }
  return out as Partial<T>;
}
