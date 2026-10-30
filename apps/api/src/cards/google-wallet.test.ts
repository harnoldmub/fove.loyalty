import { generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GoogleWalletProvider } from "./google-wallet";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
vi.mock("../config", () => ({ loadConfig: () => ({
  GOOGLE_WALLET_ISSUER_ID: "123456789",
  GOOGLE_WALLET_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: "fove@example.test", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) }),
  APP_URL: "https://fove.example.test",
  googleWalletEnabled: true,
}) }));

afterEach(() => vi.unstubAllGlobals());

describe("séparation des cartes FOVE sur un émetteur partagé", () => {
  it("réserve des identifiants distincts aux programmes et aux cartes", () => {
    const wallet = new GoogleWalletProvider();
    const id = "11111111-2222-4333-8444-555555555555";
    expect(wallet.classId(id)).toBe("123456789.fove_digital_program_11111111222243338444555555555555");
    expect(wallet.objectId(id)).toBe("123456789.fove_digital_card_11111111222243338444555555555555");
    expect(wallet.objectId(id)).not.toBe(wallet.classId(id));
  });

  it("envoie une campagne seulement à la classe FOVE du programme", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "token", expires_in: 3600 }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ messages: [] }) })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetch);
    await new GoogleWalletProvider().broadcast("program-1", { title: "FOVE", body: "Offre du commerce" });
    expect(fetch.mock.calls[1]?.[0]).toBe("https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass/123456789.fove_digital_program_program1");
    expect(fetch.mock.calls[2]?.[0]).toBe("https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass/123456789.fove_digital_program_program1/addMessage");
  });
});
