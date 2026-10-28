import { applyDecorators, Injectable, UseGuards, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLE_PERMISSIONS, type ApiScope, type Permission, type TenantRole } from "@fove/shared";
import { loadConfig } from "../config";
import { sha256 } from "../common/crypto";
import { forbidden, unauthorized, paymentRequired } from "../common/errors";
import { PrismaService } from "../common/prisma.service";
import { PERMISSION_KEY, REQUIRE_VERIFIED_KEY, SCOPE_KEY } from "../common/decorators";
import type { AppRequest } from "../common/context";
import { SessionService, sessionCookieName } from "./session.service";
import { PlanService } from "../billing/plan.service";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Session par cookie. Protection CSRF : cookie SameSite=Lax + en-tête
 * personnalisé obligatoire sur toute requête qui modifie quelque chose (un
 * site tiers ne peut pas l'envoyer sans passer le contrôle CORS).
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AppRequest>();
    if (MUTATING.has(req.method) && req.headers["x-fove-csrf"] !== "1") {
      throw forbidden("En-tête anti-CSRF manquant");
    }
    const auth = await this.sessions.resolve(req.cookies?.[sessionCookieName()]);
    if (!auth) throw unauthorized();
    const needsVerified = this.reflector.getAllAndOverride<boolean>(REQUIRE_VERIFIED_KEY, [context.getHandler(), context.getClass()]);
    if (needsVerified && !auth.user.emailVerifiedAt) {
      throw forbidden("Vérifiez votre adresse email pour accéder à cette fonction");
    }
    req.auth = auth;
    return true;
  }
}

const SUPPORT_PERMISSIONS = ROLE_PERMISSIONS.VIEWER;

/** Rattache la requête à l'entreprise active, après vérification de l'adhésion. */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AppRequest>();
    const auth = req.auth;
    if (!auth) throw unauthorized();
    if (!auth.activeTenantId) throw forbidden("Aucune entreprise sélectionnée");
    const required = this.reflector.getAllAndOverride<Permission | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const tenant = await this.prisma.client.tenant.findUnique({
      where: { id: auth.activeTenantId },
      select: { id: true, status: true },
    });
    if (!tenant) throw forbidden("Entreprise introuvable");

    // Accès support : super admin, autorisation explicite, lecture seule.
    if (auth.supportGrantId) {
      const grant = await this.prisma.client.supportAccessGrant.findFirst({
        where: {
          id: auth.supportGrantId,
          tenantId: tenant.id,
          superAdminId: auth.user.id,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      if (!grant || !auth.user.isSuperAdmin) throw forbidden("Accès support expiré");
      if (MUTATING.has(req.method)) throw forbidden("Accès support en lecture seule");
      if (required && !SUPPORT_PERMISSIONS.includes(required)) throw forbidden();
      req.tenant = {
        tenantId: tenant.id,
        readOnly: true,
        actor: {
          type: "user",
          userId: auth.user.id,
          membershipId: null,
          role: "SUPPORT",
          permissions: new Set(SUPPORT_PERMISSIONS),
          establishmentIds: null,
        },
      };
      return true;
    }

    const membership = await this.prisma.client.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId: tenant.id, userId: auth.user.id } },
      include: { role: true, establishments: { select: { establishmentId: true } } },
    });
    if (!membership || membership.status !== "ACTIVE") throw forbidden("Vous n'êtes pas membre de cette entreprise");
    if (tenant.status === "SUSPENDED") throw forbidden("Compte suspendu : contactez le support FOVE");

    const permissions = new Set(membership.role.permissions as Permission[]);
    if (required && !permissions.has(required)) throw forbidden();

    req.tenant = {
      tenantId: tenant.id,
      readOnly: false,
      actor: {
        type: "user",
        userId: auth.user.id,
        membershipId: membership.id,
        role: membership.role.key as TenantRole,
        permissions,
        establishmentIds: membership.allEstablishments ? null : new Set(membership.establishments.map((e) => e.establishmentId)),
      },
    };
    return true;
  }
}

@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AppRequest>();
    if (!req.auth?.user.isSuperAdmin) throw forbidden();
    return true;
  }
}

function bearer(req: AppRequest): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7).trim();
}

/** Clé API serveur (fove_sk_…) avec scopes. Jamais de cookie ici. */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
    private readonly plans: PlanService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AppRequest>();
    const key = bearer(req);
    if (!key || !key.startsWith("fove_sk_")) throw unauthorized("Clé API secrète requise (Authorization: Bearer fove_sk_…)");
    const credential = await this.prisma.client.apiCredential.findUnique({
      where: { keyHash: sha256(key) },
      include: { tenant: { select: { status: true } } },
    });
    if (!credential || credential.revokedAt || credential.kind !== "SECRET") throw unauthorized("Clé API invalide");
    if (credential.tenant.status === "SUSPENDED") throw forbidden("Compte suspendu");
    const scope = this.reflector.getAllAndOverride<ApiScope | undefined>(SCOPE_KEY, [context.getHandler(), context.getClass()]);
    if (scope && !credential.scopes.includes(scope)) throw forbidden(`Scope manquant : ${scope}`);
    const features = await this.plans.features(credential.tenantId);
    if (!features.api) throw paymentRequired("plan_feature_unavailable", "L'API n'est pas incluse dans votre offre");

    if (!credential.lastUsedAt || Date.now() - credential.lastUsedAt.getTime() > 60_000) {
      await this.prisma.client.apiCredential.update({ where: { id: credential.id }, data: { lastUsedAt: new Date() } });
    }
    req.tenant = {
      tenantId: credential.tenantId,
      readOnly: false,
      actor: { type: "apiKey", apiKeyId: credential.id, scopes: new Set(credential.scopes as ApiScope[]) },
    };
    return true;
  }
}

/**
 * Clé publique de widget (fove_pk_…) : lecture de la configuration publique
 * seulement, depuis un domaine autorisé. Elle ne peut jamais créditer de points.
 */
@Injectable()
export class PublishableKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AppRequest>();
    const key = (req.query.key as string | undefined) ?? (req.headers["x-fove-key"] as string | undefined);
    if (!key?.startsWith("fove_pk_")) throw unauthorized("Clé publique requise");
    const credential = await this.prisma.client.apiCredential.findUnique({
      where: { keyHash: sha256(key) },
      include: { tenant: { select: { status: true } } },
    });
    if (!credential || credential.revokedAt || credential.kind !== "PUBLISHABLE") throw unauthorized("Clé publique invalide");
    if (credential.tenant.status === "SUSPENDED") throw forbidden("Compte suspendu");
    const origin = req.headers.origin;
    const allowed = credential.allowedOrigins;
    const devOrigin = !loadConfig().isProd && credential.environment === "TEST" && allowed.length === 0;
    if (!devOrigin && (!origin || !allowed.includes(origin))) throw forbidden("Domaine non autorisé pour cette clé");
    req.tenant = {
      tenantId: credential.tenantId,
      readOnly: true,
      actor: { type: "apiKey", apiKeyId: credential.id, scopes: new Set() },
    };
    return true;
  }
}

export const UserRoute = () => UseGuards(SessionGuard);
export const TenantRoute = () => applyDecorators(UseGuards(SessionGuard, TenantGuard));
export const SuperAdminRoute = () => applyDecorators(UseGuards(SessionGuard, SuperAdminGuard));
export const ApiKeyRoute = () => UseGuards(ApiKeyGuard);
