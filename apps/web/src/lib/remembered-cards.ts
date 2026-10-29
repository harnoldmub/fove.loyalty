/**
 * Cartes mémorisées sur ce téléphone : la page d'inscription propose ensuite
 * « Ouvrir ma carte » au lieu d'une nouvelle inscription. Stockage local au
 * navigateur, facultatif (navigation privée : rien n'est mémorisé).
 */
const KEY = "fove:cards";

export interface RememberedCard {
  tenant: string;
  program: string;
  path: string;
}

export function readRememberedCards(): RememberedCard[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    return Array.isArray(value) ? (value as RememberedCard[]).filter((c) => typeof c?.path === "string" && c.path.startsWith("/card/fvc_")) : [];
  } catch {
    return [];
  }
}

export function rememberCard(card: RememberedCard) {
  try {
    const others = readRememberedCards().filter((c) => !(c.tenant === card.tenant && c.program === card.program));
    localStorage.setItem(KEY, JSON.stringify([card, ...others].slice(0, 10)));
  } catch {
    /* stockage indisponible : rien à faire */
  }
}
