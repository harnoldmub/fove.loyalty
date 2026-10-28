import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(n: number) {
  return new Intl.NumberFormat("fr-FR").format(n);
}

export function formatPrice(cents: number, currency = "EUR") {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency, minimumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
}

export function formatDate(value: string | Date, withTime = false) {
  return new Intl.DateTimeFormat("fr-FR", withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(new Date(value));
}

export function newIdempotencyKey(prefix = "web") {
  return `${prefix}-${crypto.randomUUID()}`;
}

export const KIND_LABEL: Record<string, string> = {
  EARN: "Achat",
  ADJUSTMENT: "Ajustement",
  REDEMPTION: "Récompense",
  REDEMPTION_REVERSAL: "Récompense annulée",
  REVERSAL: "Annulation",
  REFUND: "Remboursement",
  EXPIRATION: "Expiration",
};

export function unitLabel(mode: "POINTS" | "STAMPS", n = 2) {
  if (mode === "STAMPS") return n > 1 ? "tampons" : "tampon";
  return n > 1 ? "points" : "point";
}
