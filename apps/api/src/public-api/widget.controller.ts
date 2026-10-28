import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { loadConfig } from "../config";
import { Tenant } from "../common/decorators";
import type { TenantContext } from "../common/context";
import { PrismaService } from "../common/prisma.service";
import { PublishableKeyGuard } from "../auth/guards";
import { PlanService } from "../billing/plan.service";

/** Configuration publique du widget. Lecture seule, domaines autorisés uniquement. */
@ApiTags("widget")
@Controller("widget")
@UseGuards(PublishableKeyGuard)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class WidgetController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlanService,
  ) {}

  @Get("config")
  async config(@Tenant() ctx: TenantContext) {
    await this.plans.assertFeature(ctx.tenantId, "widget");
    const tenant = await this.prisma.client.tenant.findUniqueOrThrow({
      where: { id: ctx.tenantId },
      include: {
        settings: true,
        enrollmentLinks: { where: { active: true, establishmentId: null, program: { active: true } }, include: { program: true }, orderBy: { createdAt: "asc" } },
      },
    });
    const appUrl = loadConfig().APP_URL;
    return {
      tenant: { name: tenant.name, logoUrl: tenant.settings?.logoUrl ?? null, primaryColor: tenant.settings?.primaryColor ?? "#1F4FFF" },
      programs: tenant.enrollmentLinks.map((l) => ({ name: l.program.name, mode: l.program.mode, joinUrl: `${appUrl}/join/${l.token}` })),
      cardUrlPattern: `${appUrl}/card/`,
    };
  }
}
