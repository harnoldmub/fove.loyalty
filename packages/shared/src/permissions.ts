/**
 * Rôles et permissions FOVE. La vérification se fait toujours côté serveur ;
 * le front s'en sert seulement pour masquer les actions indisponibles.
 */
export const TENANT_ROLES = ["OWNER", "MANAGER", "CASHIER", "VIEWER"] as const;
export type TenantRole = (typeof TENANT_ROLES)[number];

export const PERMISSIONS = [
  "tenant.read",
  "tenant.update",
  "establishments.read",
  "establishments.write",
  "members.read",
  "members.write",
  "customers.read",
  "customers.write",
  "customers.import",
  "customers.export",
  "customers.delete",
  "programs.read",
  "programs.write",
  "rewards.read",
  "rewards.write",
  "transactions.read",
  "transactions.create",
  "transactions.reverse",
  "redemptions.create",
  "redemptions.cancel",
  "analytics.read",
  "integrations.read",
  "integrations.write",
  "billing.read",
  "billing.write",
  "audit.read",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const VIEWER: Permission[] = [
  "tenant.read",
  "establishments.read",
  "customers.read",
  "programs.read",
  "rewards.read",
  "transactions.read",
  "analytics.read",
];

const CASHIER: Permission[] = [
  "tenant.read",
  "establishments.read",
  "customers.read",
  "customers.write",
  "programs.read",
  "rewards.read",
  "transactions.read",
  "transactions.create",
  "redemptions.create",
];

const MANAGER: Permission[] = [
  ...new Set<Permission>([
    ...VIEWER,
    ...CASHIER,
    "establishments.write",
    "members.read",
    "customers.import",
    "customers.export",
    "programs.write",
    "rewards.write",
    "transactions.reverse",
    "redemptions.cancel",
    "integrations.read",
    "billing.read",
    "audit.read",
  ]),
];

export const ROLE_PERMISSIONS: Record<TenantRole, readonly Permission[]> = {
  OWNER: PERMISSIONS,
  MANAGER,
  CASHIER,
  VIEWER,
};

export function roleHasPermission(role: TenantRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** Scopes des clés API serveur. Une clé publique de widget n'a aucun de ces scopes. */
export const API_SCOPES = [
  "customers:read",
  "customers:write",
  "programs:read",
  "loyalty:read",
  "loyalty:write",
  "rewards:read",
  "redemptions:write",
  "integrations:write",
] as const;
export type ApiScope = (typeof API_SCOPES)[number];
