import { Injectable, Logger } from "@nestjs/common";
import { loadConfig } from "../config";
import { teamHtml, teamSubject, teamText, type TeamMessage } from "../i18n/email-layout";
import { EmailService } from "./email.service";

/**
 * Notifications internes à l'équipe FOVE (candidature partenaire, message de contact,
 * récapitulatif quotidien…), au gabarit interne, distinct de celui des clients.
 * Destinataire : TEAM_ALERT_EMAIL. Un échec d'envoi n'interrompt jamais l'action en cours.
 */
@Injectable()
export class TeamAlertService {
  private readonly logger = new Logger("TeamAlert");

  constructor(private readonly email: EmailService) {}

  /** Lien vers une page de l'administration. */
  adminUrl(path: string): string {
    return `${loadConfig().APP_URL}/admin${path.startsWith("/") ? path : `/${path}`}`;
  }

  async send(message: TeamMessage): Promise<void> {
    const to = loadConfig().TEAM_ALERT_EMAIL;
    try {
      await this.email.send({ to, subject: teamSubject(message), text: teamText(message), html: teamHtml(message, to) });
    } catch (error) {
      this.logger.error(`Notification interne non envoyée (${message.subject}) : ${(error as Error).message}`);
    }
  }
}
