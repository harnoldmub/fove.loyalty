import { applyDecorators, HttpStatus, Injectable, UseGuards, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLE_PERMISSIONS, type ApiScope, type Permission, type TenantRole } from "@fove/shared";
import { loadConfig } from "../config";
import { sha256 } from "../common/crypto";
import { AppError, forbidden, unauthorized, paymentRequired } from "../common/errors";
import { PrismaService } from "../common/prisma.service";
import { PERMISSION_KEY, REGISTER_KEY, REQUIRE_VERIFIED_KEY, SCOPE_KEY } from "../common/decorators";
import type { AppRequest, AuthState } from "../common/context";
import { SessionService, sessionCookieName } from "./session.service";
import { PlanService } from "../billing/plan.service";
import { MfaService } from "./mfa.service";

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
    // Session de caisse : seulement les routes prévues pour la caisse (docs/chantier-code-caisse.md).
    if (auth.register && !this.reflector.getAllAndOverride<string>(REGISTER_KEY, [context.getHandler(), context.getClass()])) {
      throw new AppError(HttpStatus.FORBIDDEN, "register_mode", "Fonction indisponible sur une caisse");
    }
    const needsVerified = this.reflector.getAllAndOverride<boolean>(REQUIRE_VERIFIED_KEY, [context.getHandler(), context.getClass()]);
    if (needsVerified && !auth.user.emailVerifiedAt) {
      // Code dédié : le site affiche « confirmez votre email » au lieu de renvoyer vers la connexion.
      throw new AppError(HttpStatus.FORBIDDEN, "email_not_verified", "Vérifiez votre adresse email pour accéder à cette fonction");
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
    if (auth.register) return this.registerContext(context, req, auth);
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

  /**
   * Caisse : le commerce et l'établissement de la caisse, au nom du caissier déverrouillé par son code
   * (permissions de son rôle, plus les annulations, ouvertes à tout caissier sur la caisse).
   */
  private async registerContext(context: ExecutionContext, req: AppRequest, auth: AuthState): Promise<boolean> {
    const register = auth.register!;
    const db = this.prisma.client;
    const device = await db.registerDevice.findUnique({ where: { id: register.deviceId }, include: { tenant: { select: { status: true, settings: { select: { registerLockMinutes: true } } } } } });
    if (!device || device.revokedAt) throw unauthorized();
    if (device.tenant.status === "SUSPENDED") throw forbidden("Compte suspendu : contactez le support FOVE");
    const lockMs = (device.tenant.settings?.registerLockMinutes ?? 5) * 60_000;
    const now = Date.now();
    const unlocked = register.membershipId && register.activeAt && now - register.activeAt.getTime() < lockMs;
    if (!unlocked) throw new AppError(HttpStatus.FORBIDDEN, "register_locked", "Caisse verrouillée : saisissez votre code");
    const membership = await db.tenantMembership.findFirst({
      where: { id: register.membershipId!, tenantId: device.tenantId, status: "ACTIVE", cashierPinHash: { not: null } },
      include: { role: true, establishments: { select: { establishmentId: true } } },
    });
    if (!membership) throw new AppError(HttpStatus.FORBIDDEN, "register_locked", "Caisse verrouillée : saisissez votre code");
    const permissions = new Set<Permission>([...(membership.role.permissions as Permission[]), "transactions.reverse", "redemptions.cancel"]);
    const required = this.reflector.getAllAndOverride<Permission | undefined>(PERMISSION_KEY, [context.getHandler(), context.getClass()]);
    if (required && !permissions.has(required)) throw forbidden();
    if (now - register.activeAt!.getTime() > REGISTER_TOUCH_MS) {
      await db.session.update({ where: { id: auth.sessionId }, data: { registerActiveAt: new Date(now) } });
    }
    req.tenant = {
      tenantId: device.tenantId,
      readOnly: false,
      actor: {
        type: "user",
        userId: membership.userId,
        membershipId: membership.id,
        role: membership.role.key as TenantRole,
        permissions,
        establishmentIds: device.establishmentId ? new Set([device.establishmentId]) : membership.allEstablishments ? null : new Set(membership.establishments.map((e) => e.establishmentId)),
        registerDeviceId: device.id,
      },
    };
    return true;
  }
}

/** Délai minimal entre deux enregistrements de l'activité d'un caissier (verrouillage automatique). */
const REGISTER_TOUCH_MS = 30_000;

@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AppRequest>();
    if (!req.auth?.user.isSuperAdmin) throw forbidden();
    return true;
  }
}

/**
 * Accès réservé aux associés et à la direction financière :
 * - Super Administrateurs (isSuperAdmin = true)
 * - Associés (adminRole = ASSOCIATE)
 * - Responsables financiers (adminRole = FINANCE_MANAGER)
 */
@Injectable()
export class FinanceAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AppRequest>();
    const user = req.auth?.user;
    if (!user) throw forbidden();
    if (user.isSuperAdmin) return true;
    const role = user.adminRole;
    if (role === "SUPER_ADMIN" || role === "ASSOCIATE" || role === "FINANCE_MANAGER") {
      return true;
    }
    throw forbidden("Accès réservé aux associés et à la direction financière");
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

@Injectable()
export class PartnerGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ auth?: AuthState }>();
    const auth = req.auth;
    if (!auth?.user) throw unauthorized();
    if (auth.user.isSuperAdmin) return true;

    // Rattachement par email seulement si l'email du compte est confirmé, et à un profil encore libre.
    const byEmail = auth.user.emailVerifiedAt ? [{ email: { equals: auth.user.email, mode: "insensitive" as const }, userId: null }] : [];
    const partner = await this.prisma.client.partner.findFirst({
      where: {
        OR: [{ userId: auth.user.id }, ...byEmail],
        status: { in: ["APPROVED", "ACTIVE"] },
      },
      select: { id: true, userId: true },
    });

    if (!partner) {
      throw forbidden("Espace réservé aux partenaires FOVE validés");
    }

    if (!partner.userId) {
      await this.prisma.client.partner.updateMany({
        where: { id: partner.id, userId: null },
        data: { userId: auth.user.id },
      });
      await this.prisma.client.user.update({
        where: { id: auth.user.id },
        data: { isPartner: true },
      });
    }

    return true;
  }
}

/**
 * Double authentification des admins : application activée et vérifiée sur cette session depuis
 * moins de 12 h (MFA_ADMIN_HOURS). Codes dédiés pour que l'administration affiche le bon écran.
 */
@Injectable()
export class AdminMfaGuard implements CanActivate {
  constructor(private readonly mfa: MfaService) {}

  canActivate(context: ExecutionContext): boolean {
    const auth = context.switchToHttp().getRequest<AppRequest>().auth;
    if (!auth) throw unauthorized();
    if (!this.mfa.isRequired(auth.user)) return true;
    if (!auth.user.totpEnabledAt) throw new AppError(HttpStatus.FORBIDDEN, "mfa_setup_required", "Activez la double authentification pour accéder à l'administration");
    if (!this.mfa.isFresh(auth)) throw new AppError(HttpStatus.FORBIDDEN, "mfa_required", "Saisissez le code de votre application d'authentification");
    return true;
  }
}

export const UserRoute = () => UseGuards(SessionGuard);
export const TenantRoute = () => applyDecorators(UseGuards(SessionGuard, TenantGuard));
export const SuperAdminRoute = () => applyDecorators(UseGuards(SessionGuard, SuperAdminGuard, AdminMfaGuard));
export const FinanceRoute = () => applyDecorators(UseGuards(SessionGuard, FinanceAccessGuard, AdminMfaGuard));
export const PartnerRoute = () => applyDecorators(UseGuards(SessionGuard, PartnerGuard));
export const ApiKeyRoute = () => UseGuards(ApiKeyGuard);
