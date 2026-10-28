import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createTenantSchema, establishmentSchema, inviteMemberSchema, updateMemberSchema, updateTenantSchema } from "@fove/shared";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe";
import { Auth, RequirePermission, Tenant } from "../common/decorators";
import type { AuthState, TenantContext } from "../common/context";
import { TenantRoute, UserRoute } from "../auth/guards";
import { TenantsService } from "./tenants.service";
import { TeamService } from "./team.service";

const updateEstablishmentSchema = establishmentSchema.partial().extend({ active: z.boolean().optional() });
const memberStatusSchema = z.object({ status: z.enum(["ACTIVE", "DISABLED"]) });

@ApiTags("app")
@Controller("app")
export class TenantsController {
  constructor(
    private readonly tenants: TenantsService,
    private readonly team: TeamService,
  ) {}

  @Post("tenants")
  @UserRoute()
  create(@Auth() auth: AuthState, @Body(new ZodPipe(createTenantSchema)) body: z.infer<typeof createTenantSchema>) {
    return this.tenants.create(auth, body);
  }

  @Get("tenant")
  @TenantRoute()
  @RequirePermission("tenant.read")
  current(@Tenant() ctx: TenantContext) {
    return this.tenants.current(ctx);
  }

  @Patch("tenant")
  @TenantRoute()
  @RequirePermission("tenant.update")
  update(@Tenant() ctx: TenantContext, @Body(new ZodPipe(updateTenantSchema)) body: z.infer<typeof updateTenantSchema>) {
    return this.tenants.update(ctx, body);
  }

  @Post("tenant/onboarding/complete")
  @HttpCode(204)
  @TenantRoute()
  @RequirePermission("tenant.update")
  async complete(@Tenant() ctx: TenantContext) {
    await this.tenants.completeOnboarding(ctx);
  }

  @Get("establishments")
  @TenantRoute()
  @RequirePermission("establishments.read")
  establishments(@Tenant() ctx: TenantContext) {
    return this.tenants.listEstablishments(ctx);
  }

  @Post("establishments")
  @TenantRoute()
  @RequirePermission("establishments.write")
  createEstablishment(@Tenant() ctx: TenantContext, @Body(new ZodPipe(establishmentSchema)) body: z.infer<typeof establishmentSchema>) {
    return this.tenants.createEstablishment(ctx, body);
  }

  @Patch("establishments/:id")
  @TenantRoute()
  @RequirePermission("establishments.write")
  updateEstablishment(
    @Tenant() ctx: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateEstablishmentSchema)) body: z.infer<typeof updateEstablishmentSchema>,
  ) {
    return this.tenants.updateEstablishment(ctx, id, body);
  }

  @Get("team")
  @TenantRoute()
  @RequirePermission("members.read")
  teamList(@Tenant() ctx: TenantContext) {
    return this.team.list(ctx);
  }

  @Post("team/invitations")
  @TenantRoute()
  @RequirePermission("members.write")
  invite(@Tenant() ctx: TenantContext, @Body(new ZodPipe(inviteMemberSchema)) body: z.infer<typeof inviteMemberSchema>) {
    return this.team.invite(ctx, body);
  }

  @Delete("team/invitations/:id")
  @HttpCode(204)
  @TenantRoute()
  @RequirePermission("members.write")
  async revoke(@Tenant() ctx: TenantContext, @Param("id", ParseUUIDPipe) id: string) {
    await this.team.revokeInvitation(ctx, id);
  }

  @Patch("team/members/:id")
  @HttpCode(204)
  @TenantRoute()
  @RequirePermission("members.write")
  async updateMember(@Tenant() ctx: TenantContext, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(updateMemberSchema)) body: z.infer<typeof updateMemberSchema>) {
    await this.team.updateMember(ctx, id, body);
  }

  @Post("team/members/:id/status")
  @HttpCode(204)
  @TenantRoute()
  @RequirePermission("members.write")
  async setStatus(@Tenant() ctx: TenantContext, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(memberStatusSchema)) body: z.infer<typeof memberStatusSchema>) {
    await this.team.setStatus(ctx, id, body.status);
  }
}
