import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createApiKeySchema, webhookEndpointSchema } from "@fove/shared";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe";
import { RequirePermission, RequireVerified, Tenant } from "../common/decorators";
import type { TenantContext } from "../common/context";
import { TenantRoute } from "../auth/guards";
import { IntegrationsService } from "./integrations.service";

const connectionSchema = z.object({ provider: z.enum(["MATCH_KWATA", "CUSTOM"]), name: z.string().trim().min(2).max(60), programId: z.uuid() });

@ApiTags("app")
@Controller("app/integrations")
@TenantRoute()
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get("keys")
  @RequirePermission("integrations.read")
  keys(@Tenant() ctx: TenantContext) {
    return this.integrations.listKeys(ctx);
  }

  @Post("keys")
  @RequireVerified()
  @RequirePermission("integrations.write")
  createKey(@Tenant() ctx: TenantContext, @Body(new ZodPipe(createApiKeySchema)) body: z.infer<typeof createApiKeySchema>) {
    return this.integrations.createKey(ctx, body);
  }

  @Delete("keys/:id")
  @HttpCode(204)
  @RequirePermission("integrations.write")
  async revokeKey(@Tenant() ctx: TenantContext, @Param("id", ParseUUIDPipe) id: string) {
    await this.integrations.revokeKey(ctx, id);
  }

  @Get("webhooks")
  @RequirePermission("integrations.read")
  webhooks(@Tenant() ctx: TenantContext) {
    return this.integrations.listWebhooks(ctx);
  }

  @Post("webhooks")
  @RequireVerified()
  @RequirePermission("integrations.write")
  createWebhook(@Tenant() ctx: TenantContext, @Body(new ZodPipe(webhookEndpointSchema)) body: z.infer<typeof webhookEndpointSchema>) {
    return this.integrations.createWebhook(ctx, body);
  }

  @Delete("webhooks/:id")
  @HttpCode(204)
  @RequirePermission("integrations.write")
  async deleteWebhook(@Tenant() ctx: TenantContext, @Param("id", ParseUUIDPipe) id: string) {
    await this.integrations.deleteWebhook(ctx, id);
  }

  @Get("deliveries")
  @RequirePermission("integrations.read")
  deliveries(@Tenant() ctx: TenantContext) {
    return this.integrations.listDeliveries(ctx);
  }

  @Get("connections")
  @RequirePermission("integrations.read")
  connections(@Tenant() ctx: TenantContext) {
    return this.integrations.listConnections(ctx);
  }

  @Post("connections")
  @RequirePermission("integrations.write")
  createConnection(@Tenant() ctx: TenantContext, @Body(new ZodPipe(connectionSchema)) body: z.infer<typeof connectionSchema>) {
    return this.integrations.createConnection(ctx, body);
  }
}
