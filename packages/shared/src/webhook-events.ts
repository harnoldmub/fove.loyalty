/** Événements sortants envoyés aux webhooks des commerçants. */
export const WEBHOOK_EVENTS = [
  "customer.created",
  "loyalty_account.created",
  "loyalty_transaction.created",
  "redemption.created",
  "redemption.cancelled",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/** En-tête de signature : `t=<unix>,v1=<hmac-sha256 hex de "t.payload">`. */
export const SIGNATURE_HEADER = "fove-signature";
export const SIGNATURE_TOLERANCE_SECONDS = 300;
