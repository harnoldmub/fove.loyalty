import { Body, Controller, Get, Headers, HttpCode, Post, Req } from "@nestjs/common";
import { ApiExcludeEndpoint, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import type { Request } from "express";
import { checkoutSchema } from "@fove/shared";
import type { z } from "zod";
import { ZodPipe } from "../common/zod.pipe";
import { RequirePermission, RequireVerified, Tenant } from "../common/decorators";
import type { TenantContext } from "../common/context";
import { TenantRoute } from "../auth/guards";
import { BillingService } from "./billing.service";

@ApiTags("billing")
@Controller()
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get("plans")
  plans() {
    return this.billing.listPlans();
  }

  @Get("app/billing")
  @TenantRoute()
  @RequirePermission("billing.read")
  overview(@Tenant() ctx: TenantContext) {
    return this.billing.overview(ctx);
  }

  @Post("app/billing/checkout")
  @TenantRoute()
  @RequireVerified()
  @RequirePermission("billing.write")
  checkout(@Tenant() ctx: TenantContext, @Body(new ZodPipe(checkoutSchema)) body: z.infer<typeof checkoutSchema>) {
    return this.billing.checkout(ctx, body.planCode, body.interval);
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

  @Post("billing/stripe/webhook")
  @HttpCode(200)
  @SkipThrottle()
  @ApiExcludeEndpoint()
  webhook(@Req() req: Request & { rawBody?: Buffer }, @Headers("stripe-signature") signature?: string) {
    return this.billing.handleWebhook(req.rawBody, signature);
  }
}
