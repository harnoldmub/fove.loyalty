import { Injectable, Logger } from "@nestjs/common";
import { loadConfig } from "../config";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";
import { EmailService } from "../notifications/email.service";
import { PlanService } from "./plan.service";

type Reason = "reached" | "blocked";

/** Un même rappel n'est envoyé qu'une fois par jour et par motif. */
const REPEAT_AFTER_MS = 24 * 3600 * 1000;

/**
 * Prévient le commerçant quand son quota de clients est atteint ou qu'un
 * client vient d'être refusé à l'inscription. Le client final, lui, ne voit
 * jamais l'offre du commerçant.
 */
@Injectable()
export class QuotaAlertService {
  private readonly logger = new Logger("QuotaAlert");

  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlanService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
  ) {}

  /** Après une création : alerte si la dernière place vient d'être prise. */
  async afterCustomerCreated(tenantId: string): Promise<void> {
    const limit = (await this.plans.limits(tenantId)).customers;
    if (limit === null) return;
    const used = await this.prisma.client.customer.count({ where: { tenantId, anonymizedAt: null } });
    if (used >= limit) await this.notify(tenantId, "reached", limit);
  }

  /** Un client s'est vu refuser l'inscription faute de place. */
  async customerBlocked(tenantId: string): Promise<void> {
    const limit = (await this.plans.limits(tenantId)).customers;
    if (limit !== null) await this.notify(tenantId, "blocked", limit);
  }

  private async notify(tenantId: string, reason: Reason, limit: number): Promise<void> {
    try {
      const recent = await this.prisma.client.auditLog.findFirst({
        where: {
          tenantId,
          action: "billing.quota_alert",
          metadata: { path: ["reason"], equals: reason },
          createdAt: { gte: new Date(Date.now() - REPEAT_AFTER_MS) },
        },
      });
      if (recent) return;
      const tenant = await this.prisma.client.tenant.findUnique({ where: { id: tenantId }, include: { settings: true } });
      const to = tenant?.settings?.contactEmail;
      if (!tenant || !to) return;
      const billingUrl = `${loadConfig().APP_URL}/app/billing`;
      const subject =
        reason === "blocked" ? `Un client n'a pas pu rejoindre ${tenant.name}` : `${tenant.name} a atteint ${limit} clients`;
      const situation =
        reason === "blocked"
          ? `Un client vient d'essayer de rejoindre votre programme de fidélité, mais votre offre est limitée à ${limit} clients. Il a vu un message lui indiquant que les inscriptions sont momentanément fermées.`
          : `Votre programme de fidélité compte désormais ${limit} clients, la limite de votre offre. Les prochaines inscriptions seront refusées.`;
      await this.email.send({
        to,
        subject,
        text: `Bonjour,\n\n${situation}\n\nVos clients actuels gardent leurs cartes et leurs points. Pour accueillir de nouveaux clients, passez à une offre supérieure : ${billingUrl}\n\nL'équipe FOVE`,
      });
      await this.audit.log({ tenantId, action: "billing.quota_alert", metadata: { reason, limit } });
    } catch (error) {
      // Une alerte qui échoue ne doit jamais faire échouer l'inscription.
      this.logger.warn(`Alerte de quota non envoyée pour ${tenantId} : ${(error as Error).message}`);
    }
  }
}
