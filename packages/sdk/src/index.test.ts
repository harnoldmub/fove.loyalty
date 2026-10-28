import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { FoveClient, FoveError, verifyWebhookSignature } from "./index";

describe("verifyWebhookSignature", () => {
  const secret = "whsec_test";
  const body = JSON.stringify({ type: "loyalty_transaction.created" });
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");

  it("accepte une signature valide", () => {
    expect(verifyWebhookSignature(body, `t=${t},v1=${sig}`, secret)).toBe(true);
  });
  it("refuse un corps modifié, un mauvais secret ou une signature trop ancienne", () => {
    expect(verifyWebhookSignature(body + " ", `t=${t},v1=${sig}`, secret)).toBe(false);
    expect(verifyWebhookSignature(body, `t=${t},v1=${sig}`, "autre")).toBe(false);
    expect(verifyWebhookSignature(body, `t=${t},v1=${sig}`, secret, 300, (t + 3600) * 1000)).toBe(false);
    expect(verifyWebhookSignature(body, null, secret)).toBe(false);
  });
});

describe("FoveClient", () => {
  it("refuse une clé publique", () => {
    expect(() => new FoveClient({ apiKey: "fove_pk_test_x" })).toThrow();
  });

  it("réessaie les 5xx avec la même clé d'idempotence", async () => {
    const keys: string[] = [];
    let calls = 0;
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      keys.push((init.headers as Record<string, string>)["Idempotency-Key"]!);
      calls++;
      if (calls < 2) return new Response(JSON.stringify({ error: { code: "internal_error", message: "x" } }), { status: 500 });
      return new Response(JSON.stringify({ ok: true }), { status: 201 });
    }) as typeof fetch;
    const client = new FoveClient({ apiKey: "fove_sk_test_x", baseUrl: "http://fove.test", fetch: fakeFetch });
    await client.earn({ accountId: "a", amount: "10" }, "key-1234");
    expect(calls).toBe(2);
    expect(new Set(keys)).toEqual(new Set(["key-1234"]));
  });

  it("remonte les erreurs métier sans réessayer", async () => {
    let calls = 0;
    const fakeFetch = (async () => {
      calls++;
      return new Response(JSON.stringify({ error: { code: "insufficient_balance", message: "Solde insuffisant" } }), { status: 422 });
    }) as unknown as typeof fetch;
    const client = new FoveClient({ apiKey: "fove_sk_test_x", baseUrl: "http://fove.test", fetch: fakeFetch });
    await expect(client.redeem({ accountId: "a", rewardId: "r" }, "k-12345678")).rejects.toBeInstanceOf(FoveError);
    expect(calls).toBe(1);
  });
});
