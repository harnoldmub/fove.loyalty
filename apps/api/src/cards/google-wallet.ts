import { createSign } from "node:crypto";
import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { loadConfig } from "../config";
import { AppError } from "../common/errors";
import type { WalletCardState, WalletProvider } from "../loyalty/wallet";

type ServiceAccount = { client_email: string; private_key: string };

const WALLET_API = "https://walletobjects.googleapis.com/walletobjects/v1";
/** Google garde au plus 10 messages par carte ou par classe : on retire les plus anciens. */
const MAX_MESSAGES = 10;

const b64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");

export class WalletError extends AppError {
  constructor(message: string, status = HttpStatus.UNPROCESSABLE_ENTITY) {
    super(status, "google_wallet", message);
  }
}

/**
 * Google Wallet (Android). Une classe par programme (`<émetteur>.fove_<programme>`),
 * un objet par carte (`<émetteur>.<carte>`). La clé privée reste sur le serveur :
 * le client reçoit seulement un lien « Save to Google Wallet » signé, valable 10 min.
 * La classe est déclarée dans le JWT : Google la crée au premier ajout.
 */
@Injectable()
export class GoogleWalletProvider implements WalletProvider {
  readonly id = "google" as const;
  private readonly logger = new Logger("GoogleWallet");
  private token: { value: string; expiresAt: number } | null = null;

  isConfigured(): boolean {
    return loadConfig().googleWalletEnabled;
  }

  private account(): ServiceAccount {
    try {
      const parsed = JSON.parse(loadConfig().GOOGLE_WALLET_SERVICE_ACCOUNT_JSON ?? "") as ServiceAccount;
      if (!parsed.client_email || !parsed.private_key) throw new Error("incomplet");
      return parsed;
    } catch {
      throw new WalletError("Google Wallet est mal configuré (compte de service).", HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  private sign(payload: object, key: string) {
    const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const body = b64url(JSON.stringify(payload));
    const signer = createSign("RSA-SHA256");
    signer.update(`${header}.${body}`);
    signer.end();
    return `${header}.${body}.${signer.sign(key).toString("base64url")}`;
  }

  classId(programId: string) {
    return `${loadConfig().GOOGLE_WALLET_ISSUER_ID}.fove_${programId.replace(/-/g, "")}`;
  }

  objectId(accountId: string) {
    return `${loadConfig().GOOGLE_WALLET_ISSUER_ID}.${accountId.replace(/-/g, "")}`;
  }

  private loyaltyClass(card: WalletCardState) {
    const logo = card.logoUrl?.startsWith("https://") ? card.logoUrl : `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://fove.digital"}/share-icon.png`;
    return {
      id: this.classId(card.programId),
      issuerName: card.tenantName.slice(0, 20),
      programName: card.programName.slice(0, 20),
      programLogo: { sourceUri: { uri: logo } },
      hexBackgroundColor: card.primaryColor,
      reviewStatus: "UNDER_REVIEW",
    };
  }

  private loyaltyObject(card: WalletCardState) {
    return {
      id: this.objectId(card.accountId),
      classId: this.classId(card.programId),
      state: "ACTIVE",
      accountId: card.cardNumber,
      accountName: card.holder,
      loyaltyPoints: { label: card.unit === "tampons" ? "Tampons" : "Points", balance: { string: String(Math.max(0, card.balance)) } },
      barcode: { type: "QR_CODE", value: card.qrPayload, alternateText: card.cardNumber },
      linksModuleData: { uris: [{ uri: card.cardUrl, description: "Ma carte en ligne" }] },
    };
  }

  async createPass(card: WalletCardState): Promise<{ url: string }> {
    if (!this.isConfigured()) throw new WalletError("Google Wallet n'est pas activé.", HttpStatus.NOT_FOUND);
    const account = this.account();
    const now = Math.floor(Date.now() / 1000);
    const jwt = this.sign(
      {
        iss: account.client_email,
        aud: "google",
        typ: "savetowallet",
        origins: [loadConfig().APP_URL],
        iat: now,
        exp: now + 10 * 60,
        payload: { loyaltyClasses: [this.loyaltyClass(card)], loyaltyObjects: [this.loyaltyObject(card)] },
      },
      account.private_key,
    );
    return { url: `https://pay.google.com/gp/v/save/${jwt}` };
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const account = this.account();
    const now = Math.floor(Date.now() / 1000);
    const assertion = this.sign(
      { iss: account.client_email, scope: "https://www.googleapis.com/auth/wallet_object.issuer", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 },
      account.private_key,
    );
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
    if (!res.ok || !data.access_token) throw new WalletError("Connexion à Google Wallet impossible.", HttpStatus.BAD_GATEWAY);
    this.token = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
    return data.access_token;
  }

  /** Met à jour le solde affiché sur la carte enregistrée (sans effet si le client ne l'a pas ajoutée). */
  async updatePass(card: WalletCardState): Promise<void> {
    if (!this.isConfigured()) return;
    try {
      const token = await this.accessToken();
      const res = await fetch(`${WALLET_API}/loyaltyObject/${encodeURIComponent(this.objectId(card.accountId))}`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ loyaltyPoints: this.loyaltyObject(card).loyaltyPoints }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok && res.status !== 404) this.logger.warn(`Mise à jour du pass ${card.accountId} : HTTP ${res.status}`);
    } catch (error) {
      this.logger.warn(`Mise à jour du pass ${card.accountId} : ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Message avec notification sur le téléphone (TEXT_AND_NOTIFY), à une carte
   * (`loyaltyObject`) ou à toutes les cartes d'un programme (`loyaltyClass`).
   * Google limite à 3 notifications par carte et par 24 h.
   */
  private async addMessage(resource: string, notFound: string, message: { title: string; body: string }) {
    if (!this.isConfigured()) throw new WalletError("Google Wallet n'est pas activé.", HttpStatus.NOT_FOUND);
    const token = await this.accessToken();
    const url = `${WALLET_API}/${resource}`;
    const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
    const current = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
    if (current.status === 404) throw new WalletError(notFound);
    if (!current.ok) throw new WalletError("Google Wallet ne répond pas. Réessayez dans un instant.", HttpStatus.BAD_GATEWAY);
    const { messages = [] } = (await current.json()) as { messages?: unknown[] };
    if (messages.length >= MAX_MESSAGES) {
      const trimmed = await fetch(url, { method: "PATCH", headers, body: JSON.stringify({ messages: messages.slice(-(MAX_MESSAGES - 1)) }) });
      if (!trimmed.ok) throw new WalletError("Impossible de faire de la place pour le nouveau message.", HttpStatus.BAD_GATEWAY);
    }
    const res = await fetch(`${url}/addMessage`, {
      method: "POST",
      headers,
      body: JSON.stringify({ message: { id: `fove-${Date.now()}`, header: message.title, body: message.body, messageType: "TEXT_AND_NOTIFY" } }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return;
    const detail = await res.text();
    if (res.status === 429 || /quota/i.test(detail)) throw new WalletError("Limite Google atteinte : 3 notifications par carte et par 24 h. Réessayez demain.", HttpStatus.TOO_MANY_REQUESTS);
    this.logger.error(`addMessage ${res.status} ${detail.slice(0, 300)}`);
    throw new WalletError("La notification Google Wallet n'a pas pu être envoyée.", HttpStatus.BAD_GATEWAY);
  }

  sendToCard(accountId: string, message: { title: string; body: string }) {
    return this.addMessage(`loyaltyObject/${encodeURIComponent(this.objectId(accountId))}`, "Le client n'a pas encore ajouté cette carte à Google Wallet.", message);
  }

  broadcast(programId: string, message: { title: string; body: string }) {
    return this.addMessage(`loyaltyClass/${encodeURIComponent(this.classId(programId))}`, "Aucun client n'a encore ajouté de carte de ce programme à Google Wallet.", message);
  }
}
