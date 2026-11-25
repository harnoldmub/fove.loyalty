/**
 * Références de paiement hors ligne (docs/chantier-encaissement-hors-ligne.md, 3) :
 * `FV-7KQ4M2-X` pour une facture, `FV-RL-7KQ4M2-X` pour un relevé de partenaire.
 * Alphabet sans caractères confondables (ni 0/O, ni 1/I/L) ; la dernière lettre est
 * une clé de contrôle qui détecte une faute de frappe ou deux caractères inversés.
 */

export const REFERENCE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const BODY_LENGTH = 6;

export type ReferenceKind = "invoice" | "statement";

function checkChar(body: string): string {
  let sum = 0;
  for (let i = 0; i < body.length; i += 1) sum += REFERENCE_ALPHABET.indexOf(body[i]!) * (i + 2);
  return REFERENCE_ALPHABET[sum % REFERENCE_ALPHABET.length]!;
}

/** Nouvelle référence ; `random` renvoie un entier dans [0, n) (crypto côté serveur). */
export function generatePaymentReference(kind: ReferenceKind, random: (n: number) => number): string {
  let body = "";
  for (let i = 0; i < BODY_LENGTH; i += 1) body += REFERENCE_ALPHABET[random(REFERENCE_ALPHABET.length)];
  return `${kind === "statement" ? "FV-RL-" : "FV-"}${body}-${checkChar(body)}`;
}

/** Forme canonique d'une saisie (minuscules, espaces, tirets oubliés, O/I saisis pour 0/1…), ou null si invalide. */
export function normalizePaymentReference(input: string): { reference: string; kind: ReferenceKind } | null {
  const compact = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const match = /^FV(RL)?([A-Z0-9]{6})([A-Z0-9])$/.exec(compact);
  if (!match) return null;
  const body = match[2]!;
  const check = match[3]!;
  if (![...body, check].every((c) => REFERENCE_ALPHABET.includes(c))) return null;
  if (checkChar(body) !== check) return null;
  const kind: ReferenceKind = match[1] ? "statement" : "invoice";
  return { reference: `${kind === "statement" ? "FV-RL-" : "FV-"}${body}-${check}`, kind };
}

/**
 * Références valides trouvées dans un libellé bancaire (« VIR FV 7KQ4M2 X BOUTIQUE » , « fv-rl-7kq4m2x »…).
 * Seules les références dont la clé de contrôle est juste sont retenues.
 */
export function findPaymentReferences(label: string): { reference: string; kind: ReferenceKind }[] {
  const compact = label.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const found = new Map<string, { reference: string; kind: ReferenceKind }>();
  for (let i = compact.indexOf("FV"); i !== -1; i = compact.indexOf("FV", i + 1)) {
    for (const length of [11, 9]) {
      const candidate = normalizePaymentReference(compact.slice(i, i + length));
      if (candidate) {
        found.set(candidate.reference, candidate);
        break;
      }
    }
  }
  return [...found.values()];
}
