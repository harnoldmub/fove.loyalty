/**
 * Extrait les 2 caractères d'initiales d'un restaurant / commerce pour la numérotation des cartes.
 * Règle :
 * - Si le nom comporte au moins 2 mots : 1ère lettre du 1er mot + 1ère lettre du 2ème mot (ex: "Café Matonge" -> "CM", "La Braise" -> "LB").
 * - Si le nom comporte 1 seul mot : les 2 premières lettres de ce mot (ex: "Dizayna" -> "DI").
 * - Tout caractère accentué est converti en ASCII standard (ex: "é" -> "E") et tout est mis en majuscules.
 * - Si 1 seule lettre disponible : complété par "X" (ex: "A" -> "AX").
 * - Si vide ou invalide : repli sur "FV".
 */
export function tenantInitials(name?: string | null): string {
  if (!name) return "FV";

  const normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();

  const words = normalized.split(/[^A-Z0-9]+/).filter((w) => w.length > 0);

  const first = words[0];
  const second = words[1];

  if (first && second) {
    const c1 = first[0] ?? "F";
    const c2 = second[0] ?? "V";
    return `${c1}${c2}`;
  }

  if (first) {
    return first.length >= 2 ? first.slice(0, 2) : `${first}X`;
  }

  return "FV";
}
