import { Body, Controller, Get, HttpCode, Ip, Post, Query, Req, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import {
  acceptInviteSchema,
  localeSchema,
  loginCodeRequestSchema,
  loginCodeVerifySchema,
  switchTenantSchema,
} from "@fove/shared";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe";
import { forbidden } from "../common/errors";
import { Auth, RegisterAllowed } from "../common/decorators";
import type { AppRequest, AuthState } from "../common/context";
import { AuthService, isAdminUser } from "./auth.service";
import { MfaService } from "./mfa.service";
import { SessionService, sessionCookieName } from "./session.service";
import { UserRoute } from "./guards";
import { TeamService } from "../tenants/team.service";
import { loadConfig } from "../config";
import { requestLocaleOrNull } from "../i18n/locale";
import { finishGoogleOAuth, safeNext, startGoogleOAuth } from "./google-oauth";

const strict = { default: { limit: 10, ttl: 60_000 } };
const mfaCodeSchema = z.object({ code: z.string().trim().min(6).max(12) });
/** Connexion Google des commerçants : cookie d'état et adresse de retour propres à l'espace commerçant. */
function googleFlow() {
  const config = loadConfig();
  return { cookie: "fove_google_oauth", redirectUri: config.GOOGLE_OAUTH_REDIRECT_URI ?? `${config.APP_URL}/api/auth/google/callback` };
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
    private readonly mfa: MfaService,
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
    return res.redirect(303, startGoogleOAuth(res, googleFlow(), safeNext(next, "/app")));
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
    const result = await finishGoogleOAuth(req, res, googleFlow(), { code, state, error: oauthError });
    if (!result) return res.redirect(303, `${config.APP_URL}/login?oauth_error=failed`);
    const user = await this.auth.loginWithGoogle({ email: result.profile.email, name: result.profile.name }, req, res);
    const next = safeNext(result.next, "/app");
    // Sans destination particulière : l'espace d'arrivée du compte. Un admin y va même avec une offre
    // retenue depuis la page tarifs ; un partenaire sans commerce va dans son espace partenaire.
    const byDefault = next === "/app" || (user.admin && next.startsWith("/app/billing?offre="));
    return res.redirect(303, `${config.APP_URL}${byDefault ? user.home : next}`);
  }

  /** Connexion et inscription sans mot de passe : code à 6 chiffres envoyé par email. */
  @Post("code")
  @HttpCode(204)
  @Throttle(strict)
  async requestCode(@Body(new ZodPipe(loginCodeRequestSchema)) body: z.infer<typeof loginCodeRequestSchema>, @Req() req: Request) {
    requireCsrf(req);
    await this.auth.requestCode(body.email, req);
  }

  /** Code juste : connecté (compte existant) ; email inconnu : `profile_required`, puis création avec nom et CGU. */
  @Post("code/verify")
  @HttpCode(200)
  @Throttle(strict)
  async verifyCode(@Body(new ZodPipe(loginCodeVerifySchema)) body: z.infer<typeof loginCodeVerifySchema>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    requireCsrf(req);
    return this.auth.verifyCode(body, req, res);
  }

  @Post("logout")
  @RegisterAllowed("locked")
  @HttpCode(204)
  async logout(@Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    requireCsrf(req);
    const state = await this.sessions.resolve(req.cookies?.[sessionCookieName()]);
    if (state) await this.sessions.revoke(state.sessionId);
    this.sessions.clearCookie(res);
  }

  @Get("me")
  @RegisterAllowed("locked")
  @UserRoute()
  me(@Auth() auth: AuthState) {
    return this.auth.me(auth);
  }

  // --- Double authentification des admins (docs/securite.md) -------------------------------

  @Get("mfa")
  @UserRoute()
  mfaStatus(@Auth() auth: AuthState) {
    return this.mfa.status(auth);
  }

  @Post("mfa/setup")
  @UserRoute()
  @Throttle(strict)
  mfaSetup(@Auth() auth: AuthState) {
    this.assertAdmin(auth);
    return this.mfa.startEnrollment(auth);
  }

  @Post("mfa/setup/confirm")
  @UserRoute()
  @Throttle(strict)
  @HttpCode(200)
  mfaConfirm(@Auth() auth: AuthState, @Body(new ZodPipe(mfaCodeSchema)) body: z.infer<typeof mfaCodeSchema>) {
    this.assertAdmin(auth);
    return this.mfa.confirmEnrollment(auth, body.code);
  }

  @Post("mfa/verify")
  @UserRoute()
  @Throttle(strict)
  @HttpCode(200)
  mfaVerify(@Auth() auth: AuthState, @Body(new ZodPipe(mfaCodeSchema)) body: z.infer<typeof mfaCodeSchema>, @Ip() ip: string) {
    this.assertAdmin(auth);
    return this.mfa.verify(auth, body.code, ip);
  }

  @Post("mfa/recovery-codes")
  @UserRoute()
  @Throttle(strict)
  @HttpCode(200)
  mfaRecoveryCodes(@Auth() auth: AuthState) {
    this.assertAdmin(auth);
    return this.mfa.regenerateRecoveryCodes(auth);
  }

  private assertAdmin(auth: AuthState) {
    if (!isAdminUser({ isSuperAdmin: auth.user.isSuperAdmin, adminRole: auth.user.adminRole ?? null })) throw forbidden();
  }

  @Post("switch-tenant")
  @HttpCode(204)
  @UserRoute()
  async switchTenant(@Auth() auth: AuthState, @Body(new ZodPipe(switchTenantSchema)) body: z.infer<typeof switchTenantSchema>) {
    await this.auth.switchTenant(auth, body.tenantId);
  }

  /** Langue préférée de l'utilisateur (emails), enregistrée quand il change de langue. */
  @Post("locale")
  @HttpCode(204)
  @UserRoute()
  async setLocale(@Auth() auth: AuthState, @Body(new ZodPipe(localeSchema)) body: z.infer<typeof localeSchema>) {
    await this.auth.setLocale(auth, body.locale);
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
