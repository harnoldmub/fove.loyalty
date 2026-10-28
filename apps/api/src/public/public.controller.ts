import { Body, Controller, Get, HttpCode, Param, Post, Req, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { publicEnrollSchema, verifyOtpSchema } from "@fove/shared";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe";
import { notFound } from "../common/errors";
import { PublicService } from "./public.service";

const tokenPattern = /^[A-Za-z0-9_-]{8,80}$/;
const recoverSchema = z.object({ email: z.email() });

/** Routes publiques (sans compte), limitées en débit. Aucun cookie utilisé. */
@ApiTags("public")
@Controller("public")
export class PublicController {
  constructor(private readonly service: PublicService) {}

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
    await this.service.recover(token, body.email);
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

  private notFound(): never {
    throw notFound("Page");
  }
}
