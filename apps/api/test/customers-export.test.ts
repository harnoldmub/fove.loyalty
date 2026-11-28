import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { addMember, createCustomerWithCard, createPointsProgram, db, ownerWithTenant, resetDatabase, startApp } from "./helpers";
import { csvCell } from "../src/customers/customers-export";

/** Export du fichier clients (CSV). */
let app: NestExpressApplication;

beforeAll(async () => {
  await resetDatabase();
  app = await startApp({ STRIPE_SECRET_KEY: undefined });
});
afterAll(async () => {
  await app.close();
});

describe("export du fichier clients", () => {
  it("CSV lisible par Excel (BOM, « ; » en français), clients effacés exclus, filtre par segment", async () => {
    const { client, tenantId } = await ownerWithTenant(app);
    const program = await createPointsProgram(client);
    const a = await createCustomerWithCard(client, program.id);
    const b = await createCustomerWithCard(client, program.id);
    const gone = await createCustomerWithCard(client, program.id);
    await db.customer.update({ where: { id: a.customerId }, data: { firstName: "=HYPERLINK(\"x\")", birthDay: 5, birthMonth: 11, marketingEmailConsent: true, tags: ["vip", "midi"] } });
    await db.customer.update({ where: { id: b.customerId }, data: { lastVisitAt: new Date(Date.now() - 100 * 86_400_000), createdAt: new Date(Date.now() - 200 * 86_400_000), totalVisits: 3 } });
    await client.post(`/api/app/customers/${gone.customerId}/anonymize`);

    const res = await client.get("/api/app/customers/export.csv");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toMatch(/attachment; filename="clients-.+\.csv"/);
    const text = res.text;
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const lines = text.slice(1).trim().split("\r\n");
    expect(lines[0]).toContain("Prénom;Nom;Téléphone");
    expect(lines).toHaveLength(3);
    const lineA = lines.find((l) => l.includes("HYPERLINK"))!;
    expect(lineA.startsWith(`"'=HYPERLINK`)).toBe(true);
    expect(lineA).toContain("05/11");
    expect(lineA).toContain(";oui;");
    expect(lineA).toContain("vip, midi");
    expect(text).not.toContain("anonymisé");

    const dormant = (await client.get("/api/app/customers/export.csv?segment=DORMANT")).text.slice(1).trim().split("\r\n");
    expect(dormant).toHaveLength(2);
    expect(await db.auditLog.count({ where: { tenantId, action: "customers.exported" } })).toBe(2);
  });

  it("réservé au propriétaire et aux gérants", async () => {
    const { client } = await ownerWithTenant(app);
    const cashier = await addMember(app, client, "CASHIER");
    expect((await cashier.get("/api/app/customers/export.csv")).status).toBe(403);
  });

  it("cellule sûre : formules neutralisées, guillemets et séparateur échappés", () => {
    expect(csvCell("=1+1", ";")).toBe("'=1+1");
    expect(csvCell("+33600000000", ";")).toBe("+33600000000");
    expect(csvCell("+cmd|' /C calc'!A0", ";")).toBe("'+cmd|' /C calc'!A0");
    expect(csvCell('Le "Bon" coin; Paris', ";")).toBe('"Le ""Bon"" coin; Paris"');
    expect(csvCell(null, ",")).toBe("");
  });
});
