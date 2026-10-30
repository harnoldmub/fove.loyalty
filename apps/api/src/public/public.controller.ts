import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { publicEnrollSchema, verifyOtpSchema, contactMessageSchema } from "@fove/shared";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe";
import { notFound } from "../common/errors";
import { sha256 } from "../common/crypto";
import { CardsService } from "../cards/cards.service";
import { PublicService } from "./public.service";

const tokenPattern = /^[A-Za-z0-9_-]{3,80}$/;
const recoverSchema = z.object({ identifier: z.string().trim().min(3).max(160) });
const tokenHash = (token: string) => (token.startsWith("fvc_") && token.length <= 80 ? sha256(token) : "");

/** Routes publiques (sans compte), limitées en débit. Aucun cookie utilisé. */
@ApiTags("public")
@Controller("public")
export class PublicController {
  constructor(
    private readonly service: PublicService,
    private readonly cards: CardsService,
  ) {}

  @Get("join/:token")
  join(@Param("token") token: string) {
    if (!tokenPattern.test(token)) return this.notFound();
    return this.service.joinPage(token);
  }

  @Post("join/:token")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  enroll(@Param("token") token: string, @Body(new ZodPipe(publicEnrollSchema)) body: z.infer<typeof publicEnrollSchema>, @Req() req: Request) {
    if (!tokenPattern.test(token)) return this.notFound();
    return this.service.join(token, body, req.ip ?? null);
  }

  @Post("join/:token/recover")
  @HttpCode(204)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async recover(@Param("token") token: string, @Body(new ZodPipe(recoverSchema)) body: z.infer<typeof recoverSchema>) {
    if (!tokenPattern.test(token)) return this.notFound();
    await this.service.recover(token, body.identifier);
  }

  @Get("cards/:token")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  card(@Param("token") token: string, @Res({ passthrough: true }) res: Response) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Robots-Tag", "noindex");
    return this.service.card(token);
  }

  @Get("cards/:token/qr.svg")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async qr(@Param("token") token: string, @Res() res: Response) {
    res.setHeader("Cache-Control", "no-store");
    res.type("image/svg+xml").send(await this.service.cardQrSvg(token));
  }

  /** Lien « Ajouter à Google Wallet », signé, valable 10 minutes. */
  @Get("cards/:token/google-wallet")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  googleWallet(@Param("token") token: string, @Res({ passthrough: true }) res: Response) {
    res.setHeader("Cache-Control", "no-store");
    return this.cards.walletSaveUrl(tokenHash(token));
  }

  /** Carte en image (PNG) ou PDF 9:16 ; `?download=1` force l'enregistrement. */
  @Get("cards/:token/:file")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async file(@Param("token") token: string, @Param("file") file: string, @Query("download") download: string | undefined, @Res() res: Response) {
    const format = file === "carte.png" ? "png" : file === "carte.pdf" ? "pdf" : null;
    if (!format) return this.notFound();
    const { body, filename } = await this.cards.file(tokenHash(token), format);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.setHeader("Content-Disposition", `${download !== undefined ? "attachment" : "inline"}; filename="${filename}"`);
    res.type(format === "png" ? "image/png" : "application/pdf").send(body);
  }

  @Post("cards/:token/verify")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verify(@Param("token") token: string, @Body(new ZodPipe(verifyOtpSchema)) body: z.infer<typeof verifyOtpSchema>) {
    return this.service.verify(token, body.code);
  }

  @Post("cards/:token/resend-code")
  @HttpCode(204)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async resend(@Param("token") token: string) {
    await this.service.resendCode(token);
  }

  /** Formulaire de contact public (site commercial / demande de démo). */
  @Post("contact")
  @HttpCode(201)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  contact(@Body(new ZodPipe(contactMessageSchema)) body: z.infer<typeof contactMessageSchema>, @Req() req: Request) {
    return this.service.submitContact(body, req.ip ?? null);
  }

  private notFound(): never {
    throw notFound("Page");
  }
}
