/**
 * Nom du commerce transmis par le lien d'inscription d'un partenaire (« Inscrire un commerce ») :
 * mémorisé à l'inscription, repris dans la création du commerce (onboarding).
 */
export const BUSINESS_PREFILL_KEY = "fove.prefill.business";

export function readBusinessPrefill(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(BUSINESS_PREFILL_KEY) ?? "";
  } catch {
    return "";
  }
}

export function clearBusinessPrefill() {
  try {
    localStorage.removeItem(BUSINESS_PREFILL_KEY);
  } catch {
    // ignore
  }
}
