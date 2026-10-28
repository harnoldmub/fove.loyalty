import { Body, Controller, Get, HttpCode, Post, Req, Res } from "@nestjs/common";
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

const strict = { default: { limit: 10, ttl: 60_000 } };

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
