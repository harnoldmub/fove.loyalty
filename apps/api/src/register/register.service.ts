import { HttpStatus, Injectable } from "@nestjs/common";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";
import { AppError, badRequest, forbidden, notFound } from "../common/errors";
import type { AuthState, TenantContext } from "../common/context";

/** Code caisse : 5 erreurs bloquent le code 15 minutes (docs/chantier-code-caisse.md). */
const PIN_MAX_FAILURES = 5;
const PIN_LOCK_MS = 15 * 60_000;
const PIN = /^\d{4}$/;

/** Empreinte scrypt salée du code (jamais le code). */
export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${scryptSync(pin, salt, 32).toString("hex")}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(pin, Buffer.from(salt, "hex"), 32);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

/** Rôles qui encaissent (peuvent apparaître dans « Qui encaisse ? »). */
const canCash = (permissions: unknown) => Array.isArray(permissions) && permissions.includes("transactions.create");

/**
 * Mode caisse (docs/chantier-code-caisse.md) : appareil partagé, chaque collaborateur se déverrouille
 * avec son code à 4 chiffres ; les opérations portent son nom et la caisse.
 */
@Injectable()
export class RegisterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // --- Code caisse du collaborateur ---------------------------------------------------------------

  /** Le collaborateur choisit (ou change) son code dans le commerce actif. */
  async setOwnPin(ctx: TenantContext, pin: string) {
    if (ctx.actor.type !== "user" || !ctx.actor.membershipId) throw forbidden();
    if (!PIN.test(pin)) throw badRequest("invalid_pin", "Le code caisse fait 4 chiffres");
    if (/^(\d)\1{3}$/.test(pin) || ["1234", "4321", "0123", "9876"].includes(pin)) throw badRequest("weak_pin", "Choisissez un code moins facile à deviner");
    await this.prisma.client.tenantMembership.update({
      where: { id: ctx.actor.membershipId },
      data: { cashierPinHash: hashPin(pin), cashierPinSetAt: new Date(), cashierPinFailures: 0, cashierPinLockedUntil: null },
    });
    await this.audit.forTenant(ctx, "register.pin_set", { type: "membership", id: ctx.actor.membershipId });
    return { pinSet: true };
  }

  /** Réinitialisation par le propriétaire ou un gérant : le collaborateur choisira un nouveau code. */
  async resetPin(ctx: TenantContext, membershipId: string) {
    if (ctx.actor.type !== "user" || (ctx.actor.role !== "OWNER" && ctx.actor.role !== "MANAGER")) throw forbidden();
    const { count } = await this.prisma.client.tenantMembership.updateMany({
      where: { id: membershipId, tenantId: ctx.tenantId },
      data: { cashierPinHash: null, cashierPinSetAt: null, cashierPinFailures: 0, cashierPinLockedUntil: null },
    });
    if (count === 0) throw notFound("Collaborateur");
    // Caisse ouverte à son nom : verrouillée.
    await this.prisma.client.session.updateMany({ where: { registerMembershipId: membershipId }, data: { registerMembershipId: null } });
    await this.audit.forTenant(ctx, "register.pin_reset", { type: "membership", id: membershipId });
  }

  // --- Caisses ------------------------------------------------------------------------------------

  /** « Utiliser cet appareil comme caisse » : la session de l'appareil devient une session de caisse. */
  async activate(ctx: TenantContext, auth: AuthState, input: { name: string; establishmentId?: string | null }) {
    if (ctx.actor.type !== "user" || (ctx.actor.role !== "OWNER" && ctx.actor.role !== "MANAGER")) throw forbidden("Réservé au propriétaire et aux gérants");
    if (input.establishmentId) {
      const est = await this.prisma.client.establishment.findFirst({ where: { id: input.establishmentId, tenantId: ctx.tenantId, active: true } });
      if (!est) throw notFound("Établissement");
    }
    const device = await this.prisma.client.registerDevice.create({
      data: { tenantId: ctx.tenantId, establishmentId: input.establishmentId ?? null, name: input.name.trim(), createdByUserId: ctx.actor.userId },
    });
    await this.prisma.client.session.update({
      where: { id: auth.sessionId },
      data: { registerDeviceId: device.id, registerMembershipId: null, registerActiveAt: null, activeTenantId: ctx.tenantId, supportGrantId: null },
    });
    await this.audit.forTenant(ctx, "register.activated", { type: "register", id: device.id }, { name: device.name });
    return { id: device.id };
  }

  /** État de la caisse (verrouillée ou non) et collaborateurs qui peuvent l'ouvrir. */
  async state(auth: AuthState) {
    const register = auth.register!;
    const db = this.prisma.client;
    const device = await db.registerDevice.findUniqueOrThrow({
      where: { id: register.deviceId },
      include: { tenant: { select: { id: true, name: true, settings: { select: { logoUrl: true, primaryColor: true, registerLockMinutes: true } } } } },
    });
    const establishment = device.establishmentId ? await db.establishment.findUnique({ where: { id: device.establishmentId }, select: { name: true } }) : null;
    const memberships = await db.tenantMembership.findMany({
      where: { tenantId: device.tenantId, status: "ACTIVE", cashierPinHash: { not: null } },
      include: { user: { select: { name: true } }, role: { select: { key: true, permissions: true } }, establishments: { select: { establishmentId: true } } },
      orderBy: { createdAt: "asc" },
    });
    const cashiers = memberships
      .filter((m) => canCash(m.role.permissions))
      .filter((m) => !device.establishmentId || m.allEstablishments || m.establishments.some((e) => e.establishmentId === device.establishmentId))
      .map((m) => ({ membershipId: m.id, name: m.user.name, role: m.role.key }));
    const lockMinutes = device.tenant.settings?.registerLockMinutes ?? 5;
    const unlocked = register.membershipId && register.activeAt && Date.now() - register.activeAt.getTime() < lockMinutes * 60_000;
    const current = unlocked ? cashiers.find((c) => c.membershipId === register.membershipId) ?? null : null;
    return {
      device: { id: device.id, name: device.name, establishment: establishment?.name ?? null },
      tenant: { id: device.tenant.id, name: device.tenant.name, logoUrl: device.tenant.settings?.logoUrl ?? null, primaryColor: device.tenant.settings?.primaryColor ?? null },
      lockMinutes,
      cashiers,
      current,
    };
  }

  /** Déverrouillage par le code du caissier choisi. */
  async unlock(auth: AuthState, membershipId: string, pin: string, ip?: string) {
    const register = auth.register!;
    const db = this.prisma.client;
    const device = await db.registerDevice.findUniqueOrThrow({ where: { id: register.deviceId } });
    const membership = await db.tenantMembership.findFirst({ where: { id: membershipId, tenantId: device.tenantId, status: "ACTIVE" } });
    if (!membership?.cashierPinHash) throw badRequest("invalid_pin", "Code incorrect");
    if (membership.cashierPinLockedUntil && membership.cashierPinLockedUntil > new Date()) {
      throw new AppError(HttpStatus.TOO_MANY_REQUESTS, "pin_locked", "Trop d'essais : code bloqué 15 minutes");
    }
    if (!PIN.test(pin) || !verifyPin(pin, membership.cashierPinHash)) {
      const failed = await db.tenantMembership.update({ where: { id: membership.id }, data: { cashierPinFailures: { increment: 1 } } });
      if (failed.cashierPinFailures >= PIN_MAX_FAILURES) {
        await db.tenantMembership.update({ where: { id: membership.id }, data: { cashierPinFailures: 0, cashierPinLockedUntil: new Date(Date.now() + PIN_LOCK_MS) } });
        await this.audit.log({ tenantId: device.tenantId, action: "register.pin_locked", targetType: "membership", targetId: membership.id, metadata: { register: device.id }, ip });
      }
      throw badRequest("invalid_pin", "Code incorrect");
    }
    await db.tenantMembership.update({ where: { id: membership.id }, data: { cashierPinFailures: 0, cashierPinLockedUntil: null } });
    await db.session.update({ where: { id: auth.sessionId }, data: { registerMembershipId: membership.id, registerActiveAt: new Date() } });
    await this.audit.log({ tenantId: device.tenantId, actorUserId: membership.userId, action: "register.unlocked", targetType: "register", targetId: device.id, ip });
    return this.state({ ...auth, register: { ...register, membershipId: membership.id, activeAt: new Date() } });
  }

  async lock(auth: AuthState) {
    await this.prisma.client.session.update({ where: { id: auth.sessionId }, data: { registerMembershipId: null, registerActiveAt: null } });
  }

  /** Caisses du commerce (Équipe). */
  async list(tenantId: string) {
    const devices = await this.prisma.client.registerDevice.findMany({ where: { tenantId, revokedAt: null }, orderBy: { createdAt: "desc" } });
    const establishments = await this.prisma.client.establishment.findMany({ where: { tenantId }, select: { id: true, name: true } });
    return devices.map((d) => ({ id: d.id, name: d.name, establishment: establishments.find((e) => e.id === d.establishmentId)?.name ?? null, createdAt: d.createdAt, lastSeenAt: d.lastSeenAt }));
  }

  /** Retirer une caisse : l'appareil est déconnecté tout de suite. */
  async revoke(ctx: TenantContext, id: string) {
    if (ctx.actor.type !== "user" || (ctx.actor.role !== "OWNER" && ctx.actor.role !== "MANAGER")) throw forbidden();
    const { count } = await this.prisma.client.registerDevice.updateMany({ where: { id, tenantId: ctx.tenantId, revokedAt: null }, data: { revokedAt: new Date() } });
    if (count === 0) throw notFound("Caisse");
    await this.prisma.client.session.deleteMany({ where: { registerDeviceId: id } });
    await this.audit.forTenant(ctx, "register.revoked", { type: "register", id });
  }

  /** Réglage du verrouillage automatique (minutes). */
  async setLockMinutes(ctx: TenantContext, minutes: number) {
    await this.prisma.client.tenantSettings.update({ where: { tenantId: ctx.tenantId }, data: { registerLockMinutes: minutes } });
    await this.audit.forTenant(ctx, "register.lock_minutes", undefined, { minutes });
    return { lockMinutes: minutes };
  }
}
