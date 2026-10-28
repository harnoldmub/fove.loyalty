import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe";
import { Auth } from "../common/decorators";
import type { AuthState } from "../common/context";
import { SuperAdminRoute, UserRoute } from "../auth/guards";
import { AdminService, supportAccessSchema, updatePlanSchema } from "./admin.service";

const statusSchema = z.object({ status: z.enum(["ACTIVE", "SUSPENDED"]), reason: z.string().trim().min(5).max(300) });
const subscriptionSchema = z.object({ planCode: z.string().min(2).max(40), status: z.enum(["TRIALING", "ACTIVE", "CANCELED"]), trialDays: z.int().min(1).max(365).optional() });

@ApiTags("admin")
@Controller("admin")
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get("stats")
  @SuperAdminRoute()
  stats() {
    return this.admin.stats();
  }

  @Get("tenants")
  @SuperAdminRoute()
  tenants(@Query("q") q?: string) {
    return this.admin.listTenants(q?.slice(0, 80));
  }

  @Get("tenants/:id")
  @SuperAdminRoute()
  tenant(@Param("id", ParseUUIDPipe) id: string) {
    return this.admin.tenant(id);
  }

  @Post("tenants/:id/status")
  @HttpCode(204)
  @SuperAdminRoute()
  async status(@Auth() auth: AuthState, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(statusSchema)) body: z.infer<typeof statusSchema>) {
    await this.admin.setStatus(auth, id, body.status, body.reason);
  }

  @Post("tenants/:id/subscription")
  @HttpCode(204)
  @SuperAdminRoute()
  async subscription(@Auth() auth: AuthState, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(subscriptionSchema)) body: z.infer<typeof subscriptionSchema>) {
    await this.admin.setSubscription(auth, id, body.planCode, body.status, body.trialDays);
  }

  @Post("tenants/:id/support")
  @SuperAdminRoute()
  support(@Auth() auth: AuthState, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(supportAccessSchema)) body: z.infer<typeof supportAccessSchema>) {
    return this.admin.startSupport(auth, id, body);
  }

  /** Accessible à la session support elle-même (pas de garde super admin supplémentaire). */
  @Post("support/end")
  @HttpCode(204)
  @UserRoute()
  async endSupport(@Auth() auth: AuthState) {
    await this.admin.endSupport(auth);
  }

  @Get("plans")
  @SuperAdminRoute()
  plans() {
    return this.admin.listPlans();
  }

  @Patch("plans/:id")
  @SuperAdminRoute()
  updatePlan(@Auth() auth: AuthState, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(updatePlanSchema)) body: z.infer<typeof updatePlanSchema>) {
    return this.admin.updatePlan(auth, id, body);
  }

  @Get("integrations")
  @SuperAdminRoute()
  integrations() {
    return this.admin.integrations();
  }

  @Get("errors")
  @SuperAdminRoute()
  errors() {
    return this.admin.errors();
  }
}
