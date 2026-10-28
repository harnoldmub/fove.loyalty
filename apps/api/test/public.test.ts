import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { createPointsProgram, db, earn, lastEmail, ownerWithTenant, randomPhone, resetDatabase, startApp, type Client } from "./helpers";

let app: NestExpressApplication;
let owner: Client;
let joinToken: string;
let programId: string;
const http = () => request(app.getHttpServer());

beforeAll(async () => {
  await resetDatabase();
  app = await startApp();
  owner = (await ownerWithTenant(app)).client;
  programId = (await createPointsProgram(owner)).id;
  const links = (await owner.get("/api/app/enrollment-links")).body as { token: string; programId: string }[];
  joinToken = links.find((l) => l.programId === programId)!.token;
});
afterAll(() => app.close());

function cardToken(url: string) {
  return url.split("/card/")[1]!;
}

describe("inscription par QR et carte numérique", () => {
  it("la page publique affiche le programme sans données privées", async () => {
    const res = await http().get(`/api/public/join/${joinToken}`);
    expect(res.status).toBe(200);
    expect(res.body.program.name).toBe("Points");
    expect(JSON.stringify(res.body)).not.toMatch(/tenantId|email/);
  });

  it("un client s'inscrit depuis son téléphone et obtient sa carte", async () => {
    const res = await http().post(`/api/public/join/${joinToken}`).send({ firstName: "Nadia", lastName: "K", phone: randomPhone(), acceptTerms: true });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("ACTIVE");
    const card = await http().get(`/api/public/cards/${cardToken(res.body.cardUrl)}`);
    expect(card.status).toBe(200);
    expect(card.body.customer.firstName).toBe("Nadia");
    expect(card.body.card.number).toMatch(/^FV-/);
    expect(card.body.card.balance).toBe(0);
    expect(card.headers["cache-control"]).toBe("no-store");
    const svg = await http().get(`/api/public/cards/${cardToken(res.body.cardUrl)}/qr.svg`);
    expect(svg.headers["content-type"]).toMatch(/svg/);
  });

  it("une seconde inscription avec le même numéro ne révèle pas la carte existante", async () => {
    const phone = randomPhone();
    await http().post(`/api/public/join/${joinToken}`).send({ firstName: "A", phone, acceptTerms: true });
    const again = await http().post(`/api/public/join/${joinToken}`).send({ firstName: "Imposteur", phone, acceptTerms: true });
    expect(again.status).toBe(409);
    expect(JSON.stringify(again.body)).not.toMatch(/card|fvc_/);
  });

  it("refuse le robot (champ piège) et l'absence de consentement", async () => {
    expect((await http().post(`/api/public/join/${joinToken}`).send({ firstName: "Bot", phone: randomPhone(), acceptTerms: true, website: "spam" })).status).toBe(400);
    expect((await http().post(`/api/public/join/${joinToken}`).send({ firstName: "Sans", phone: randomPhone(), acceptTerms: false })).status).toBe(400);
  });

  it("le QR personnel ne donne aucun droit : aucune route publique ne crédite", async () => {
    const res = await http().post(`/api/public/join/${joinToken}`).send({ firstName: "Q", phone: randomPhone(), acceptTerms: true });
    const card = await http().get(`/api/public/cards/${cardToken(res.body.cardUrl)}`);
    const qr = card.body.card.qr as string;
    expect((await http().post("/api/app/transactions/earn").set("x-fove-csrf", "1").send({ accountId: qr, amount: "1000", idempotencyKey: "abcdefgh" })).status).toBe(401);
    expect((await http().get(`/api/public/cards/${qr}`)).status).toBe(404);
    // Le commerçant, lui, identifie la carte par ce QR puis crédite.
    const lookup = await owner.post("/api/app/scanner/lookup", { code: qr });
    expect(lookup.status).toBe(200);
    expect((await earn(owner, lookup.body.id, "4000")).body.transaction.delta).toBe(4);
    expect((await http().get(`/api/public/cards/${cardToken(res.body.cardUrl)}`)).body.card.balance).toBe(4);
  });

  it("un jeton de carte inconnu renvoie 404", async () => {
    expect((await http().get("/api/public/cards/fvc_inexistant")).status).toBe(404);
  });

  it("validation par code email : carte en attente puis active", async () => {
    const res = await owner.post("/api/app/programs", { name: "Validé", mode: "STAMPS", currency: "CDF", enrollmentVerification: "EMAIL_OTP" });
    const links = (await owner.get("/api/app/enrollment-links")).body as { token: string; programId: string }[];
    const token = links.find((l) => l.programId === res.body.id)!.token;
    expect((await http().post(`/api/public/join/${token}`).send({ firstName: "Sans", phone: randomPhone(), acceptTerms: true })).status).toBe(400);
    const email = `client${Date.now()}@test.fove`;
    const join = await http().post(`/api/public/join/${token}`).send({ firstName: "Mail", phone: randomPhone(), email, acceptTerms: true });
    expect(join.body.status).toBe("PENDING_VERIFICATION");
    const t = cardToken(join.body.cardUrl);
    expect((await http().post(`/api/public/cards/${t}/verify`).send({ code: "000000" })).status).toBe(400);
    const code = /(\d{6})/.exec((await lastEmail(email))!.text)![1];
    expect((await http().post(`/api/public/cards/${t}/verify`).send({ code })).body.status).toBe("ACTIVE");
  });

  it("« retrouver ma carte » envoie un nouveau lien et révoque l'ancien", async () => {
    const email = `recover${Date.now()}@test.fove`;
    const join = await http().post(`/api/public/join/${joinToken}`).send({ firstName: "R", phone: randomPhone(), email, acceptTerms: true });
    const oldToken = cardToken(join.body.cardUrl);
    expect((await http().post(`/api/public/join/${joinToken}/recover`).send({ email })).status).toBe(204);
    expect((await http().post(`/api/public/join/${joinToken}/recover`).send({ email: "inconnu@test.fove" })).status).toBe(204);
    const newToken = /card\/(fvc_[A-Za-z0-9_-]+)/.exec((await lastEmail(email))!.text)![1]!;
    expect((await http().get(`/api/public/cards/${oldToken}`)).status).toBe(404);
    expect((await http().get(`/api/public/cards/${newToken}`)).status).toBe(200);
  });

  it("un lien d'inscription désactivé n'est plus utilisable", async () => {
    const link = await db.enrollmentLink.findUniqueOrThrow({ where: { token: joinToken } });
    await owner.post(`/api/app/enrollment-links/${link.id}/toggle`);
    expect((await http().get(`/api/public/join/${joinToken}`)).status).toBe(404);
    await owner.post(`/api/app/enrollment-links/${link.id}/toggle`);
  });
});
