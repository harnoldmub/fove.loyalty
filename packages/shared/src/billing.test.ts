import { describe, expect, it } from "vitest";
import { convertCents, defaultBillingCurrency, onlineCurrencyFor, referralCapCents, referralRewardCents, resolveBillingCurrency } from "./billing";

describe("monnaies de facturation", () => {
  it("choisit la monnaie selon le pays : RDC en dollars", () => {
    expect(defaultBillingCurrency("FR")).toBe("EUR");
    expect(defaultBillingCurrency("be")).toBe("EUR");
    expect(defaultBillingCurrency("MA")).toBe("MAD");
    expect(defaultBillingCurrency("DZ")).toBe("DZD");
    expect(defaultBillingCurrency("CD")).toBe("USD");
    expect(defaultBillingCurrency("SN")).toBe("USD");
    expect(defaultBillingCurrency(null)).toBe("USD");
  });

  it("garde le choix du commerce s'il est valide", () => {
    expect(resolveBillingCurrency("CDF", "CD")).toBe("CDF");
    expect(resolveBillingCurrency("GBP", "FR")).toBe("EUR");
    expect(resolveBillingCurrency(null, "MA")).toBe("MAD");
  });

  it("paie en ligne en euros ou en dollars", () => {
    expect(onlineCurrencyFor("MAD")).toBe("EUR");
    expect(onlineCurrencyFor("DZD")).toBe("EUR");
    expect(onlineCurrencyFor("CDF")).toBe("USD");
    expect(onlineCurrencyFor("USD")).toBe("USD");
  });

  it("donne le parrainage de la grille, en dollars par défaut", () => {
    expect(referralRewardCents("MAD")).toBe(20_000);
    expect(referralCapCents("DZD")).toBe(4_000_000);
    expect(referralRewardCents("XOF")).toBe(2_000);
  });

  it("convertit avec des taux exprimés pour 1 €", () => {
    const rates = { USD: 1.12, MAD: 10.8 };
    expect(convertCents(1_120, "USD", "EUR", rates)).toBe(1_000);
    expect(convertCents(10_000, "EUR", "MAD", rates)).toBe(108_000);
    expect(convertCents(10_800, "MAD", "USD", rates)).toBe(1_120);
    expect(convertCents(500, "EUR", "EUR", {})).toBe(500);
    expect(convertCents(500, "CDF", "EUR", rates)).toBeNull();
  });
});
