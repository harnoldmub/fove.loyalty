import "server-only";
import { serverGet } from "./server-api";

/** Repli si l'API ne répond pas : la limite d'origine de l'offre Gratuite. */
const FALLBACK = 100;

/**
 * Nombre de clients inclus dans l'offre Gratuite, tel que réglé dans l'administration (Offres) :
 * les accroches de la vitrine et de l'inscription restent justes si la limite change.
 */
export async function freeCustomerLimit(plans?: { kind: string; limits?: { customers?: number | null } }[] | null): Promise<number> {
  const list = plans ?? (await serverGet<{ kind: string; limits?: { customers?: number | null } }[]>("/plans")).data;
  const free = list?.find((p) => p.kind === "FREE");
  return free?.limits?.customers ?? FALLBACK;
}
