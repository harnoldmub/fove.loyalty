import { describe, expect, it } from "vitest";
import { tenantInitials } from "./initials";

describe("tenantInitials", () => {
  it("extrait la 1ère lettre des 2 premiers mots pour les commerces à plusieurs mots", () => {
    expect(tenantInitials("Café Matonge")).toBe("CM");
    expect(tenantInitials("La Braise")).toBe("LB");
    expect(tenantInitials("Chez Ntemba")).toBe("CN");
    expect(tenantInitials("Restaurant Le Gourmet")).toBe("RL");
  });

  it("gère les accents et caractères diacritiques correctement", () => {
    expect(tenantInitials("Étoile d'Or")).toBe("ED");
    expect(tenantInitials("À la pointe")).toBe("AL");
  });

  it("extrait les 2 premières lettres pour un nom à mot unique", () => {
    expect(tenantInitials("Dizayna")).toBe("DI");
    expect(tenantInitials("Matonge")).toBe("MA");
    expect(tenantInitials("Paul")).toBe("PA");
  });

  it("complète avec X pour les noms d'une seule lettre", () => {
    expect(tenantInitials("A")).toBe("AX");
  });

  it("renvoie FV en repli par défaut pour les valeurs vides ou invalides", () => {
    expect(tenantInitials("")).toBe("FV");
    expect(tenantInitials(null)).toBe("FV");
    expect(tenantInitials(undefined)).toBe("FV");
    expect(tenantInitials("---")).toBe("FV");
  });
});
