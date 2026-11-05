import { describe, expect, it } from "vitest";
import { defaultCurrencyForCountry, getCurrencySymbol, SUPPORTED_CURRENCIES } from "./currencies";

describe("currencies", () => {
  it("adapte la devise pour les pays européens en EUR", () => {
    expect(defaultCurrencyForCountry("FR")).toBe("EUR");
    expect(defaultCurrencyForCountry("BE")).toBe("EUR");
    expect(defaultCurrencyForCountry("es")).toBe("EUR");
  });

  it("adapte la devise pour l'Afrique de l'Ouest (UEMOA) en XOF", () => {
    expect(defaultCurrencyForCountry("CI")).toBe("XOF");
    expect(defaultCurrencyForCountry("SN")).toBe("XOF");
    expect(defaultCurrencyForCountry("TG")).toBe("XOF");
  });

  it("adapte la devise pour l'Afrique Centrale (CEMAC) en XAF", () => {
    expect(defaultCurrencyForCountry("CM")).toBe("XAF");
    expect(defaultCurrencyForCountry("CG")).toBe("XAF");
    expect(defaultCurrencyForCountry("GA")).toBe("XAF");
  });

  it("adapte la devise pour la RDC en CDF", () => {
    expect(defaultCurrencyForCountry("CD")).toBe("CDF");
  });

  it("adapte la devise pour l'Amérique du Nord", () => {
    expect(defaultCurrencyForCountry("US")).toBe("USD");
    expect(defaultCurrencyForCountry("CA")).toBe("CAD");
  });

  it("retourne USD par défaut pour un pays inconnu ou vide", () => {
    expect(defaultCurrencyForCountry(null)).toBe("USD");
    expect(defaultCurrencyForCountry("ZZ")).toBe("USD");
  });

  it("donne le bon symbole", () => {
    expect(getCurrencySymbol("EUR")).toBe("€");
    expect(getCurrencySymbol("USD")).toBe("$");
    expect(getCurrencySymbol("CDF")).toBe("FC");
    expect(getCurrencySymbol("XOF")).toBe("CFA");
  });

  it("fournit une liste complète de devises supportées", () => {
    expect(SUPPORTED_CURRENCIES.length).toBeGreaterThanOrEqual(10);
    expect(SUPPORTED_CURRENCIES.some((c) => c.code === "EUR")).toBe(true);
    expect(SUPPORTED_CURRENCIES.some((c) => c.code === "XOF")).toBe(true);
  });
});
