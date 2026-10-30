import { Injectable, Logger } from "@nestjs/common";
import { loadConfig } from "../config";

export interface WhatsAppSendResult {
  sent: boolean;
  wamid?: string;
  error?: string;
}

/**
 * Envoi de messages WhatsApp via l'API Meta Graph Cloud (application « DIZAYNA »).
 */
@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger("WhatsApp");

  isConfigured(): boolean {
    return loadConfig().whatsappEnabled;
  }

  normalizeRecipient(raw: string): string {
    let cleaned = raw.replace(/[^\d+]/g, "");
    if (cleaned.startsWith("00")) {
      cleaned = "+" + cleaned.slice(2);
    }
    if (!cleaned.startsWith("+")) {
      if (/^[89]\d{8}$/.test(cleaned)) {
        cleaned = "+243" + cleaned;
      } else if (/^0[89]\d{8}$/.test(cleaned)) {
        cleaned = "+243" + cleaned.slice(1);
      } else {
        cleaned = "+" + cleaned;
      }
    }
    return cleaned.replace(/^\+/, "");
  }

  async send(to: string, body: string): Promise<WhatsAppSendResult> {
    const config = loadConfig();
    if (!config.whatsappEnabled || !config.WHATSAPP_TOKEN || !config.WHATSAPP_PHONE_NUMBER_ID) {
      return { sent: false, error: "WhatsApp Cloud API non configurée." };
    }
    const recipient = this.normalizeRecipient(to);
    if (recipient.length < 8) {
      return { sent: false, error: "Numéro de téléphone invalide." };
    }
    if (config.NODE_ENV === "test") {
      return { sent: true, wamid: "wamid.test" };
    }
    try {
      const res = await fetch(`https://graph.facebook.com/v21.0/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: recipient,
          type: "text",
          text: { preview_url: true, body },
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        messages?: { id: string }[];
        error?: { message?: string };
      };
      if (!res.ok) {
        const msg = data.error?.message || `Meta API ${res.status}`;
        this.logger.warn(`Envoi WhatsApp vers ${recipient} non abouti : ${msg}`);
        return { sent: false, error: msg };
      }
      return { sent: true, wamid: data.messages?.[0]?.id };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Erreur réseau WhatsApp vers ${recipient} : ${msg}`);
      return { sent: false, error: msg };
    }
  }
}
