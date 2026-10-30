import { toCents } from "./loyalty-math";

export type RewardKind = "GIFT" | "PERCENTAGE" | "FIXED";
export interface RewardValue { kind: RewardKind; value: string | null }

export function rewardValueLabel(reward: RewardValue, currency: string): string {
  if (reward.kind === "GIFT" || reward.value === null) return "Cadeau";
  const n = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(Number(reward.value));
  return reward.kind === "PERCENTAGE" ? `${n} % de réduction` : `${n} ${currency} de réduction`;
}

const decimal = (cents: bigint) => `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;

/** Arrondi au centime, plafonné à l'achat ; aucun calcul monétaire flottant. */
export function computeRewardDiscount(reward: RewardValue, purchaseAmount: string | null): string | null {
  if (reward.kind === "GIFT") return null;
  if (!reward.value || !purchaseAmount) throw new Error("Saisissez le montant de l’achat pour appliquer la réduction.");
  const purchase = toCents(purchaseAmount);
  const value = toCents(reward.value);
  if (purchase <= 0n || value <= 0n) throw new Error("Le montant de l’achat et la réduction doivent être supérieurs à zéro.");
  if (reward.kind === "PERCENTAGE" && value > 10000n) throw new Error("La réduction ne peut pas dépasser 100 %.");
  const discount = reward.kind === "PERCENTAGE" ? (purchase * value + 5000n) / 10000n : value;
  return decimal(discount > purchase ? purchase : discount);
}
