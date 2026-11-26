import { describe, expect, it } from "vitest";
import { localeForCountry, localeFromAcceptLanguage, normalizeLocale, plural, requestLocale, tenantLocale, userLocale } from "./locale";
import { translateError } from "./errors";
import { emailHtml, otpMessage, quotaAlertMessage, teamInviteMessage, userLoginCodeMessage } from "./emails";
import { programRule, recoverCardMessage, rewardSummaryLine, shareCardMessage } from "./notifications";
import { localizeErrorBody } from "../common/http-exception.filter";
import { getClubExplanations, getClubMemberSummary, nextRewardValue } from "../cards/club-card";

describe("détection de la langue", () => {
  it("lit Accept-Language dans l'ordre des poids", () => {
    expect(localeFromAcceptLanguage("de-DE,es;q=0.8,en;q=0.9")).toBe("en");
    expect(localeFromAcceptLanguage("ar-MA")).toBe("ar");
    expect(localeFromAcceptLanguage("de, it")).toBeNull();
    expect(localeFromAcceptLanguage(undefined)).toBeNull();
  });

  it("préfère le cookie FOVE_LOCALE, sinon le français", () => {
    expect(requestLocale({ headers: { "accept-language": "en" }, cookies: { FOVE_LOCALE: "es" } })).toBe("es");
    expect(requestLocale({ headers: { "accept-language": "en-US" } })).toBe("en");
    expect(requestLocale({ headers: {} })).toBe("fr");
    expect(normalizeLocale("xx")).toBeNull();
  });

  it("déduit la langue d'un commerce de son pays", () => {
    expect(tenantLocale({ country: "CD" })).toBe("fr");
    expect(tenantLocale({ country: "MA" })).toBe("ar");
    expect(tenantLocale({ country: "MX" })).toBe("es");
    expect(tenantLocale({ country: "NG" })).toBe("en");
    expect(tenantLocale({ country: "CD", locale: "en" })).toBe("en");
    expect(localeForCountry(null)).toBe("fr");
    expect(userLocale({ locale: null }, "es")).toBe("es");
  });

  it("applique les pluriels CLDR, y compris l'arabe", () => {
    const forms = { one: "# tampon", other: "# tampons" };
    expect(plural("fr", 0, forms)).toBe("0 tampon");
    expect(plural("en", 0, { one: "# stamp", other: "# stamps" })).toBe("0 stamps");
    const ar = { one: "طابع واحد", two: "طابعان", few: "# طوابع", many: "# طابعًا", other: "# طابع" };
    expect(plural("ar", 2, ar)).toBe("طابعان");
    expect(plural("ar", 5, ar)).toBe("5 طوابع");
    expect(plural("ar", 11, ar)).toBe("11 طابعًا");
  });
});

describe("erreurs traduites", () => {
  it("traduit les messages exacts et laisse le français intact", () => {
    expect(translateError("en", "Code expiré : demandez-en un nouveau")).toBe("Code expired: request a new one");
    expect(translateError("es", "Code incorrect")).toBe("Código incorrecto");
    expect(translateError("fr", "Code incorrect")).toBe("Code incorrect");
    expect(translateError("en", "Message inconnu")).toBe("Message inconnu");
  });

  it("traduit les messages qui contiennent une valeur", () => {
    expect(translateError("en", "Carte introuvable")).toBe("Card not found");
    expect(translateError("ar", "Client introuvable")).toBe("تعذّر العثور على العميل");
    expect(translateError("es", "Limite de 50 clients atteinte pour votre offre")).toBe("Se ha alcanzado el límite de 50 clientes de tu plan");
    expect(translateError("en", "Devise USD différente de celle du programme (CDF)")).toBe("Currency USD differs from the programme's (CDF)");
  });

  it("traduit le corps d'erreur et les messages de validation, sans toucher au code", () => {
    const body = localizeErrorBody(
      { error: { code: "validation_failed", message: "Données invalides", details: [{ path: "email", message: "Email invalide" }] } },
      "en",
    );
    expect(body.error.code).toBe("validation_failed");
    expect(body.error.message).toBe("Invalid data");
    expect(body.error.details).toEqual([{ path: "email", message: "Invalid email" }]);
  });
});

describe("emails traduits", () => {
  it("produit sujet, texte et HTML dans la langue demandée", () => {
    const en = teamInviteMessage("en", "Café", "https://app.test/invite?token=abc");
    expect(en.subject).toBe("Invitation to join Café on FOVE");
    expect(en.text).toContain("https://app.test/invite?token=abc");
    expect(en.html).toContain('lang="en"');
    const ar = teamInviteMessage("ar", "Café", "https://app.test/invite");
    expect(ar.html).toContain('dir="rtl"');
    expect(userLoginCodeMessage("ar", "654321").subject).toContain("654321");
    expect(otpMessage("es", "Café", "123456").text).toContain("123456");
  });

  it("échappe le contenu inséré dans le HTML", () => {
    const html = emailHtml("fr", { title: "<b>", heading: "A & B", paragraphs: ["<script>"], button: { label: "Ok", url: "https://x.test/?a=1&b=2" }, footer: "" });
    expect(html).not.toContain("<script>");
    expect(html).toContain("A &amp; B");
    expect(html).toContain("a=1&amp;b=2");
  });

  it("garde le texte français d'origine de l'alerte de quota", () => {
    const fr = quotaAlertMessage("fr", { reason: "reached", tenantName: "Café", limit: 50, billingUrl: "https://app.test/app/billing" });
    expect(fr.subject).toBe("Café a atteint 50 clients");
    expect(quotaAlertMessage("en", { reason: "blocked", tenantName: "Café", limit: 50, billingUrl: "u" }).subject).toBe("A customer couldn't join Café");
  });
});

describe("cartes et messages clients", () => {
  const program = { mode: "STAMPS", stampsTarget: 10, spendStep: "1000", pointsPerStep: 1, currency: "CDF" };

  it("garde la règle française historique", () => {
    expect(programRule("fr", program, "Café offert")).toBe("10 tampons = Café offert");
    expect(programRule("fr", { ...program, mode: "POINTS", pointsPerStep: 2 })).toBe(`${new Intl.NumberFormat("fr-FR").format(1000)} CDF = 2 points`);
  });

  it("traduit la règle, le partage et la récupération de carte", () => {
    expect(programRule("en", program)).toBe("10 stamps = a reward");
    expect(programRule("es", { ...program, mode: "POINTS" })).toBe("1000 CDF = 1 punto");
    expect(shareCardMessage("en", { firstName: "Amina", tenantName: "Café", url: "https://c.test", rule: "10 stamps = a reward" })).toBe(
      "Hello Amina, here is your Café loyalty card: https://c.test\nShow its QR code on every visit. 10 stamps = a reward.",
    );
    expect(recoverCardMessage("es", { firstName: null, programName: "Club", url: "https://c.test" })).toContain("https://c.test");
    expect(rewardSummaryLine("en", { name: "Coffee", kind: "PERCENTAGE", value: "10", cost: 5 }, "USD", true)).toBe("Coffee: 10% off — 5 stamps");
  });

  it("traduit les textes Wallet", () => {
    expect(nextRewardValue(3, 10, true, "fr")).toBe("7 passages");
    expect(nextRewardValue(10, 10, true, "en")).toBe("Available");
    const [welcome] = getClubExplanations("Café Matonge", true, 10, undefined, "es");
    expect(welcome?.title).toBe("BIENVENIDO AL CLUB CAFÉ MATONGE");
    const summary = getClubMemberSummary({ tenantName: "Club Ntemba", holder: "Amina", balance: 8, isStamps: true, target: 10, since: "oct. 2026", locale: "en" });
    expect(summary.title).toBe("MY CLUB NTEMBA CARD");
    expect(summary.body).toContain("Only 2 stamps to go");
    expect(getClubExplanations("Café", true, 10)[0]?.title).toBe("BIENVENUE AU CLUB CAFÉ");
  });
});
