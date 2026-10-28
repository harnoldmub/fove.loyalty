import { Controller, Get, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe";
import { RequirePermission, Tenant } from "../common/decorators";
import type { TenantContext } from "../common/context";
import { PrismaService } from "../common/prisma.service";
import { TenantRoute } from "../auth/guards";
import { AnalyticsService } from "./analytics.service";

const periodSchema = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

@ApiTags("app")
@Controller("app")
@TenantRoute()
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get("analytics/overview")
  @RequirePermission("analytics.read")
  overview(@Tenant() ctx: TenantContext, @Query(new ZodPipe(periodSchema)) query: z.infer<typeof periodSchema>) {
    return this.analytics.overview(ctx, query.days);
  }

  @Get("audit")
  @RequirePermission("audit.read")
  audit(@Tenant() ctx: TenantContext) {
    return this.prisma.client.auditLog.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: "desc" }, take: 100 });
  }
}
