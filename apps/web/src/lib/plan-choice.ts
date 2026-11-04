/**
 * Offre choisie sur la page tarifs avant d'avoir un compte : retenue dans le
 * navigateur le temps de l'inscription (ou de la connexion) et de la création
 * du commerce, puis consommée par la page Abonnement qui lance le paiement.
 */
const KEY = "fove.offre";
const CODE = /^[a-z0-9_-]{2,40}$/;
/** Un choix oublié depuis plus d'une semaine ne doit plus déclencher de paiement. */
const MAX_AGE_MS = 7 * 86_400_000;

export function rememberPlanChoice(code: string | null | undefined): void {
  if (!code || !CODE.test(code)) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() }));
  } catch {
    // Stockage indisponible (navigation privée) : le parcours continue sans présélection.
  }
}

export function pendingPlanChoice(): string | null {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as { code?: string; at?: number } | null;
    if (!saved?.code || !CODE.test(saved.code) || !saved.at || Date.now() - saved.at > MAX_AGE_MS) return null;
    return saved.code;
  } catch {
    return null;
  }
}

export function clearPlanChoice(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Rien à nettoyer.
  }
}

/** Page d'arrivée après connexion ou création du commerce : le paiement de l'offre choisie, sinon l'espace. */
export function afterAuthPath(fallback = "/app"): string {
  const code = pendingPlanChoice();
  return code ? `/app/billing?offre=${encodeURIComponent(code)}` : fallback;
}

/** Garde l'offre choisie dans les liens entre inscription et connexion. */
export function withPlanChoice(path: string, code: string | null): string {
  return code && CODE.test(code) ? `${path}?offre=${encodeURIComponent(code)}` : path;
}
