import { describe, expect, it } from "vitest";
import { DEFAULT_PLANS, FREE_PLAN_FEATURES, FREE_PLAN_LIMITS, resolveFeatures, resolveLimits } from "./plans";

describe("droits effectifs d'une offre", () => {
  it("complète une clé absente avec la valeur du Gratuit", () => {
    expect(resolveFeatures({ api: true })).toEqual({ ...FREE_PLAN_FEATURES, api: true });
    expect(resolveLimits({ customers: 500 })).toEqual({ ...FREE_PLAN_LIMITS, customers: 500 });
  });

  it("applique les dérogations d'un contrat, y compris un quota illimité", () => {
    const custom = DEFAULT_PLANS.find((p) => p.code === "custom")!;
    expect(resolveLimits(custom.limits, { customers: 25_000 })).toEqual({ customers: 25_000, establishments: null, staff: null, programs: null });
    expect(resolveFeatures(custom.features, { api: false }).api).toBe(false);
    expect(resolveLimits({ customers: 100 }, { customers: null }).customers).toBeNull();
  });

  it("ignore les valeurs mal formées", () => {
    expect(resolveFeatures({ api: "oui" }, null).api).toBe(false);
    expect(resolveLimits({ customers: -1, staff: 2.5 }).customers).toBe(FREE_PLAN_LIMITS.customers);
  });

  it("définit une seule offre gratuite, de 100 clients", () => {
    const free = DEFAULT_PLANS.filter((p) => p.kind === "FREE");
    expect(free).toHaveLength(1);
    expect(free[0]!.limits).toEqual({ customers: 100, establishments: 1, staff: 1, programs: 1 });
    expect(free[0]!.features).toMatchObject({ widget: true, exports: true, api: false, walletCampaigns: false, whatsappAuto: false, removeBranding: false });
  });
});
