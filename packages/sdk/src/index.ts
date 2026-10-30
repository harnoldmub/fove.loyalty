import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * SDK serveur FOVE. À utiliser uniquement côté serveur : la clé secrète
 * (fove_sk_…) ne doit jamais être envoyée à un navigateur.
 */
export interface FoveClientOptions {
  apiKey: string;
  /** https://api.fove.digital par défaut. */
  baseUrl?: string;
  timeoutMs?: number;
  /** Nouvelles tentatives sur erreur réseau ou 5xx (même clé d'idempotence). */
  maxRetries?: number;
  fetch?: typeof fetch;
}

export class FoveError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "FoveError";
  }
}

export interface CommerceCustomer {
  externalId: string;
  email?: string | null;
  phone?: string | null;
  firstName?: string;
  lastName?: string;
  marketingEmailConsent?: boolean;
}

export interface OrderPaid {
  programId: string;
  externalOrderId: string;
  orderNumber?: string | null;
  customer: CommerceCustomer;
  /** Montant décimal en chaîne : "125.50". */
  amount: string;
  currency: string;
  paidAt: string;
}

export interface OrderPaidResult {
  customerId: string;
  customerCreated: boolean;
  accountId: string;
  transactionId: string;
  pointsEarned: number;
  balance: number;
  replayed: boolean;
}

export interface OrderRefunded {
  programId: string;
  externalOrderId: string;
  externalRefundId: string;
  amount: string;
}

export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class FoveClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: FoveClientOptions) {
    if (!options.apiKey.startsWith("fove_sk_")) throw new Error("FoveClient attend une clé secrète fove_sk_…");
    this.baseUrl = (options.baseUrl ?? "https://api.fove.digital").replace(/\/$/, "");
    this.fetchImpl = options.fetch ?? fetch;
  }

  async request<T>(method: "GET" | "POST", path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
    const key = method === "POST" ? (idempotencyKey ?? randomUUID()) : undefined;
    const retries = this.options.maxRetries ?? 2;
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await this.fetchImpl(`${this.baseUrl}/api${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${this.options.apiKey}`,
            "Content-Type": "application/json",
            ...(key ? { "Idempotency-Key": key } : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(this.options.timeoutMs ?? 15_000),
        });
        const text = await res.text();
        const json = text ? JSON.parse(text) : null;
        if (res.ok) return json as T;
        const err = json?.error ?? {};
        const error = new FoveError(res.status, err.code ?? "http_error", err.message ?? `HTTP ${res.status}`, err.details);
        if (res.status >= 500 && attempt < retries) {
          await sleep(300 * 2 ** attempt);
          continue;
        }
        throw error;
      } catch (error) {
        if (error instanceof FoveError || attempt >= retries) throw error;
        await sleep(300 * 2 ** attempt);
      }
    }
  }

  // Clients
  listCustomers(params: { q?: string; cursor?: string; limit?: number } = {}) {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));
    return this.request<Page<Record<string, unknown>>>("GET", `/v1/customers?${qs}`);
  }
  findCustomer(query: { externalId?: string; email?: string; phone?: string }) {
    const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v) as [string, string][]);
    return this.request<Record<string, unknown>>("GET", `/v1/customers/lookup?${qs}`);
  }
  createCustomer(input: { firstName: string; lastName?: string; phone?: string | null; email?: string | null; externalRef?: string | null }, idempotencyKey?: string) {
    return this.request<Record<string, unknown>>("POST", "/v1/customers", input, idempotencyKey);
  }

  // Fidélité
  listPrograms() {
    return this.request<Record<string, unknown>[]>("GET", "/v1/programs");
  }
  enroll(customerId: string, programId: string, idempotencyKey?: string) {
    return this.request<{ accountId: string; cardUrl: string }>("POST", "/v1/loyalty/accounts", { customerId, programId }, idempotencyKey);
  }
  getAccount(accountId: string) {
    return this.request<Record<string, unknown>>("GET", `/v1/loyalty/accounts/${accountId}`);
  }
  earn(input: { accountId: string; amount?: string | null; saleReference?: string | null }, idempotencyKey: string) {
    return this.request<{ transaction: Record<string, unknown>; replayed: boolean }>("POST", "/v1/loyalty/transactions", input, idempotencyKey);
  }
  redeem(input: { accountId: string; rewardId: string; purchaseAmount?: string; establishmentId?: string }, idempotencyKey: string) {
    return this.request<{ redemption: Record<string, unknown>; replayed: boolean }>("POST", "/v1/redemptions", input, idempotencyKey);
  }

  // Connecteur e-commerce
  linkCustomer(customer: CommerceCustomer) {
    return this.request<{ customerId: string; created: boolean; matchedBy: "externalId" | "email" | null }>(
      "POST",
      "/v1/integrations/commerce/customers",
      customer,
    );
  }
  /**
   * Commande payée. FOVE déduplique sur `externalOrderId` : renvoyer la même
   * commande (webhook rejoué, reprise après panne) ne crédite jamais deux fois
   * et renvoie `replayed: true`.
   */
  orderPaid(order: OrderPaid) {
    return this.request<OrderPaidResult>("POST", "/v1/integrations/commerce/orders/paid", order);
  }
  orderRefunded(refund: OrderRefunded) {
    return this.request<{ transactionId: string; pointsRemoved: number; balance: number; replayed: boolean }>(
      "POST",
      "/v1/integrations/commerce/orders/refunded",
      refund,
    );
  }
}

/**
 * Vérifie la signature d'un webhook FOVE (en-tête `fove-signature`).
 * `rawBody` doit être le corps exact reçu, avant tout parsing JSON.
 */
export function verifyWebhookSignature(rawBody: string, header: string | null | undefined, secret: string, toleranceSeconds = 300, now = Date.now()): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const timestamp = Number(parts.t);
  if (!parts.v1 || !Number.isFinite(timestamp)) return false;
  if (Math.abs(now / 1000 - timestamp) > toleranceSeconds) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}
