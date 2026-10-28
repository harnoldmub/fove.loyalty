/**
 * Calculs purs du moteur de fidélité. Les montants arrivent en chaîne décimale
 * ("15000" ou "12.50") pour éviter les erreurs d'arrondi des flottants : on
 * travaille en centimes entiers (BigInt).
 */
export type ProgramMode = "POINTS" | "STAMPS";

export interface EarnRules {
  mode: ProgramMode;
  /** POINTS : montant à dépenser pour gagner `pointsPerStep` points. */
  spendStep: string;
  pointsPerStep: number;
  /** STAMPS : tampons gagnés par achat validé. */
  stampsPerPurchase: number;
  /** Montant minimum d'achat pour gagner quoi que ce soit (null = aucun). */
  minPurchaseAmount: string | null;
  /** Plafond par opération (null = aucun). */
  maxPerTransaction: number | null;
}

export function toCents(amount: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount.trim());
  if (!match) throw new Error(`Montant invalide : ${amount}`);
  const units = BigInt(match[1]!);
  const decimals = (match[2] ?? "").padEnd(2, "0");
  return units * 100n + BigInt(decimals);
}

export function computeEarn(rules: EarnRules, amount: string | null): number {
  const cents = amount === null ? null : toCents(amount);
  if (rules.minPurchaseAmount !== null) {
    if (cents === null || cents < toCents(rules.minPurchaseAmount)) return 0;
  }

  let earned: number;
  if (rules.mode === "STAMPS") {
    earned = rules.stampsPerPurchase;
  } else {
    if (cents === null) return 0;
    const step = toCents(rules.spendStep);
    if (step <= 0n) return 0;
    const steps = cents / step;
    earned = Number(steps) * rules.pointsPerStep;
  }

  if (rules.maxPerTransaction !== null) earned = Math.min(earned, rules.maxPerTransaction);
  return Math.max(0, earned);
}

/** Débit proportionnel lors d'un remboursement partiel, arrondi vers le bas. */
export function proportionalReversal(originalPoints: number, originalAmount: string, refundedAmount: string): number {
  const total = toCents(originalAmount);
  const refunded = toCents(refundedAmount);
  if (total <= 0n) return originalPoints;
  if (refunded >= total) return originalPoints;
  return Number((BigInt(originalPoints) * refunded) / total);
}
