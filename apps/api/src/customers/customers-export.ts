import type { Prisma } from "@fove/database";
import { computeCustomerSegment, type CustomerSegment } from "@fove/shared";
import type { Locale } from "../i18n/locale";

/** En-têtes de l'export du fichier clients, dans la langue du commerce. */
const HEADERS: Record<Locale, string[]> = {
  fr: ["Prénom", "Nom", "Téléphone", "Email", "Référence", "Inscrit le", "Dernière visite", "Visites", "Dépenses", "Segment", "Anniversaire", "Offres par email", "Offres par SMS/WhatsApp", "Étiquettes", "Cartes"],
  en: ["First name", "Last name", "Phone", "Email", "Reference", "Joined on", "Last visit", "Visits", "Spend", "Segment", "Birthday", "Email offers", "SMS/WhatsApp offers", "Tags", "Cards"],
  ar: ["الاسم", "اللقب", "الهاتف", "البريد", "المرجع", "تاريخ التسجيل", "آخر زيارة", "الزيارات", "الإنفاق", "الشريحة", "عيد الميلاد", "عروض بالبريد", "عروض SMS/WhatsApp", "الوسوم", "البطاقات"],
  es: ["Nombre", "Apellido", "Teléfono", "Email", "Referencia", "Alta el", "Última visita", "Visitas", "Gasto", "Segmento", "Cumpleaños", "Ofertas por email", "Ofertas por SMS/WhatsApp", "Etiquetas", "Tarjetas"],
};

const SEGMENTS: Record<Locale, Record<CustomerSegment, string>> = {
  fr: { NEW: "Nouveau", VIP: "VIP", REGULAR: "Régulier", AT_RISK: "En risque", DORMANT: "Dormant" },
  en: { NEW: "New", VIP: "VIP", REGULAR: "Regular", AT_RISK: "At risk", DORMANT: "Dormant" },
  ar: { NEW: "جديد", VIP: "VIP", REGULAR: "منتظم", AT_RISK: "معرّض للفقدان", DORMANT: "خامل" },
  es: { NEW: "Nuevo", VIP: "VIP", REGULAR: "Habitual", AT_RISK: "En riesgo", DORMANT: "Inactivo" },
};

const YES_NO: Record<Locale, [string, string]> = { fr: ["oui", "non"], en: ["yes", "no"], ar: ["نعم", "لا"], es: ["sí", "no"] };

/** Séparateur attendu par Excel selon la langue : « ; » là où la virgule est le séparateur décimal. */
export const csvSeparator = (locale: Locale) => (locale === "en" ? "," : ";");

/**
 * Cellule CSV sûre : guillemets doublés, et protection contre l'injection de formules (une valeur
 * commençant par = + - @ ou une tabulation est préfixée d'une apostrophe, comme le recommande l'OWASP).
 */
export function csvCell(value: unknown, separator: string): string {
  let text = value === null || value === undefined ? "" : String(value);
  // Un numéro international (+ et chiffres seulement) ne peut pas être une formule : gardé tel quel.
  if (/^[=+\-@\t\r]/.test(text) && !/^\+\d{6,15}$/.test(text)) text = `'${text}`;
  return /["\r\n]/.test(text) || text.includes(separator) ? `"${text.replace(/"/g, '""')}"` : text;
}

export type ExportCustomer = Prisma.CustomerGetPayload<{
  include: { accounts: { select: { cardNumber: true; balance: true; status: true; program: { select: { name: true } } } } };
}>;

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export function exportHeader(locale: Locale): string {
  const sep = csvSeparator(locale);
  return HEADERS[locale].map((h) => csvCell(h, sep)).join(sep);
}

export function exportRow(c: ExportCustomer, locale: Locale, now: Date): { line: string; segment: CustomerSegment } {
  const sep = csvSeparator(locale);
  const segment = computeCustomerSegment({ totalVisits: c.totalVisits, totalSpend: Number(c.totalSpend), lastVisitAt: c.lastVisitAt, createdAt: c.createdAt, now }).segment;
  const [yes, no] = YES_NO[locale];
  const cards = c.accounts
    .filter((a) => a.status !== "CLOSED")
    .map((a) => `${a.program.name} ${a.cardNumber} : ${a.balance}`)
    .join(" | ");
  const cells = [
    c.firstName,
    c.lastName,
    c.phone,
    c.email,
    c.externalRef,
    day(c.createdAt),
    day(c.lastVisitAt),
    c.totalVisits,
    c.totalSpend.toString(),
    SEGMENTS[locale][segment],
    c.birthDay && c.birthMonth ? `${String(c.birthDay).padStart(2, "0")}/${String(c.birthMonth).padStart(2, "0")}` : "",
    c.marketingEmailConsent ? yes : no,
    c.marketingSmsConsent ? yes : no,
    c.tags.join(", "),
    cards,
  ];
  return { line: cells.map((v) => csvCell(v, sep)).join(sep), segment };
}
