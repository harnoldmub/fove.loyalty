import { Body, Controller, Get, Put } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe";
import { RequirePermission, Tenant } from "../common/decorators";
import type { TenantContext } from "../common/context";
import { TenantRoute } from "../auth/guards";
import { CustomerReferralService } from "./customer-referral.service";

const n = (max: number) => z.int().min(0).max(max);
const settingsSchema = z.object({
  enabled: z.boolean(),
  referrerStamps: n(50),
  referrerPoints: n(100_000),
  refereeStamps: n(50),
  refereePoints: n(100_000),
  monthlyCap: z.int().min(1).max(100),
});

/** Parrainage entre clients : réglages et suivi (docs/chantier-parrainage-clients.md). */
@ApiTags("app")
@Controller("app/customer-referrals")
export class CustomerReferralController {
  constructor(private readonly referrals: CustomerReferralService) {}

  @Get()
  @TenantRoute()
  @RequirePermission("programs.read")
  async overview(@Tenant() ctx: TenantContext) {
    const [settings, stats] = await Promise.all([this.referrals.settings(ctx.tenantId), this.referrals.stats(ctx.tenantId)]);
    return { settings, stats };
  }

  @Put("settings")
  @TenantRoute()
  @RequirePermission("programs.write")
  update(@Tenant() ctx: TenantContext, @Body(new ZodPipe(settingsSchema)) body: z.infer<typeof settingsSchema>) {
    return this.referrals.updateSettings(ctx, body);
  }
}
