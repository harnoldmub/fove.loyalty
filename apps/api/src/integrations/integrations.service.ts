import { Injectable } from "@nestjs/common";
import { createApiKeySchema, webhookEndpointSchema, WEBHOOK_EVENTS } from "@fove/shared";
import type { IntegrationProvider } from "@fove/database";
import type { z } from "zod";
import { loadConfig } from "../config";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";
import { encrypt, randomToken, sha256 } from "../common/crypto";
import { badRequest, notFound } from "../common/errors";
import { actorUserId, type TenantContext } from "../common/context";
import { PlanService } from "../billing/plan.service";
import { WebhooksService } from "../notifications/webhooks.service";

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly plans: PlanService,
    private readonly webhooks: WebhooksService,
  ) {}

  // --- Clés API --------------------------------------------------------------

  listKeys(ctx: TenantContext) {
    return this.prisma.client.apiCredential.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, kind: true, environment: true, prefix: true, scopes: true, allowedOrigins: true, lastUsedAt: true, revokedAt: true, createdAt: true },
    });
  }

  /** La clé complète n'est renvoyée qu'une fois ; seule son empreinte est stockée. */
  async createKey(ctx: TenantContext, input: z.infer<typeof createApiKeySchema>) {
    await this.plans.assertFeature(ctx.tenantId, input.kind === "SECRET" ? "api" : "widget");
    if (input.kind === "PUBLISHABLE" && input.scopes.length > 0) throw badRequest("invalid_scopes", "Une clé publique n'a aucun scope");
    if (input.kind === "SECRET" && input.scopes.length === 0) throw badRequest("invalid_scopes", "Choisissez au moins un scope");
    if (input.kind === "PUBLISHABLE" && input.environment === "LIVE" && input.allowedOrigins.length === 0) {
      throw badRequest("origins_required", "Indiquez les domaines autorisés du widget");
    }
    const env = input.environment === "LIVE" ? "live" : "test";
    const prefix = input.kind === "SECRET" ? `fove_sk_${env}_` : `fove_pk_${env}_`;
    const key = randomToken(prefix, 24);
    const credential = await this.prisma.client.apiCredential.create({
      data: {
        tenantId: ctx.tenantId,
        name: input.name,
        kind: input.kind,
        environment: input.environment,
        prefix: key.slice(0, prefix.length + 4),
        keyHash: sha256(key),
        scopes: input.scopes,
        allowedOrigins: input.allowedOrigins.map((o) => new URL(o).origin),
        createdById: actorUserId(ctx),
      },
    });
    await this.audit.forTenant(ctx, "api_key.created", { type: "api_key", id: credential.id }, { kind: input.kind, scopes: input.scopes });
    return { id: credential.id, key };
  }

  async revokeKey(ctx: TenantContext, id: string) {
    const { count } = await this.prisma.client.apiCredential.updateMany({
      where: { id, tenantId: ctx.tenantId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) throw notFound("Clé API");
    await this.audit.forTenant(ctx, "api_key.revoked", { type: "api_key", id });
  }

  // --- Webhooks --------------------------------------------------------------

  listWebhooks(ctx: TenantContext) {
    return this.prisma.client.webhookEndpoint.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: "desc" },
      select: { id: true, url: true, events: true, active: true, createdAt: true },
    });
  }

  async createWebhook(ctx: TenantContext, input: z.infer<typeof webhookEndpointSchema>) {
    await this.plans.assertFeature(ctx.tenantId, "api");
    const unknown = input.events.filter((e) => !(WEBHOOK_EVENTS as readonly string[]).includes(e));
    if (unknown.length) throw badRequest("invalid_events", `Événements inconnus : ${unknown.join(", ")}`);
    if (loadConfig().isProd && !input.url.startsWith("https://")) throw badRequest("https_required", "HTTPS requis");
    const secret = randomToken("whsec_", 24);
    const endpoint = await this.prisma.client.webhookEndpoint.create({
      data: { tenantId: ctx.tenantId, url: input.url, events: input.events, secretEncrypted: encrypt(secret, loadConfig().APP_ENCRYPTION_KEY) },
    });
    await this.audit.forTenant(ctx, "webhook.created", { type: "webhook", id: endpoint.id });
    return { id: endpoint.id, secret };
  }

  async deleteWebhook(ctx: TenantContext, id: string) {
    const { count } = await this.prisma.client.webhookEndpoint.updateMany({ where: { id, tenantId: ctx.tenantId }, data: { active: false } });
    if (count === 0) throw notFound("Webhook");
    await this.audit.forTenant(ctx, "webhook.disabled", { type: "webhook", id });
  }

  listDeliveries(ctx: TenantContext) {
    return this.prisma.client.webhookDelivery.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, event: true, status: true, attempts: true, lastStatusCode: true, lastError: true, createdAt: true, deliveredAt: true, endpointId: true },
    });
  }

  // --- Connexions (Match Kwata…) ---------------------------------------------

  listConnections(ctx: TenantContext) {
    return this.prisma.client.integrationConnection.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: "asc" },
      include: { syncLogs: { orderBy: { createdAt: "desc" }, take: 20 } },
    });
  }

  async createConnection(ctx: TenantContext, input: { provider: IntegrationProvider; name: string; programId: string }) {
    await this.plans.assertFeature(ctx.tenantId, "integrations");
    const program = await this.prisma.client.loyaltyProgram.findFirst({ where: { id: input.programId, tenantId: ctx.tenantId } });
    if (!program) throw notFound("Programme");
    const connection = await this.prisma.client.integrationConnection.create({
      data: { tenantId: ctx.tenantId, provider: input.provider, name: input.name, programId: program.id },
    });
    await this.audit.forTenant(ctx, "integration.created", { type: "integration", id: connection.id }, { provider: input.provider });
    return connection;
  }
}
