import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { customerSchema, importCustomersSchema, paginationSchema, updateCustomerSchema } from "@fove/shared";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe";
import { RequirePermission, Tenant } from "../common/decorators";
import type { TenantContext } from "../common/context";
import { TenantRoute } from "../auth/guards";
import { PlanService } from "../billing/plan.service";
import { CustomersService } from "./customers.service";
import { cardUrl } from "../loyalty/loyalty.service";

const createWithProgram = customerSchema.and(z.object({ programId: z.uuid().nullable().default(null) }));

@ApiTags("app")
@Controller("app/customers")
@TenantRoute()
export class CustomersController {
  constructor(
    private readonly customers: CustomersService,
    private readonly plans: PlanService,
  ) {}

  @Get()
  @RequirePermission("customers.read")
  list(@Tenant() ctx: TenantContext, @Query(new ZodPipe(paginationSchema)) query: z.infer<typeof paginationSchema>) {
    return this.customers.search(ctx, query);
  }

  @Post()
  @RequirePermission("customers.write")
  create(@Tenant() ctx: TenantContext, @Body(new ZodPipe(createWithProgram)) body: z.infer<typeof createWithProgram>) {
    return this.customers.create(ctx, body, "DASHBOARD").then(({ customer, card }) => ({
      customer,
      cardUrl: card ? cardUrl(card.accessToken) : null,
    }));
  }

  @Post("import")
  @RequirePermission("customers.import")
  import(@Tenant() ctx: TenantContext, @Body(new ZodPipe(importCustomersSchema)) body: z.infer<typeof importCustomersSchema>) {
    return this.customers.import(ctx, body);
  }

  @Get(":id")
  @RequirePermission("customers.read")
  get(@Tenant() ctx: TenantContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.customers.get(ctx, id);
  }

  @Patch(":id")
  @RequirePermission("customers.write")
  update(@Tenant() ctx: TenantContext, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(updateCustomerSchema)) body: z.infer<typeof updateCustomerSchema>) {
    return this.customers.update(ctx, id, body);
  }

  @Get(":id/export")
  @RequirePermission("customers.export")
  async export(@Tenant() ctx: TenantContext, @Param("id", ParseUUIDPipe) id: string) {
    await this.plans.assertFeature(ctx.tenantId, "exports");
    return this.customers.exportData(ctx, id);
  }

  @Post(":id/anonymize")
  @HttpCode(204)
  @RequirePermission("customers.delete")
  async anonymize(@Tenant() ctx: TenantContext, @Param("id", ParseUUIDPipe) id: string) {
    await this.customers.anonymize(ctx, id);
  }
}
