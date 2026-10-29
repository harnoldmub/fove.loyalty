import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import {
  adjustSchema,
  earnSchema,
  enrollAccountSchema,
  paginationSchema,
  programSchema,
  redeemSchema,
  reverseSchema,
  rewardSchema,
  updateProgramSchema,
  updateRewardSchema,
} from "@fove/shared";
import { z } from "zod";
import { loadConfig } from "../config";
import { ZodPipe } from "../common/zod.pipe";
import { RequirePermission, Tenant } from "../common/decorators";
import type { TenantContext } from "../common/context";
import { notFound } from "../common/errors";
import { PrismaService } from "../common/prisma.service";
import { TenantRoute } from "../auth/guards";
import { RewardsService } from "../rewards/rewards.service";
import { enrollmentQrSvg } from "../public/public.service";
import { LoyaltyService } from "./loyalty.service";
import { CardsService } from "../cards/cards.service";

const transactionsQuery = paginationSchema.extend({
  accountId: z.uuid().optional(),
  kind: z.enum(["EARN", "ADJUSTMENT", "REDEMPTION", "REDEMPTION_REVERSAL", "REVERSAL", "REFUND", "EXPIRATION"]).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
const previewSchema = z.object({ accountId: z.uuid(), amount: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/).nullable().default(null) });
const lookupSchema = z.object({ code: z.string().trim().min(4).max(80) });
const accountStatusSchema = z.object({ status: z.enum(["ACTIVE", "BLOCKED"]) });
const cancelSchema = z.object({ reason: z.string().trim().min(3).max(300) });
const linkSchema = z.object({ programId: z.uuid(), establishmentId: z.uuid().nullable().default(null) });
const shareSchema = z.object({ renew: z.boolean().default(false) });
const walletMessageSchema = z.object({ title: z.string().trim().min(2).max(60), body: z.string().trim().min(2).max(180) });

@ApiTags("app")
@Controller("app")
@TenantRoute()
export class LoyaltyController {
  constructor(
    private readonly loyalty: LoyaltyService,
    private readonly rewards: RewardsService,
    private readonly prisma: PrismaService,
    private readonly cards: CardsService,
  ) {}

  // Programmes
  @Get("programs")
  @RequirePermission("programs.read")
  programs(@Tenant() ctx: TenantContext) {
    return this.loyalty.listPrograms(ctx);
  }

  @Post("programs")
  @RequirePermission("programs.write")
  createProgram(@Tenant() ctx: TenantContext, @Body(new ZodPipe(programSchema)) body: z.infer<typeof programSchema>) {
    return this.loyalty.createProgram(ctx, body);
  }

  @Get("programs/:id")
  @RequirePermission("programs.read")
  program(@Tenant() ctx: TenantContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.loyalty.getProgram(ctx, id);
  }

  @Patch("programs/:id")
  @RequirePermission("programs.write")
  updateProgram(@Tenant() ctx: TenantContext, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(updateProgramSchema)) body: z.infer<typeof updateProgramSchema>) {
    return this.loyalty.updateProgram(ctx, id, body);
  }

  // QR d'inscription
  @Get("enrollment-links")
  @RequirePermission("programs.read")
  async links(@Tenant() ctx: TenantContext) {
    const links = await this.prisma.client.enrollmentLink.findMany({
      where: { tenantId: ctx.tenantId },
      include: { program: { select: { name: true } }, establishment: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });
    return links.map((l) => ({ ...l, url: `${loadConfig().APP_URL}/join/${l.token}` }));
  }

  @Post("enrollment-links")
  @RequirePermission("programs.write")
  async createLink(@Tenant() ctx: TenantContext, @Body(new ZodPipe(linkSchema)) body: z.infer<typeof linkSchema>) {
    const program = await this.loyalty.getProgram(ctx, body.programId);
    if (body.establishmentId) {
      const est = await this.prisma.client.establishment.findFirst({ where: { id: body.establishmentId, tenantId: ctx.tenantId } });
      if (!est) throw notFound("Établissement");
    }
    return this.prisma.client.enrollmentLink.create({
      data: { tenantId: ctx.tenantId, programId: program.id, establishmentId: body.establishmentId, token: crypto.randomUUID().replaceAll("-", "").slice(0, 16) },
    });
  }

  @Post("enrollment-links/:id/toggle")
  @HttpCode(204)
  @RequirePermission("programs.write")
  async toggleLink(@Tenant() ctx: TenantContext, @Param("id", ParseUUIDPipe) id: string) {
    const link = await this.prisma.client.enrollmentLink.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!link) throw notFound("QR d'inscription");
    await this.prisma.client.enrollmentLink.update({ where: { id }, data: { active: !link.active } });
  }

  @Get("enrollment-links/:id/qr.svg")
  @RequirePermission("programs.read")
  async linkQr(@Tenant() ctx: TenantContext, @Param("id", ParseUUIDPipe) id: string, @Res() res: Response) {
    const link = await this.prisma.client.enrollmentLink.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!link) throw notFound("QR d'inscription");
    res.type("image/svg+xml").send(await enrollmentQrSvg(`${loadConfig().APP_URL}/join/${link.token}`));
  }

  // Cartes
  @Post("accounts")
  @RequirePermission("customers.write")
  enroll(@Tenant() ctx: TenantContext, @Body(new ZodPipe(enrollAccountSchema)) body: z.infer<typeof enrollAccountSchema>) {
    return this.loyalty.enroll(ctx, body.customerId, body.programId);
  }

  @Get("accounts/:id")
  @RequirePermission("customers.read")
  account(@Tenant() ctx: TenantContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.loyalty.getAccount(ctx, id);
  }

  /** Lien de la carte et message WhatsApp ; `renew` révoque l'ancien lien. */
  @Post("accounts/:id/share")
  @HttpCode(200)
  @RequirePermission("customers.write")
  share(@Tenant() ctx: TenantContext, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(shareSchema)) body: z.infer<typeof shareSchema>) {
    return this.cards.share(ctx, id, body.renew);
  }

  @Post("accounts/:id/wallet-message")
  @HttpCode(204)
  @RequirePermission("programs.write")
  async walletMessage(@Tenant() ctx: TenantContext, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(walletMessageSchema)) body: z.infer<typeof walletMessageSchema>) {
    await this.cards.walletMessage(ctx, id, body);
  }

  /** Notification à toutes les cartes Google Wallet du programme (envoi groupé, confirmé côté interface). */
  @Post("programs/:id/wallet-broadcast")
  @HttpCode(204)
  @RequirePermission("programs.write")
  async walletBroadcast(@Tenant() ctx: TenantContext, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(walletMessageSchema)) body: z.infer<typeof walletMessageSchema>) {
    await this.cards.walletBroadcast(ctx, id, body);
  }

  @Get("wallet/status")
  @RequirePermission("programs.read")
  walletStatus() {
    return { googleWallet: this.cards.wallet.isConfigured() };
  }

  @Post("accounts/:id/status")
  @HttpCode(204)
  @RequirePermission("customers.write")
  async status(@Tenant() ctx: TenantContext, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(accountStatusSchema)) body: z.infer<typeof accountStatusSchema>) {
    await this.loyalty.setAccountStatus(ctx, id, body.status);
  }

  // Scanner
  @Post("scanner/lookup")
  @HttpCode(200)
  @RequirePermission("customers.read")
  lookup(@Tenant() ctx: TenantContext, @Body(new ZodPipe(lookupSchema)) body: z.infer<typeof lookupSchema>) {
    return this.loyalty.lookup(ctx, body.code);
  }

  @Post("scanner/preview")
  @HttpCode(200)
  @RequirePermission("transactions.create")
  preview(@Tenant() ctx: TenantContext, @Body(new ZodPipe(previewSchema)) body: z.infer<typeof previewSchema>) {
    return this.loyalty.previewEarn(ctx, body.accountId, body.amount);
  }

  // Opérations
  @Get("transactions")
  @RequirePermission("transactions.read")
  transactions(@Tenant() ctx: TenantContext, @Query(new ZodPipe(transactionsQuery)) query: z.infer<typeof transactionsQuery>) {
    return this.loyalty.listTransactions(ctx, query);
  }

  @Post("transactions/earn")
  @RequirePermission("transactions.create")
  earn(@Tenant() ctx: TenantContext, @Body(new ZodPipe(earnSchema)) body: z.infer<typeof earnSchema>) {
    return this.loyalty.earn(ctx, body, "SCANNER");
  }

  @Post("transactions/adjust")
  @RequirePermission("transactions.reverse")
  adjust(@Tenant() ctx: TenantContext, @Body(new ZodPipe(adjustSchema)) body: z.infer<typeof adjustSchema>) {
    return this.loyalty.adjust(ctx, body);
  }

  @Post("transactions/:id/reverse")
  @RequirePermission("transactions.reverse")
  reverse(@Tenant() ctx: TenantContext, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(reverseSchema)) body: z.infer<typeof reverseSchema>) {
    return this.loyalty.reverse(ctx, id, body.reason, body.idempotencyKey);
  }

  // Récompenses
  @Get("rewards")
  @RequirePermission("rewards.read")
  rewardList(@Tenant() ctx: TenantContext, @Query("programId") programId?: string) {
    return this.rewards.list(ctx, programId && /^[0-9a-f-]{36}$/.test(programId) ? programId : undefined);
  }

  @Post("rewards")
  @RequirePermission("rewards.write")
  createReward(@Tenant() ctx: TenantContext, @Body(new ZodPipe(rewardSchema)) body: z.infer<typeof rewardSchema>) {
    return this.rewards.create(ctx, body);
  }

  @Patch("rewards/:id")
  @RequirePermission("rewards.write")
  updateReward(@Tenant() ctx: TenantContext, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(updateRewardSchema)) body: z.infer<typeof updateRewardSchema>) {
    return this.rewards.update(ctx, id, body);
  }

  @Post("rewards/:id/archive")
  @HttpCode(204)
  @RequirePermission("rewards.write")
  async archive(@Tenant() ctx: TenantContext, @Param("id", ParseUUIDPipe) id: string) {
    await this.rewards.archive(ctx, id);
  }

  @Get("redemptions")
  @RequirePermission("transactions.read")
  redemptions(@Tenant() ctx: TenantContext, @Query(new ZodPipe(paginationSchema.extend({ accountId: z.uuid().optional() }))) query: z.infer<typeof paginationSchema> & { accountId?: string }) {
    return this.rewards.listRedemptions(ctx, query);
  }

  @Post("redemptions")
  @RequirePermission("redemptions.create")
  redeem(@Tenant() ctx: TenantContext, @Body(new ZodPipe(redeemSchema)) body: z.infer<typeof redeemSchema>) {
    return this.rewards.redeem(ctx, body, "SCANNER");
  }

  @Post("redemptions/:id/cancel")
  @RequirePermission("redemptions.cancel")
  cancel(@Tenant() ctx: TenantContext, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(cancelSchema)) body: z.infer<typeof cancelSchema>) {
    return this.rewards.cancel(ctx, id, body.reason);
  }
}
