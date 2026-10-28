import { Injectable, Logger } from "@nestjs/common";
import { SIGNATURE_HEADER, type WebhookEvent } from "@fove/shared";
import type { Prisma } from "@fove/database";
import { loadConfig } from "../config";
import { decrypt, hmacSha256 } from "../common/crypto";
import { PrismaService } from "../common/prisma.service";

const MAX_ATTEMPTS = 8;
/** Délais avant nouvelle tentative (minutes) : 1, 5, 15, 60, 180, 360, 720. */
const BACKOFF_MINUTES = [1, 5, 15, 60, 180, 360, 720];

/**
 * Webhooks sortants signés. Pas de worker permanent : la première tentative
 * part juste après l'événement, les suivantes sont reprises par la tâche
 * planifiée `POST /api/jobs/run` (cron Railway).
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger("Webhooks");

  constructor(private readonly prisma: PrismaService) {}

  async emit(tenantId: string, event: WebhookEvent, data: Prisma.InputJsonValue): Promise<void> {
    const endpoints = await this.prisma.client.webhookEndpoint.findMany({
      where: { tenantId, active: true, events: { has: event } },
    });
    if (endpoints.length === 0) return;
    const payload = { id: crypto.randomUUID(), type: event, createdAt: new Date().toISOString(), data };
    const deliveries = await Promise.all(
      endpoints.map((endpoint) =>
        this.prisma.client.webhookDelivery.create({ data: { tenantId, endpointId: endpoint.id, event, payload } }),
      ),
    );
    if (loadConfig().NODE_ENV === "test") return;
    for (const delivery of deliveries) void this.attempt(delivery.id).catch(() => undefined);
  }

  sign(secret: string, body: string, timestamp = Math.floor(Date.now() / 1000)): string {
    return `t=${timestamp},v1=${hmacSha256(secret, `${timestamp}.${body}`)}`;
  }

  async attempt(deliveryId: string): Promise<void> {
    const delivery = await this.prisma.client.webhookDelivery.findUnique({ where: { id: deliveryId }, include: { endpoint: true } });
    if (!delivery || delivery.status !== "PENDING") return;
    const body = JSON.stringify(delivery.payload);
    const secret = decrypt(delivery.endpoint.secretEncrypted, loadConfig().APP_ENCRYPTION_KEY);
    let statusCode: number | null = null;
    let error: string | null = null;
    try {
      const res = await fetch(delivery.endpoint.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", [SIGNATURE_HEADER]: this.sign(secret, body), "User-Agent": "FOVE-Webhooks/1" },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      statusCode = res.status;
      if (!res.ok) error = `HTTP ${res.status}`;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }

    const attempts = delivery.attempts + 1;
    if (!error) {
      await this.prisma.client.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: "SUCCEEDED", attempts, lastStatusCode: statusCode, lastError: null, deliveredAt: new Date() },
      });
      return;
    }
    const failed = attempts >= MAX_ATTEMPTS;
    const delay = BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)]!;
    await this.prisma.client.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: failed ? "FAILED" : "PENDING",
        attempts,
        lastStatusCode: statusCode,
        lastError: error.slice(0, 500),
        nextAttemptAt: new Date(Date.now() + delay * 60_000),
      },
    });
    this.logger.warn(`Livraison ${delivery.id} échouée (${attempts}/${MAX_ATTEMPTS}) : ${error}`);
  }

  async retryDue(limit = 50): Promise<number> {
    const due = await this.prisma.client.webhookDelivery.findMany({
      where: { status: "PENDING", nextAttemptAt: { lte: new Date() } },
      orderBy: { nextAttemptAt: "asc" },
      take: limit,
      select: { id: true },
    });
    for (const d of due) await this.attempt(d.id);
    return due.length;
  }
}
