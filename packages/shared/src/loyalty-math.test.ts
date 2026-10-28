import { describe, expect, it } from "vitest";
import { computeEarn, proportionalReversal, toCents, type EarnRules } from "./loyalty-math";

const points: EarnRules = {
  mode: "POINTS",
  spendStep: "1000",
  pointsPerStep: 1,
  stampsPerPurchase: 1,
  minPurchaseAmount: null,
  maxPerTransaction: null,
};

describe("computeEarn", () => {
  it("convertit 1 000 CDF en 1 point, arrondi vers le bas", () => {
    expect(computeEarn(points, "15999")).toBe(15);
    expect(computeEarn(points, "999.99")).toBe(0);
  });
  it("applique le plafond par opération", () => {
    expect(computeEarn({ ...points, maxPerTransaction: 50 }, "1000000")).toBe(50);
  });
  it("respecte le montant minimum", () => {
    const stamps: EarnRules = { ...points, mode: "STAMPS", minPurchaseAmount: "5000" };
    expect(computeEarn(stamps, "4999")).toBe(0);
    expect(computeEarn(stamps, "5000")).toBe(1);
    expect(computeEarn(stamps, null)).toBe(0);
  });
  it("donne un tampon par achat sans montant", () => {
    expect(computeEarn({ ...points, mode: "STAMPS" }, null)).toBe(1);
  });
  it("gère les décimales sans flottants", () => {
    expect(toCents("12.5")).toBe(1250n);
    expect(computeEarn({ ...points, spendStep: "0.10" }, "0.30")).toBe(3);
    expect(() => toCents("-3")).toThrow();
    expect(() => toCents("1e5")).toThrow();
  });
});

describe("proportionalReversal", () => {
  it("retire une part proportionnelle", () => {
    expect(proportionalReversal(100, "50000", "25000")).toBe(50);
    expect(proportionalReversal(15, "15999", "15999")).toBe(15);
    expect(proportionalReversal(15, "15999", "99999")).toBe(15);
  });
});
