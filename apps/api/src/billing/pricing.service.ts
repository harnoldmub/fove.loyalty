import { Injectable } from "@nestjs/common";
import {
  BILLING_CURRENCIES,
  convertCents,
  DEFAULT_FX_RATES,
  REFERENCE_CURRENCY,
  resolveBillingCurrency,
  type BillingCurrency,
} from "@fove/shared";
import type { PlanPrice, SubscriptionPlan } from "@fove/database";
import { loadConfig, stripeYearlyPrice } from "../config";
import { PrismaService } from "../common/prisma.service";

export type PlanWithPrices = SubscriptionPlan & { prices: PlanPrice[] };

/**
 * Prix des offres dans chaque monnaie, monnaie de facturation des commerces et
 * taux comptables (docs/chantier-multi-devises.md). Le prix payé est toujours le
 * prix fixe de la monnaie ; les taux ne servent qu'à la consolidation et aux
 * conversions des commissions.
 */
@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Monnaie de facturation d'un commerce : son choix, sinon celle de son pays. */
  async tenantCurrency(tenantId: string): Promise<BillingCurrency> {
    const settings = await this.prisma.client.tenantSettings.findUnique({ where: { tenantId }, select: { billingCurrency: true, country: true } });
    return resolveBillingCurrency(settings?.billingCurrency, settings?.country);
  }

  /** Prix annuel d'une offre dans une monnaie (null si l'offre n'a pas de prix dans cette monnaie). */
  yearlyCents(plan: PlanWithPrices, currency: string): number | null {
    return plan.prices.find((p) => p.currency === currency)?.yearlyCents ?? null;
  }

  /** Tarif Stripe d'une offre dans une monnaie (identifiants sandbox en TEST_MODE). */
  stripePrice(plan: PlanWithPrices, currency: string): string | null {
    const saved = plan.prices.find((p) => p.currency === currency)?.stripePriceId ?? null;
    return stripeYearlyPrice(plan.code, currency, saved, loadConfig());
  }

  /** Offre et monnaie correspondant à un tarif Stripe (webhooks). */
  async planByStripePrice(priceId: string): Promise<{ plan: PlanWithPrices; currency: string } | null> {
    const plans = await this.prisma.client.subscriptionPlan.findMany({ where: { active: true }, include: { prices: true } });
    for (const plan of plans) {
      for (const currency of BILLING_CURRENCIES) {
        if (this.stripePrice(plan, currency) === priceId) return { plan, currency };
      }
    }
    return null;
  }

  /** Taux comptables : unités de chaque monnaie pour 1 € (valeurs initiales si la table est vide). */
  async rates(): Promise<Record<string, number>> {
    const rows = await this.prisma.client.exchangeRate.findMany();
    const out: Record<string, number> = { ...DEFAULT_FX_RATES };
    for (const row of rows) out[row.currency] = Number(row.unitsPerEur);
    return out;
  }

  /** Conversion au taux comptable du jour (null si une monnaie n'a pas de taux). */
  async convert(amountCents: number, from: string, to: string = REFERENCE_CURRENCY): Promise<{ cents: number; rate: number } | null> {
    const rates = await this.rates();
    const cents = convertCents(amountCents, from, to, rates);
    if (cents === null) return null;
    const rate = (to === "EUR" ? 1 : rates[to]!) / (from === "EUR" ? 1 : rates[from]!);
    return { cents, rate };
  }
}
