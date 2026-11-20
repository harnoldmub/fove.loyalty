import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Req, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { clientCodeRequestSchema, clientCodeVerifySchema, clientProfileSchema } from "@fove/shared";
import type { z } from "zod";
import { ZodPipe } from "../common/zod.pipe";
import { forbidden } from "../common/errors";
import { ClientAccountService } from "./client-account.service";
import { ClientSessionService, type ClientAuthState } from "./client-session.service";
import { Client, ClientRoute } from "./client-guard";

const strict = { default: { limit: 10, ttl: 60_000 } };

function requireCsrf(req: Request) {
  if (req.headers["x-fove-csrf"] !== "1") throw forbidden("En-tête anti-CSRF manquant");
}

/** Compte client FOVE (client final). Distinct des comptes commerçants (`/auth`). */
@ApiTags("compte client")
@Controller("client")
export class ClientAccountController {
  constructor(
    private readonly accounts: ClientAccountService,
    private readonly sessions: ClientSessionService,
  ) {}

  @Post("auth/code")
  @HttpCode(204)
  @Throttle(strict)
  async requestCode(@Body(new ZodPipe(clientCodeRequestSchema)) body: z.infer<typeof clientCodeRequestSchema>, @Req() req: Request) {
    requireCsrf(req);
    await this.accounts.requestCode(body.email, req);
  }

  @Post("auth/verify")
  @HttpCode(200)
  @Throttle(strict)
  verify(@Body(new ZodPipe(clientCodeVerifySchema)) body: z.infer<typeof clientCodeVerifySchema>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    requireCsrf(req);
    return this.accounts.verifyCode(body.email, body.code, req, res);
  }

  @Post("auth/logout")
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    requireCsrf(req);
    const state = await this.sessions.resolve(req, res);
    await this.accounts.logout(state?.sessionId ?? null, res);
  }

  @Get("me")
  @ClientRoute()
  me(@Client() client: ClientAuthState) {
    return client.account;
  }

  @Patch("me")
  @ClientRoute()
  updateProfile(@Client() client: ClientAuthState, @Body(new ZodPipe(clientProfileSchema)) body: z.infer<typeof clientProfileSchema>) {
    return this.accounts.updateProfile(client.account.id, body);
  }

  @Delete("me")
  @HttpCode(204)
  @ClientRoute()
  async remove(@Client() client: ClientAuthState, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.accounts.deleteAccount(client.account.id, req, res);
  }
}
