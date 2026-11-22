import { describe, expect, it } from "vitest";
import { createTenantSchema, updateProgramSchema, updateRewardSchema, updateTenantSchema } from "./schemas";

// Avec Zod 4, `.partial()` applique les valeurs par défaut aux champs absents :
// une modification partielle ne doit jamais réécrire ce qu'elle n'a pas reçu.
describe("schémas de modification partielle", () => {
  it("ne remet pas pays, devise, fuseau ni couleur du commerce à leurs défauts", () => {
    expect(updateTenantSchema.parse({ logoUrl: "https://fove.digital/logo.png" })).toEqual({ logoUrl: "https://fove.digital/logo.png" });
    expect(updateTenantSchema.parse({ primaryColor: "#123456" })).toEqual({ primaryColor: "#123456" });
  });

  it("garde les défauts à la création du commerce", () => {
    expect(createTenantSchema.parse({ name: "Boutique", slug: "boutique" })).toMatchObject({ country: "CD", currency: "CDF", timezone: "Africa/Kinshasa" });
  });

  it("ne réinitialise pas les règles d'un programme mis en pause", () => {
    expect(updateProgramSchema.parse({ active: false })).toEqual({ active: false });
  });

  it("ne remplit pas les champs absents d'une récompense", () => {
    expect(updateRewardSchema.parse({ name: "Café offert" })).toEqual({ name: "Café offert" });
  });
});
