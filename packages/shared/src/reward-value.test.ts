import { describe, expect, it } from "vitest";
import { computeRewardDiscount } from "./reward-value";

describe("réduction", () => {
  it("calcule le pourcentage en centimes et arrondit", () => {
    expect(computeRewardDiscount({ kind: "PERCENTAGE", value: "12.5" }, "19.99")).toBe("2.50");
  });
  it("plafonne le montant fixe à l’achat", () => {
    expect(computeRewardDiscount({ kind: "FIXED", value: "10" }, "6.25")).toBe("6.25");
  });
  it("refuse un achat absent, nul ou un taux supérieur à 100", () => {
    expect(() => computeRewardDiscount({ kind: "FIXED", value: "5" }, null)).toThrow();
    expect(() => computeRewardDiscount({ kind: "FIXED", value: "5" }, "0")).toThrow();
    expect(() => computeRewardDiscount({ kind: "PERCENTAGE", value: "101" }, "10")).toThrow();
    expect(computeRewardDiscount({ kind: "GIFT", value: null }, null)).toBeNull();
  });
});
