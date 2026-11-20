import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { agent, db, lastEmail, ownerWithTenant, resetDatabase, startApp, uniq } from "./helpers";

let app: NestExpressApplication;
beforeAll(async () => {
  await resetDatabase();
  app = await startApp();
});
afterAll(() => app.close());

describe("API multilingue", () => {
  it("traduit les erreurs selon Accept-Language ou le cookie, sans changer le code", async () => {
    const server = app.getHttpServer();
    const body = { email: "absent@test.fove", password: "motdepasse123" };
    const en = await request(server).post("/api/auth/login").set("x-fove-csrf", "1").set("Accept-Language", "en-US,en;q=0.9").send(body);
    expect(en.status).toBe(401);
    expect(en.body.error).toMatchObject({ code: "unauthorized", message: "Incorrect email or password" });
    expect(en.headers["content-language"]).toBe("en");

    const es = await request(server).post("/api/auth/login").set("x-fove-csrf", "1").set("Cookie", "FOVE_LOCALE=es").set("Accept-Language", "en").send(body);
    expect(es.body.error.message).toBe("Correo o contraseña incorrectos");

    const fr = await request(server).post("/api/auth/login").set("x-fove-csrf", "1").send(body);
    expect(fr.body.error.message).toBe("Email ou mot de passe incorrect");
  });

  it("traduit les messages de validation par champ", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/auth/signup")
      .set("x-fove-csrf", "1")
      .set("Accept-Language", "ar")
      .send({ name: "Amy", email: `${uniq("u")}@test.fove`, password: "court", acceptTerms: true });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_failed");
    expect(res.body.error.message).toBe("بيانات غير صالحة");
    expect(res.body.error.details.some((d: { message: string }) => d.message === "10 أحرف على الأقل")).toBe(true);
  });

  it("enregistre la langue à l'inscription et envoie l'email de confirmation dans cette langue", async () => {
    const c = agent(app);
    const email = `${uniq("u")}@test.fove`;
    const res = await c.raw
      .post("/api/auth/signup")
      .set("x-fove-csrf", "1")
      .set("Accept-Language", "es-ES")
      .send({ name: "Amy", email, password: "motdepasse123", acceptTerms: true });
    expect(res.status).toBe(201);
    expect((await db.user.findUnique({ where: { email } }))?.locale).toBe("es");
    expect((await lastEmail(email))?.subject).toBe("Confirma tu dirección de correo — FOVE");

    expect((await c.post("/api/auth/locale", { locale: "en" })).status).toBe(204);
    expect((await c.post("/api/auth/locale", { locale: "de" })).status).toBe(400);
    await db.authToken.deleteMany({ where: { user: { email } } });
    await c.post("/api/auth/resend-verification");
    expect((await lastEmail(email))?.subject).toBe("Confirm your email address — FOVE");
  });

  it("accepte la langue du commerce dans ses réglages", async () => {
    const { client: owner, tenantId } = await ownerWithTenant(app);
    expect((await owner.patch("/api/app/tenant", { locale: "ar" })).status).toBe(200);
    expect((await db.tenantSettings.findUnique({ where: { tenantId } }))?.locale).toBe("ar");
    expect((await owner.patch("/api/app/tenant", { locale: null })).status).toBe(200);
    expect((await owner.patch("/api/app/tenant", { locale: "xx" })).status).toBe(400);
  });
});
