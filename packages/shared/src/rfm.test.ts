import { describe, expect, it } from "vitest";
import { computeCustomerSegment } from "./rfm";
import { buildWhatsAppMessage, sanitizePhoneForWhatsApp, buildWhatsAppLink } from "./whatsapp";

describe("computeCustomerSegment (Sidely RFM)", () => {
  const now = new Date("2026-10-29T12:00:00Z");

  it("identifie un nouveau client", () => {
    const res = computeCustomerSegment({
      totalVisits: 1,
      totalSpend: 25,
      createdAt: new Date("2026-10-25T10:00:00Z"),
      lastVisitAt: new Date("2026-10-25T10:00:00Z"),
      now,
    });
    expect(res.segment).toBe("NEW");
    expect(res.label).toBe("Nouveau membre");
  });

  it("identifie un habitué VIP", () => {
    const res = computeCustomerSegment({
      totalVisits: 12,
      totalSpend: 620,
      createdAt: new Date("2026-05-01T10:00:00Z"),
      lastVisitAt: new Date("2026-10-26T10:00:00Z"),
      now,
    });
    expect(res.segment).toBe("VIP");
    expect(res.label).toBe("Habitué VIP");
    expect(res.suggestedAction).toContain("VIP");
  });

  it("identifie un client en risque d'attrition", () => {
    const res = computeCustomerSegment({
      totalVisits: 4,
      totalSpend: 110,
      createdAt: new Date("2026-06-01T10:00:00Z"),
      lastVisitAt: new Date("2026-09-10T10:00:00Z"), // ~49 jours
      now,
    });
    expect(res.segment).toBe("AT_RISK");
    expect(res.label).toBe("En risque");
    expect(res.daysSinceLastVisit).toBeGreaterThanOrEqual(45);
  });

  it("identifie un client dormant", () => {
    const res = computeCustomerSegment({
      totalVisits: 2,
      totalSpend: 40,
      createdAt: new Date("2026-01-01T10:00:00Z"),
      lastVisitAt: new Date("2026-06-01T10:00:00Z"), // ~150 jours
      now,
    });
    expect(res.segment).toBe("DORMANT");
    expect(res.label).toBe("Dormant");
  });

  it("identifie un client actif régulier", () => {
    const res = computeCustomerSegment({
      totalVisits: 3,
      totalSpend: 85,
      createdAt: new Date("2026-08-01T10:00:00Z"),
      lastVisitAt: new Date("2026-10-20T10:00:00Z"), // 9 jours
      now,
    });
    expect(res.segment).toBe("REGULAR");
    expect(res.label).toBe("Actif régulier");
  });
});

describe("buildWhatsAppMessage & links", () => {
  it("génère un message de partage de carte Matchkwata", () => {
    const msg = buildWhatsAppMessage({
      kind: "CARD_SHARE",
      customerFirstName: "Amina",
      businessName: "Dizayna Shop",
      balance: 4,
      unitLabel: "tampons",
      cardUrl: "https://fove.digital/carte/secret123",
    });
    expect(msg).toContain("Bonjour Amina !");
    expect(msg).toContain("Dizayna Shop");
    expect(msg).toContain("4 tampons");
    expect(msg).toContain("https://fove.digital/carte/secret123");
  });

  it("génère un message de relance réengagement Sidely", () => {
    const msg = buildWhatsAppMessage({
      kind: "REENGAGEMENT",
      customerFirstName: "Marc",
      businessName: "Café de Paris",
      balance: 7,
      unitLabel: "points",
    });
    expect(msg).toContain("Vous nous manquez chez Café de Paris");
    expect(msg).toContain("7 points");
  });

  it("génère une URL wa.me propre", () => {
    const phone = "+243 81 234 5678";
    expect(sanitizePhoneForWhatsApp(phone)).toBe("243812345678");
    const link = buildWhatsAppLink(phone, "Bonjour !");
    expect(link).toBe("https://wa.me/243812345678?text=Bonjour%20!");
  });
});
