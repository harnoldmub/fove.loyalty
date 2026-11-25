import { Body, Controller, Get, Headers, HttpCode, Post, Req } from "@nestjs/common";
import { ApiExcludeEndpoint, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import type { Request } from "express";
import { billingCurrencySchema, checkoutSchema } from "@fove/shared";
import { z } from "zod";
import { badRequest } from "../common/errors";
import { OfflineBillingService } from "./offline.service";

const offlineRequestSchema = z.object({ planCode: z.string().min(2).max(40) });
import { ZodPipe } from "../common/zod.pipe";
import { RequirePermission, Tenant } from "../common/decorators";
import type { TenantContext } from "../common/context";
import { TenantRoute } from "../auth/guards";
import { BillingService } from "./billing.service";
import { ReferralService } from "../referrals/referral.service";
import { loadConfig } from "../config";

@ApiTags("billing")
@Controller()
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly referralService: ReferralService,
    private readonly offline: OfflineBillingService,
  ) {}

  @Get("plans")
  plans() {
    return this.billing.listPlans();
  }

  /** Page « Parrainage » : lien, gains, plafond de l'année, filleuls, remise reçue en tant que filleul. */
  @Get("app/referrals")
  @TenantRoute()
  @RequirePermission("billing.read")
  referrals(@Tenant() ctx: TenantContext) {
    return this.referralService.summary(ctx.tenantId, loadConfig().APP_URL);
  }

  @Get("app/billing")
  @TenantRoute()
  @RequirePermission("billing.read")
  overview(@Tenant() ctx: TenantContext) {
    return this.billing.overview(ctx);
  }

  /** Ouvert avant la confirmation de l'email : on ne perd pas une vente ; l'email est relancé ensuite. */
  @Post("app/billing/checkout")
  @TenantRoute()
  @RequirePermission("billing.write")
  checkout(@Tenant() ctx: TenantContext, @Body(new ZodPipe(checkoutSchema)) body: z.infer<typeof checkoutSchema>) {
    return this.billing.checkout(ctx, body.planCode, body.interval);
  }

  /** Règlement hors ligne : facture avec référence de paiement (et accès provisoire de 7 jours). */
  @Post("app/billing/offline")
  @TenantRoute()
  @RequirePermission("billing.write")
  async offlineRequest(@Tenant() ctx: TenantContext, @Body(new ZodPipe(offlineRequestSchema)) body: z.infer<typeof offlineRequestSchema>) {
    const settings = await this.offline.bankAccounts((await this.billing.tenantCountry(ctx.tenantId)) ?? null);
    if (!settings.length) throw badRequest("offline_unavailable", "Le règlement hors ligne n’est pas proposé dans votre pays.");
    const { invoice } = await this.offline.request(ctx.tenantId, body.planCode, { actorUserId: ctx.actor.type === "user" ? ctx.actor.userId : undefined });
    return { reference: invoice.paymentReference, amountCents: invoice.amountDueCents, currency: invoice.currency };
  }

  @Post("app/billing/offline/cancel")
  @HttpCode(204)
  @TenantRoute()
  @RequirePermission("billing.write")
  async offlineCancel(@Tenant() ctx: TenantContext) {
    await this.offline.cancelRequest(ctx);
  }

  /** Monnaie de facturation : tout de suite sans abonnement payant en cours, sinon au renouvellement. */
  @Post("app/billing/currency")
  @TenantRoute()
  @RequirePermission("billing.write")
  setCurrency(@Tenant() ctx: TenantContext, @Body(new ZodPipe(billingCurrencySchema)) body: z.infer<typeof billingCurrencySchema>) {
    return this.billing.setCurrency(ctx, body.currency);
  }

  @Post("app/billing/portal")
  @TenantRoute()
  @RequirePermission("billing.write")
  portal(@Tenant() ctx: TenantContext) {
    return this.billing.portal(ctx);
  }

  @Post("app/billing/cancel")
  @HttpCode(204)
  @TenantRoute()
  @RequirePermission("billing.write")
  async cancel(@Tenant() ctx: TenantContext) {
    await this.billing.cancel(ctx);
  }

  @Post("app/billing/resume")
  @HttpCode(204)
  @TenantRoute()
  @RequirePermission("billing.write")
  async resume(@Tenant() ctx: TenantContext) {
    await this.billing.resume(ctx);
  }

  /** Annule le passage à une offre inférieure programmé au renouvellement. */
  @Post("app/billing/scheduled-change/cancel")
  @HttpCode(204)
  @TenantRoute()
  @RequirePermission("billing.write")
  async cancelScheduledChange(@Tenant() ctx: TenantContext) {
    await this.billing.cancelScheduledChange(ctx);
  }


  @Post("billing/stripe/webhook")
  @HttpCode(200)
  @SkipThrottle()
  @ApiExcludeEndpoint()
  webhook(@Req() req: Request & { rawBody?: Buffer }, @Headers("stripe-signature") signature?: string) {
    return this.billing.handleWebhook(req.rawBody, signature);
  }
}
