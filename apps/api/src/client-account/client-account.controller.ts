import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { clientCodeRequestSchema, clientCodeVerifySchema, clientProfileSchema } from "@fove/shared";
import type { z } from "zod";
import { ZodPipe } from "../common/zod.pipe";
import { loadConfig } from "../config";
import { finishGoogleOAuth, safeNext, startGoogleOAuth } from "../auth/google-oauth";
import { forbidden } from "../common/errors";
import { ClientAccountService } from "./client-account.service";
import { ClientCardsService } from "./client-cards.service";
import { ClientSessionService, type ClientAuthState } from "./client-session.service";
import { Client, ClientRoute } from "./client-guard";

const strict = { default: { limit: 10, ttl: 60_000 } };

/** Connexion Google des clients : cookie d'état et adresse de retour distincts de ceux des commerçants. */
function googleFlow() {
  const config = loadConfig();
  return { cookie: "fove_client_google_oauth", redirectUri: config.GOOGLE_OAUTH_CLIENT_REDIRECT_URI ?? `${config.APP_URL}/api/client/auth/google/callback` };
}

function loginPage(next: string, error: string) {
  return `/mes-cartes/connexion?${new URLSearchParams({ next, oauth_error: error })}`;
}

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
    private readonly myCards: ClientCardsService,
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

  /** « Continuer avec Google » : départ vers Google, retour sur `next` (page du commerce, « Mes cartes »). */
  @Get("auth/google")
  @Throttle(strict)
  google(@Query("next") next: string | undefined, @Res() res: Response) {
    const config = loadConfig();
    const back = safeNext(next, "/mes-cartes");
    if (!config.googleOAuthEnabled) return res.redirect(303, `${config.APP_URL}${loginPage(back, "unavailable")}`);
    return res.redirect(303, startGoogleOAuth(res, googleFlow(), back));
  }

  @Get("auth/google/callback")
  @Throttle(strict)
  async googleCallback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") oauthError: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const config = loadConfig();
    const result = await finishGoogleOAuth(req, res, googleFlow(), { code, state, error: oauthError });
    if (!result) return res.redirect(303, `${config.APP_URL}${loginPage("/mes-cartes", "failed")}`);
    await this.accounts.loginWithGoogle(result.profile, req, res);
    return res.redirect(303, `${config.APP_URL}${safeNext(result.next, "/mes-cartes")}`);
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

  /** « Mes cartes » : cartes du compte et fiches à rattacher (compte confirmé). */
  @Get("me/cards")
  @ClientRoute()
  cards(@Client() client: ClientAuthState) {
    return this.myCards.list(client.account.id);
  }

  @Post("me/linkable/:customerId")
  @HttpCode(204)
  @ClientRoute()
  async accept(@Client() client: ClientAuthState, @Param("customerId", ParseUUIDPipe) customerId: string) {
    await this.myCards.accept(client.account.id, customerId);
  }

  /** « Ce n'est pas moi ». */
  @Delete("me/linkable/:customerId")
  @HttpCode(204)
  @ClientRoute()
  async dismiss(@Client() client: ClientAuthState, @Param("customerId", ParseUUIDPipe) customerId: string) {
    await this.myCards.dismiss(client.account.id, customerId);
  }

  @Delete("me")
  @HttpCode(204)
  @ClientRoute()
  async remove(@Client() client: ClientAuthState, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.accounts.deleteAccount(client.account.id, req, res);
  }
}
