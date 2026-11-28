import { Controller, Get, Headers, HttpCode, Post } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { loadConfig } from "../config";
import { safeEqual } from "../common/crypto";
import { unauthorized } from "../common/errors";
import { PrismaService } from "../common/prisma.service";
import { WebhooksService } from "../notifications/webhooks.service";
import { LoyaltyService } from "../loyalty/loyalty.service";
import { BillingService } from "../billing/billing.service";
import { ClientAccountService } from "../client-account/client-account.service";
import { ReferralService } from "../referrals/referral.service";
import { PartnersService } from "../partners/partners.service";
import { OfflineBillingService } from "../billing/offline.service";
import { BillingEmailService } from "../billing/billing-emails.service";
import { TeamDigestService } from "../notifications/team-digest.service";
import { AutomationService } from "../automation/automation.service";

/**
 * Tâches périodiques déclenchées par un cron Railway (toutes les 5 minutes)
 * plutôt qu'un worker permanent.
 */
@ApiExcludeController()
@Controller()
@SkipThrottle()
export class JobsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly webhooks: WebhooksService,
    private readonly loyalty: LoyaltyService,
    private readonly billing: BillingService,
    private readonly clientAccounts: ClientAccountService,
    private readonly referrals: ReferralService,
    private readonly partners: PartnersService,
    private readonly offline: OfflineBillingService,
    private readonly billingEmails: BillingEmailService,
    private readonly teamDigest: TeamDigestService,
    private readonly automation: AutomationService,
  ) {}

  @Get("health")
  async health() {
    await this.prisma.client.$queryRaw`SELECT 1`;
    return { status: "ok", time: new Date().toISOString() };
  }

  @Post("jobs/run")
  @HttpCode(200)
  async run(@Headers("x-cron-secret") secret?: string) {
    if (!secret || !safeEqual(secret, loadConfig().CRON_SECRET)) throw unauthorized();
    const now = new Date();
    // Accès provisoires (virement) échus d'abord : email dédié, avant la fin de période générique.
    const offlineExpired = await this.offline.expireProvisional(now);
    const [webhooks, expired, subscriptions, clientAccounts, clientReminders, referrals, commissionsReleased] = [
      await this.webhooks.retryDue(),
      await this.loyalty.expireInactive(now),
      await this.billing.closeExpired(now),
      await this.clientAccounts.purgeInactive(now),
      await this.clientAccounts.sendConfirmationReminders(now),
      await this.referrals.processDue(now),
      // Commissions arrivées au bout du délai de validation : disponibles et converties (monnaie de versement).
      await this.partners.releaseDueCommissions(undefined, now),
    ];
    // Emails d'échéance au commerçant : renouvellement J-30/J-7, accès provisoire J-2, fin de grâce d'un impayé.
    const reminders = {
      renewals: await this.billingEmails.remindRenewals(now),
      provisional: await this.billingEmails.remindProvisional(now),
      graceEnded: await this.billingEmails.notifyGraceEnded(now),
    };
    // Versements mensuels des commissions partenaires (le 1er du mois, payés avant le 10).
    const payoutsScheduled = await this.partners.scheduleMonthlyPayouts(now);
    // Relances automatiques et anniversaire : une fois par jour et par commerce, à son heure locale (10 h – 19 h).
    const automations = await this.automation.runDue(now);
    // Récapitulatif quotidien des actions à mener par l'équipe FOVE (une fois par jour, à partir de 6 h UTC).
    const teamDigest = await this.teamDigest.sendDaily(now);
    const db = this.prisma.client;
    const cleanup = await db.$transaction([
      db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
      // Codes de connexion gardés 24 h (limites par email et par adresse IP).
      db.userLoginCode.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 86_400_000) } } }),
      db.idempotencyRecord.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 86_400_000) } } }),
      db.otpChallenge.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 86_400_000) } } }),
      db.clientSession.deleteMany({ where: { expiresAt: { lt: now } } }),
      // Gardés 24 h : ils servent à limiter le nombre de demandes par email et par adresse IP.
      db.clientLoginCode.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 86_400_000) } } }),
    ]);
    return { webhooksRetried: webhooks, accountsExpired: expired, subscriptions, clientAccounts, clientReminders, referrals, commissionsReleased, offlineExpired, reminders, payoutsScheduled, teamDigest, automations, cleaned: cleanup.map((c) => c.count) };
  }
}
