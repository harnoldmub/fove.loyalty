import type { ApiScope, Permission, TenantRole } from "@fove/shared";
import type { Request } from "express";

export interface UserActor {
  type: "user";
  userId: string;
  membershipId: string | null;
  role: TenantRole | "SUPPORT";
  permissions: ReadonlySet<Permission>;
  /** null = tous les établissements. */
  establishmentIds: ReadonlySet<string> | null;
}

export interface ApiKeyActor {
  type: "apiKey";
  apiKeyId: string;
  scopes: ReadonlySet<ApiScope>;
}

/** Opération déclenchée par FOVE lui-même (tâche planifiée, inscription publique). */
export interface SystemActor {
  type: "system";
  label: "scheduler" | "public-enrollment";
}

/**
 * Contexte d'une requête rattachée à une entreprise. `tenantId` vient toujours
 * du serveur (adhésion vérifiée ou clé API), jamais d'un paramètre du navigateur.
 */
export interface TenantContext {
  tenantId: string;
  actor: UserActor | ApiKeyActor | SystemActor;
  readOnly: boolean;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  emailVerifiedAt: Date | null;
  isSuperAdmin: boolean;
}

export interface AuthState {
  sessionId: string;
  user: SessionUser;
  activeTenantId: string | null;
  supportGrantId: string | null;
}

export type AppRequest = Request & {
  auth?: AuthState;
  tenant?: TenantContext;
  requestId?: string;
};

export function actorUserId(ctx: TenantContext): string | null {
  return ctx.actor.type === "user" ? ctx.actor.userId : null;
}

export function actorApiKeyId(ctx: TenantContext): string | null {
  return ctx.actor.type === "apiKey" ? ctx.actor.apiKeyId : null;
}

export function clientIp(req: Request): string | null {
  return req.ip ?? null;
}
