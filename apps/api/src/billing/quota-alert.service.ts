import { Injectable, Logger } from "@nestjs/common";
import { loadConfig } from "../config";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";
import { EmailService } from "../notifications/email.service";
import { PlanService } from "./plan.service";
import { tenantLocale } from "../i18n/locale";
import { quotaAlertMessage } from "../i18n/emails";

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
      await this.email.send({
        to,
        ...quotaAlertMessage(tenantLocale(tenant.settings), { reason, tenantName: tenant.name, limit, billingUrl }),
      });
      await this.audit.log({ tenantId, action: "billing.quota_alert", metadata: { reason, limit } });
    } catch (error) {
      // Une alerte qui échoue ne doit jamais faire échouer l'inscription.
      this.logger.warn(`Alerte de quota non envoyée pour ${tenantId} : ${(error as Error).message}`);
    }
  }
}
