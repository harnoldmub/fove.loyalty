import { Injectable, Logger } from "@nestjs/common";
import { loadConfig } from "../config";
import { PrismaService } from "../common/prisma.service";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Envoi d'emails transactionnels. Fournisseur configurable :
 * - `console` (dev/test) : journalisé + table EmailOutbox, rien ne part ;
 * - `resend` : API HTTP Resend.
 * Chaque envoi laisse une trace dans EmailOutbox pour le support.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger("Email");

  constructor(private readonly prisma: PrismaService) {}

  async send(message: EmailMessage): Promise<void> {
    const config = loadConfig();
    const record = await this.prisma.client.emailOutbox.create({
      data: { ...message, provider: config.EMAIL_PROVIDER },
    });

    if (config.EMAIL_PROVIDER === "console") {
      if (config.NODE_ENV !== "test") this.logger.log(`[console] → ${message.to} : ${message.subject}\n${message.text}`);
      await this.prisma.client.emailOutbox.update({ where: { id: record.id }, data: { status: "SENT", sentAt: new Date() } });
      return;
    }

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: config.EMAIL_FROM, to: message.to, subject: message.subject, text: message.text, html: message.html }),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
      await this.prisma.client.emailOutbox.update({ where: { id: record.id }, data: { status: "SENT", sentAt: new Date() } });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Échec d'envoi à ${message.to} : ${msg}`);
      await this.prisma.client.emailOutbox.update({ where: { id: record.id }, data: { status: "FAILED", error: msg } });
    }
  }
}
