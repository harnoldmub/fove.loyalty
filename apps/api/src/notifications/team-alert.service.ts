import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import type { TeamNotificationSettings } from "@fove/database";
import { loadConfig } from "../config";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";
import { teamHtml, teamSubject, teamText, type TeamMessage, type TeamTopic } from "../i18n/email-layout";
import { EmailService } from "./email.service";

/** Types d'envoi réglables depuis l'administration ; les autres rubriques ne suivent que l'interrupteur général. */
const TOGGLES: Partial<Record<TeamTopic, "partners" | "contact" | "digest">> = { partners: "partners", contact: "contact", digest: "digest" };

export const teamNotificationSettingsSchema = z.object({
  enabled: z.boolean(),
  recipients: z.array(z.email().trim().toLowerCase()).max(10),
  partners: z.boolean(),
  contact: z.boolean(),
  digest: z.boolean(),
});
export type TeamNotificationSettingsInput = z.infer<typeof teamNotificationSettingsSchema>;

/**
 * Notifications internes à l'équipe FOVE (candidature partenaire, message de contact,
 * récapitulatif quotidien…), au gabarit interne, distinct de celui des clients.
 * Réglables dans Admin > Système : interrupteur général (désactivé par défaut), destinataires
 * (sinon TEAM_ALERT_EMAIL) et types d'envoi. Un échec d'envoi n'interrompt jamais l'action en cours.
 */
@Injectable()
export class TeamAlertService {
  private readonly logger = new Logger("TeamAlert");

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
  ) {}

  /** Lien vers une page de l'administration. */
  adminUrl(path: string): string {
    return `${loadConfig().APP_URL}/admin${path.startsWith("/") ? path : `/${path}`}`;
  }

  async settings(): Promise<TeamNotificationSettings> {
    return (
      (await this.prisma.client.teamNotificationSettings.findUnique({ where: { id: "default" } })) ??
      // Pas encore réglé : valeurs par défaut (désactivé), sans écrire en base.
      { id: "default", enabled: false, recipients: [], partners: true, contact: true, digest: true, updatedByEmail: null, updatedAt: new Date(0) }
    );
  }

  /** Réglages et destinataires effectifs, pour l'administration. */
  async view() {
    const settings = await this.settings();
    return { ...settings, defaultRecipient: loadConfig().TEAM_ALERT_EMAIL, effectiveRecipients: this.recipients(settings) };
  }

  async update(input: TeamNotificationSettingsInput, actor: { userId: string; email: string }) {
    const data = { ...input, recipients: [...new Set(input.recipients)], updatedByEmail: actor.email };
    await this.prisma.client.teamNotificationSettings.upsert({ where: { id: "default" }, create: { id: "default", ...data }, update: data });
    await this.audit.log({ actorUserId: actor.userId, action: "team_notifications.updated", metadata: { ...input } });
    return this.view();
  }

  /** Vrai si une notification de cette rubrique doit partir. */
  async isEnabled(topic: TeamTopic): Promise<boolean> {
    const settings = await this.settings();
    const toggle = TOGGLES[topic];
    return settings.enabled && (!toggle || settings[toggle]);
  }

  async send(message: TeamMessage): Promise<void> {
    try {
      const settings = await this.settings();
      if (!(await this.isEnabled(message.topic))) return;
      await this.deliver(message, this.recipients(settings));
    } catch (error) {
      this.logger.error(`Notification interne non envoyée (${message.subject}) : ${(error as Error).message}`);
    }
  }

  /** Email de test, envoyé même si les notifications sont désactivées (vérification des destinataires). */
  async sendTest(actor: { email: string }): Promise<{ sentTo: string[] }> {
    const settings = await this.settings();
    const to = this.recipients(settings);
    await this.deliver(
      {
        topic: "digest",
        subject: "Email de test",
        heading: "Les notifications de l'équipe arrivent bien",
        intro: `Envoyé depuis Admin > Système par ${actor.email}.`,
        fields: [
          ["Notifications", settings.enabled ? "Activées" : "Désactivées"],
          ["Candidatures partenaires", settings.partners ? "Oui" : "Non"],
          ["Messages de contact", settings.contact ? "Oui" : "Non"],
          ["Récapitulatif quotidien", settings.digest ? "Oui" : "Non"],
        ],
        button: { label: "Ouvrir les réglages", url: this.adminUrl("/system") },
      },
      to,
    );
    return { sentTo: to };
  }

  private recipients(settings: Pick<TeamNotificationSettings, "recipients">): string[] {
    return settings.recipients.length ? settings.recipients : [loadConfig().TEAM_ALERT_EMAIL];
  }

  private async deliver(message: TeamMessage, recipients: string[]) {
    for (const to of recipients) {
      await this.email.send({ to, subject: teamSubject(message), text: teamText(message), html: teamHtml(message, to) });
    }
  }
}
