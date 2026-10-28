import { Controller, Get, Headers, HttpCode, Post } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { loadConfig } from "../config";
import { safeEqual } from "../common/crypto";
import { unauthorized } from "../common/errors";
import { PrismaService } from "../common/prisma.service";
import { WebhooksService } from "../notifications/webhooks.service";
import { LoyaltyService } from "../loyalty/loyalty.service";

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
    const [webhooks, expired] = [await this.webhooks.retryDue(), await this.loyalty.expireInactive(now)];
    const db = this.prisma.client;
    const cleanup = await db.$transaction([
      db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
      db.authToken.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 7 * 86_400_000) } } }),
      db.idempotencyRecord.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 86_400_000) } } }),
      db.otpChallenge.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 86_400_000) } } }),
    ]);
    return { webhooksRetried: webhooks, accountsExpired: expired, cleaned: cleanup.map((c) => c.count) };
  }
}
