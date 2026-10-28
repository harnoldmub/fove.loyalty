import { createParamDecorator, SetMetadata, type ExecutionContext } from "@nestjs/common";
import type { ApiScope, Permission } from "@fove/shared";
import type { AppRequest, AuthState, TenantContext } from "./context";

export const PERMISSION_KEY = "fove:permission";
export const SCOPE_KEY = "fove:scope";
export const REQUIRE_VERIFIED_KEY = "fove:require-verified";

/** Permission requise sur une route d'entreprise (vérifiée par TenantGuard). */
export const RequirePermission = (permission: Permission) => SetMetadata(PERMISSION_KEY, permission);
/** Scope requis pour une clé API serveur (vérifié par ApiKeyGuard). */
export const RequireScope = (scope: ApiScope) => SetMetadata(SCOPE_KEY, scope);
/** Route réservée aux comptes dont l'email est vérifié (clés API, facturation…). */
export const RequireVerified = () => SetMetadata(REQUIRE_VERIFIED_KEY, true);

export const Tenant = createParamDecorator((_: unknown, ctx: ExecutionContext): TenantContext => {
  const req = ctx.switchToHttp().getRequest<AppRequest>();
  if (!req.tenant) throw new Error("TenantGuard manquant sur cette route");
  return req.tenant;
});

export const Auth = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthState => {
  const req = ctx.switchToHttp().getRequest<AppRequest>();
  if (!req.auth) throw new Error("SessionGuard manquant sur cette route");
  return req.auth;
});
