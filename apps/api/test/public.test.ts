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
    expect(card.body.card.number).toMatch(/^[A-Z0-9]{2}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
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

  it("« retrouver ma carte » renvoie le même lien, par email ou téléphone, sans le révoquer", async () => {
    const email = `recover${Date.now()}@test.fove`;
    const phone = randomPhone();
    const join = await http().post(`/api/public/join/${joinToken}`).send({ firstName: "R", phone, email, acceptTerms: true });
    const token = cardToken(join.body.cardUrl);
    expect((await http().post(`/api/public/join/${joinToken}/recover`).send({ identifier: email })).status).toBe(204);
    expect(/card\/(fvc_[A-Za-z0-9_-]+)/.exec((await lastEmail(email))!.text)![1]).toBe(token);
    // Téléphone saisi au format local avec espaces : le lien part vers l'email de la fiche.
    const local = `0${phone.slice(4, 6)} ${phone.slice(6, 9)} ${phone.slice(9)}`;
    await db.emailOutbox.deleteMany({ where: { to: email } });
    expect((await http().post(`/api/public/join/${joinToken}/recover`).send({ identifier: local })).status).toBe(204);
    expect((await lastEmail(email))?.text).toContain(token);
    // Une demande malveillante ne coupe pas la carte du vrai client.
    expect((await http().get(`/api/public/cards/${token}`)).status).toBe(200);
    expect((await http().post(`/api/public/join/${joinToken}/recover`).send({ identifier: "inconnu@test.fove" })).status).toBe(204);
  });

  it("une carte sans email n'est jamais renvoyée à l'écran", async () => {
    const phone = randomPhone();
    await http().post(`/api/public/join/${joinToken}`).send({ firstName: "SansMail", phone, acceptTerms: true });
    const before = await db.emailOutbox.count();
    const res = await http().post(`/api/public/join/${joinToken}/recover`).send({ identifier: phone });
    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
    expect(await db.emailOutbox.count()).toBe(before);
  });

  it("télécharge la carte en image et en PDF avec le lien cliquable", async () => {
    const join = await http().post(`/api/public/join/${joinToken}`).send({ firstName: "Image", lastName: "Test", phone: randomPhone(), acceptTerms: true });
    const token = cardToken(join.body.cardUrl);
    const png = await http().get(`/api/public/cards/${token}/carte.png`).buffer(true).parse((res, cb) => { const chunks: Buffer[] = []; res.on("data", (c: Buffer) => chunks.push(c)); res.on("end", () => cb(null, Buffer.concat(chunks))); });
    expect(png.status).toBe(200);
    expect(png.headers["content-type"]).toBe("image/png");
    expect((png.body as Buffer).subarray(1, 4).toString()).toBe("PNG");
    const pdf = await http().get(`/api/public/cards/${token}/carte.pdf?download=1`).buffer(true).parse((res, cb) => { const chunks: Buffer[] = []; res.on("data", (c: Buffer) => chunks.push(c)); res.on("end", () => cb(null, Buffer.concat(chunks))); });
    expect(pdf.headers["content-disposition"]).toMatch(/^attachment/);
    const text = (pdf.body as Buffer).toString("latin1");
    expect(text.startsWith("%PDF")).toBe(true);
    expect(text).toContain(token);
    expect((await http().get(`/api/public/cards/${token}/autre.txt`)).status).toBe(404);
    expect((await http().get("/api/public/cards/fvc_inconnu/carte.png")).status).toBe(404);
  });

  it("Google Wallet reste masqué tant qu'il n'est pas configuré", async () => {
    const join = await http().post(`/api/public/join/${joinToken}`).send({ firstName: "W", phone: randomPhone(), acceptTerms: true });
    const token = cardToken(join.body.cardUrl);
    expect((await http().get(`/api/public/cards/${token}`)).body.googleWallet).toBe(false);
    expect((await http().get(`/api/public/cards/${token}/google-wallet`)).status).toBe(404);
  });

  it("un lien d'inscription désactivé n'est plus utilisable", async () => {
    const link = await db.enrollmentLink.findUniqueOrThrow({ where: { token: joinToken } });
    await owner.post(`/api/app/enrollment-links/${link.id}/toggle`);
    expect((await http().get(`/api/public/join/${joinToken}`)).status).toBe(404);
    await owner.post(`/api/app/enrollment-links/${link.id}/toggle`);
  });

  it("enregistre un message de contact public et rejette le honeypot", async () => {
    const ok = await http().post("/api/public/contact").send({
      name: "Marie Kabila",
      email: "marie@boutique-kin.cd",
      phone: "+243812345678",
      companyName: "Boutique Kin",
      subject: "Demande de démonstration & essai accompagné",
      message: "Bonjour, nous avons 3 boutiques à Gombe et souhaitons déployer FOVE.",
      source: "DEMO_REQUEST",
    });
    expect(ok.status).toBe(201);
    expect(ok.body.status).toBe("NEW");

    const bot = await http().post("/api/public/contact").send({
      name: "Spam Bot",
      email: "spam@example.com",
      message: "Message automatique de test spam.",
      website: "https://spam.example.com",
    });
    expect(bot.status).toBe(400);
  });

  it("résout la page publique d'inscription directement par le sous-domaine / slug du commerce", async () => {
    const link = await db.enrollmentLink.findUniqueOrThrow({ where: { token: joinToken }, include: { tenant: true } });
    const bySlug = await http().get(`/api/public/join/${link.tenant.slug}`);
    expect(bySlug.status).toBe(200);
    expect(bySlug.body.tenant.name).toBe(link.tenant.name);
  });
});
