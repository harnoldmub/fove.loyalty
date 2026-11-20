import { Body, Controller, Get, HttpCode, Post, Query, Req, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import {
  acceptInviteSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
  switchTenantSchema,
  verifyEmailSchema,
} from "@fove/shared";
import type { z } from "zod";
import { ZodPipe } from "../common/zod.pipe";
import { forbidden } from "../common/errors";
import { Auth } from "../common/decorators";
import type { AppRequest, AuthState } from "../common/context";
import { AuthService } from "./auth.service";
import { SessionService, sessionCookieName } from "./session.service";
import { UserRoute } from "./guards";
import { TeamService } from "../tenants/team.service";
import { loadConfig } from "../config";
import { randomToken, safeEqual, sha256 } from "../common/crypto";

const strict = { default: { limit: 10, ttl: 60_000 } };
const GOOGLE_STATE_COOKIE = "fove_google_oauth";

function safeNext(value: unknown): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value.slice(0, 500) : "/app";
}

function googleRedirectUri() {
  const config = loadConfig();
  return config.GOOGLE_OAUTH_REDIRECT_URI ?? `${config.APP_URL}/api/auth/google/callback`;
}

function requireCsrf(req: Request) {
  if (req.headers["x-fove-csrf"] !== "1") throw forbidden("En-tête anti-CSRF manquant");
}

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly team: TeamService,
  ) {}

  @Get("providers")
  providers() {
    return { google: loadConfig().googleOAuthEnabled };
  }

  @Get("google")
  @Throttle(strict)
  google(@Query("next") next: string | undefined, @Res() res: Response) {
    const config = loadConfig();
    if (!config.googleOAuthEnabled) return res.redirect(303, `${config.APP_URL}/login?oauth_error=unavailable`);

    const state = randomToken("", 24);
    const verifier = randomToken("", 48);
    const payload = Buffer.from(JSON.stringify({ state, verifier, next: safeNext(next), at: Date.now() })).toString("base64url");
    res.cookie(GOOGLE_STATE_COOKIE, payload, {
      httpOnly: true,
      secure: config.isProd,
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60_000,
    });

    const params = new URLSearchParams({
      client_id: config.GOOGLE_OAUTH_CLIENT_ID!,
      redirect_uri: googleRedirectUri(),
      response_type: "code",
      scope: "openid email profile",
      state,
      code_challenge: Buffer.from(sha256(verifier), "hex").toString("base64url"),
      code_challenge_method: "S256",
      prompt: "select_account",
    });
    return res.redirect(303, `https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  }

  @Get("google/callback")
  @Throttle(strict)
  async googleCallback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") oauthError: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const config = loadConfig();
    const fail = () => res.redirect(303, `${config.APP_URL}/login?oauth_error=failed`);
    const raw = req.cookies?.[GOOGLE_STATE_COOKIE];
    res.clearCookie(GOOGLE_STATE_COOKIE, { httpOnly: true, secure: config.isProd, sameSite: "lax", path: "/" });
    if (oauthError || !code || !state || typeof raw !== "string" || raw.length > 2_000 || !config.googleOAuthEnabled) return fail();

    try {
      const saved = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as {
        state?: string;
        verifier?: string;
        next?: string;
        at?: number;
      };
      if (!saved.state || !saved.verifier || !safeEqual(state, saved.state) || !saved.at || Date.now() - saved.at > 10 * 60_000) return fail();

      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: config.GOOGLE_OAUTH_CLIENT_ID!,
          client_secret: config.GOOGLE_OAUTH_CLIENT_SECRET!,
          redirect_uri: googleRedirectUri(),
          grant_type: "authorization_code",
          code_verifier: saved.verifier,
        }),
      });
      if (!tokenResponse.ok) return fail();
      const tokens = (await tokenResponse.json()) as { access_token?: string };
      if (!tokens.access_token) return fail();

      const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { authorization: `Bearer ${tokens.access_token}` },
      });
      if (!profileResponse.ok) return fail();
      const profile = (await profileResponse.json()) as { email?: string; email_verified?: boolean; name?: string };
      if (!profile.email || profile.email_verified !== true) return fail();

      await this.auth.loginWithGoogle({ email: profile.email, name: profile.name ?? "" }, req, res);
      return res.redirect(303, `${config.APP_URL}${safeNext(saved.next)}`);
    } catch {
      return fail();
    }
  }

  @Post("signup")
  @Throttle(strict)
  async signup(@Body(new ZodPipe(signupSchema)) body: z.infer<typeof signupSchema>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    requireCsrf(req);
    return this.auth.signup(body, req, res);
  }

  @Post("login")
  @HttpCode(200)
  @Throttle(strict)
  async login(@Body(new ZodPipe(loginSchema)) body: z.infer<typeof loginSchema>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    requireCsrf(req);
    return this.auth.login(body.email, body.password, req, res);
  }

  @Post("logout")
  @HttpCode(204)
  async logout(@Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    requireCsrf(req);
    const state = await this.sessions.resolve(req.cookies?.[sessionCookieName()]);
    if (state) await this.sessions.revoke(state.sessionId);
    this.sessions.clearCookie(res);
  }

  @Get("me")
  @UserRoute()
  me(@Auth() auth: AuthState) {
    return this.auth.me(auth);
  }

  @Post("switch-tenant")
  @HttpCode(204)
  @UserRoute()
  async switchTenant(@Auth() auth: AuthState, @Body(new ZodPipe(switchTenantSchema)) body: z.infer<typeof switchTenantSchema>) {
    await this.auth.switchTenant(auth, body.tenantId);
  }

  @Post("verify-email")
  @HttpCode(204)
  @Throttle(strict)
  async verifyEmail(@Body(new ZodPipe(verifyEmailSchema)) body: z.infer<typeof verifyEmailSchema>) {
    await this.auth.verifyEmail(body.token);
  }

  @Post("resend-verification")
  @HttpCode(204)
  @Throttle(strict)
  @UserRoute()
  async resend(@Auth() auth: AuthState) {
    await this.auth.resendVerification(auth);
  }

  @Post("forgot-password")
  @HttpCode(204)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async forgot(@Body(new ZodPipe(forgotPasswordSchema)) body: z.infer<typeof forgotPasswordSchema>, @Req() req: Request) {
    requireCsrf(req);
    await this.auth.forgotPassword(body.email);
  }

  @Post("reset-password")
  @HttpCode(204)
  @Throttle(strict)
  async reset(@Body(new ZodPipe(resetPasswordSchema)) body: z.infer<typeof resetPasswordSchema>, @Req() req: Request) {
    requireCsrf(req);
    await this.auth.resetPassword(body.token, body.password);
  }

  @Get("invitations/preview")
  @Throttle(strict)
  preview(@Req() req: Request) {
    return this.team.previewInvitation(String(req.query.token ?? ""));
  }

  @Post("invitations/accept")
  @Throttle(strict)
  async accept(
    @Body(new ZodPipe(acceptInviteSchema)) body: z.infer<typeof acceptInviteSchema>,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    requireCsrf(req);
    const state = await this.sessions.resolve(req.cookies?.[sessionCookieName()]);
    return this.team.acceptInvitation(body, state, req, res);
  }
}
