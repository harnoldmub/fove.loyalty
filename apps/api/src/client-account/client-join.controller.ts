import { Body, Controller, Get, HttpCode, Param, Post, Req, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { clientJoinSchema, clientJoinSignupSchema } from "@fove/shared";
import type { z } from "zod";
import { ZodPipe } from "../common/zod.pipe";
import { forbidden, notFound } from "../common/errors";
import { ClientEnrollmentService } from "./client-enrollment.service";
import type { ClientAuthState } from "./client-session.service";
import { Client, ClientRoute } from "./client-guard";

const tokenPattern = /^[A-Za-z0-9_-]{3,80}$/;

function checkToken(token: string) {
  if (!tokenPattern.test(token)) throw notFound("Programme");
}

/** Inscription à un programme depuis le QR ou la page d'un commerce, avec le compte client FOVE. */
@ApiTags("compte client")
@Controller("client/join/:token")
export class ClientJoinController {
  constructor(private readonly enrollment: ClientEnrollmentService) {}

  /** Situation du visiteur : non connecté, carte existante, peut rejoindre, doit confirmer son email. */
  @Get()
  state(@Param("token") token: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    checkToken(token);
    return this.enrollment.state(token, req, res);
  }

  @Post()
  @HttpCode(200)
  @ClientRoute()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  join(@Param("token") token: string, @Client() client: ClientAuthState, @Body(new ZodPipe(clientJoinSchema)) body: z.infer<typeof clientJoinSchema>, @Req() req: Request) {
    checkToken(token);
    return this.enrollment.join(token, client.account.id, body, req);
  }

  @Post("signup")
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  signup(
    @Param("token") token: string,
    @Body(new ZodPipe(clientJoinSignupSchema)) body: z.infer<typeof clientJoinSignupSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (req.headers["x-fove-csrf"] !== "1") throw forbidden("En-tête anti-CSRF manquant");
    checkToken(token);
    return this.enrollment.signup(token, body, req, res);
  }
}
