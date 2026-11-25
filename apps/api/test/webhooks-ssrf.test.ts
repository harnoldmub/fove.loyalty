import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { db, ownerWithTenant, randomPhone, resetDatabase, startApp } from "./helpers";
import { WebhooksService } from "../src/notifications/webhooks.service";

let app: NestExpressApplication;
let hook: Server;
let internal: Server;
let internalHits = 0;
let hookPort = 0;

function listen(server: Server) {
  return new Promise<number>((resolve) => server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port)));
}

beforeAll(async () => {
  await resetDatabase();
  app = await startApp();
  // « Service interne » que le webhook tente d'atteindre par redirection.
  internal = createServer((_req, res) => {
    internalHits++;
    res.end("secret interne");
  });
  const internalPort = await listen(internal);
  hook = createServer((_req, res) => {
    res.writeHead(307, { Location: `http://127.0.0.1:${internalPort}/admin` });
    res.end();
  });
  hookPort = await listen(hook);
});
afterAll(async () => {
  hook.close();
  internal.close();
  await app.close();
});

describe("webhooks sortants : pas de rebond vers le réseau interne", () => {
  it("une redirection compte comme un échec et n'est jamais suivie", async () => {
    const { client, tenantId, email } = await ownerWithTenant(app);
    await db.user.update({ where: { email }, data: { emailVerifiedAt: new Date() } });
    const created = await client.post("/api/app/integrations/webhooks", { url: `http://localhost:${hookPort}/fove`, events: ["customer.created"] });
    expect(created.status).toBeLessThan(300);

    expect((await client.post("/api/app/customers", { firstName: "Hook", phone: randomPhone() })).status).toBe(201);
    const delivery = await db.webhookDelivery.findFirstOrThrow({ where: { tenantId } });
    await app.get(WebhooksService).attempt(delivery.id);

    const after = await db.webhookDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
    expect(after.status).toBe("PENDING");
    expect(after.lastStatusCode).toBe(307);
    expect(after.lastError).toBe("Redirection refusée (HTTP 307)");
    expect(internalHits).toBe(0);
  });
});
