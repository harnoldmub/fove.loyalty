import { Injectable } from "@nestjs/common";
import type { Request, Response } from "express";
import { normalizeEmail, type TenantRole, inviteMemberSchema, updateMemberSchema, acceptInviteSchema } from "@fove/shared";
import type { z } from "zod";
import { loadConfig } from "../config";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";
import { hashPassword, randomToken, sha256 } from "../common/crypto";
import { badRequest, conflict, forbidden, notFound } from "../common/errors";
import type { AuthState, TenantContext } from "../common/context";
import { EmailService } from "../notifications/email.service";
import { PlanService } from "../billing/plan.service";
import { SessionService } from "../auth/session.service";
import { systemRoleId } from "./tenants.service";

@Injectable()
export class TeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly plans: PlanService,
    private readonly sessions: SessionService,
  ) {}

  async list(ctx: TenantContext) {
    const [members, invitations] = await Promise.all([
      this.prisma.client.tenantMembership.findMany({
        where: { tenantId: ctx.tenantId },
        include: { user: { select: { id: true, name: true, email: true } }, role: true, establishments: true },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.client.invitation.findMany({
        where: { tenantId: ctx.tenantId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        include: { role: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    return {
      members: members.map((m) => ({
        id: m.id,
        user: m.user,
        role: m.role.key,
        status: m.status,
        allEstablishments: m.allEstablishments,
        establishmentIds: m.establishments.map((e) => e.establishmentId),
      })),
      invitations: invitations.map((i) => ({ id: i.id, email: i.email, role: i.role.key, expiresAt: i.expiresAt })),
    };
  }

  private async assertEstablishments(tenantId: string, ids: string[]) {
    if (ids.length === 0) return;
    const count = await this.prisma.client.establishment.count({ where: { tenantId, id: { in: ids } } });
    if (count !== ids.length) throw badRequest("invalid_establishment", "Établissement inconnu");
  }

  async invite(ctx: TenantContext, input: z.infer<typeof inviteMemberSchema>) {
    await this.plans.assertQuota(ctx.tenantId, "staff");
    await this.assertEstablishments(ctx.tenantId, input.establishmentIds);
    const email = normalizeEmail(input.email);
    const existing = await this.prisma.client.tenantMembership.findFirst({ where: { tenantId: ctx.tenantId, user: { email } } });
    if (existing) throw conflict("already_member", "Cette personne fait déjà partie de l'équipe");

    const token = randomToken("", 32);
    const tenant = await this.prisma.client.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } });
    const invitation = await this.prisma.client.invitation.create({
      data: {
        tenantId: ctx.tenantId,
        email,
        roleId: await systemRoleId(this.prisma, input.role),
        establishmentIds: input.establishmentIds,
        tokenHash: sha256(token),
        invitedById: ctx.actor.type === "user" ? ctx.actor.userId : "",
        expiresAt: new Date(Date.now() + 7 * 86_400_000),
      },
    });
    await this.email.send({
      to: email,
      subject: `Invitation à rejoindre ${tenant.name} sur FOVE`,
      text: `Vous êtes invité(e) à rejoindre l'équipe ${tenant.name} sur FOVE.\n\nAcceptez l'invitation (valable 7 jours) :\n${loadConfig().APP_URL}/invite?token=${token}`,
    });
    await this.audit.forTenant(ctx, "member.invited", { type: "invitation", id: invitation.id }, { email, role: input.role });
    return { id: invitation.id };
  }

  async revokeInvitation(ctx: TenantContext, id: string) {
    const { count } = await this.prisma.client.invitation.updateMany({
      where: { id, tenantId: ctx.tenantId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) throw notFound("Invitation");
    await this.audit.forTenant(ctx, "member.invitation_revoked", { type: "invitation", id });
  }

  async previewInvitation(token: string) {
    const invitation = await this.findValidInvitation(token);
    const account = await this.prisma.client.user.findUnique({ where: { email: invitation.email }, select: { id: true } });
    return { email: invitation.email, tenantName: invitation.tenant.name, role: invitation.role.key, hasAccount: Boolean(account) };
  }

  private async findValidInvitation(token: string) {
    if (token.length < 20) throw badRequest("invalid_token", "Invitation invalide");
    const invitation = await this.prisma.client.invitation.findUnique({
      where: { tokenHash: sha256(token) },
      include: { tenant: true, role: true },
    });
    if (!invitation || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt < new Date()) {
      throw badRequest("invalid_token", "Invitation invalide ou expirée");
    }
    return invitation;
  }

  async acceptInvitation(input: z.infer<typeof acceptInviteSchema>, state: AuthState | null, req: Request, res: Response) {
    const invitation = await this.findValidInvitation(input.token);
    let userId: string;
    const existingUser = await this.prisma.client.user.findUnique({ where: { email: invitation.email } });
    if (existingUser) {
      // Un compte existant doit être connecté pour accepter.
      if (!state || state.user.id !== existingUser.id) throw forbidden("Connectez-vous avec l'adresse invitée pour accepter");
      userId = existingUser.id;
    } else {
      if (!input.name || !input.password) throw badRequest("account_required", "Nom et mot de passe requis");
      const user = await this.prisma.client.user.create({
        data: {
          email: invitation.email,
          name: input.name,
          passwordHash: await hashPassword(input.password),
          // L'accès à la boîte mail est prouvé par le lien d'invitation.
          emailVerifiedAt: new Date(),
        },
      });
      userId = user.id;
    }

    await this.prisma.client.$transaction(async (tx) => {
      const { count } = await tx.invitation.updateMany({
        where: { id: invitation.id, acceptedAt: null },
        data: { acceptedAt: new Date() },
      });
      if (count === 0) throw badRequest("invalid_token", "Invitation déjà utilisée");
      const membership = await tx.tenantMembership.upsert({
        where: { tenantId_userId: { tenantId: invitation.tenantId, userId } },
        update: { roleId: invitation.roleId, status: "ACTIVE" },
        create: {
          tenantId: invitation.tenantId,
          userId,
          roleId: invitation.roleId,
          allEstablishments: invitation.establishmentIds.length === 0,
        },
      });
      if (invitation.establishmentIds.length > 0) {
        await tx.membershipEstablishment.deleteMany({ where: { membershipId: membership.id } });
        await tx.membershipEstablishment.createMany({
          data: invitation.establishmentIds.map((establishmentId) => ({ tenantId: invitation.tenantId, membershipId: membership.id, establishmentId })),
        });
      }
    });

    if (state) {
      await this.prisma.client.session.update({ where: { id: state.sessionId }, data: { activeTenantId: invitation.tenantId } });
    } else {
      await this.sessions.create(userId, req, res, invitation.tenantId);
    }
    await this.audit.log({ tenantId: invitation.tenantId, actorUserId: userId, action: "member.joined", targetType: "invitation", targetId: invitation.id });
    return { tenantId: invitation.tenantId };
  }

  async updateMember(ctx: TenantContext, membershipId: string, input: z.infer<typeof updateMemberSchema>) {
    const membership = await this.prisma.client.tenantMembership.findFirst({
      where: { id: membershipId, tenantId: ctx.tenantId },
      include: { role: true },
    });
    if (!membership) throw notFound("Collaborateur");
    if (membership.role.key === "OWNER" || input.role === "OWNER") {
      if (ctx.actor.type !== "user" || ctx.actor.role !== "OWNER") throw forbidden("Seul un propriétaire peut modifier un propriétaire");
      if (membership.role.key === "OWNER" && input.role && input.role !== "OWNER") await this.assertAnotherOwner(ctx.tenantId, membershipId);
    }
    if (input.establishmentIds) await this.assertEstablishments(ctx.tenantId, input.establishmentIds);

    await this.prisma.client.$transaction(async (tx) => {
      if (input.role) {
        await tx.tenantMembership.update({ where: { id: membershipId }, data: { roleId: await systemRoleId(this.prisma, input.role as TenantRole) } });
      }
      if (input.establishmentIds) {
        await tx.membershipEstablishment.deleteMany({ where: { membershipId } });
        await tx.tenantMembership.update({ where: { id: membershipId }, data: { allEstablishments: input.establishmentIds.length === 0 } });
        await tx.membershipEstablishment.createMany({
          data: input.establishmentIds.map((establishmentId) => ({ tenantId: ctx.tenantId, membershipId, establishmentId })),
        });
      }
    });
    await this.audit.forTenant(ctx, "member.updated", { type: "membership", id: membershipId }, input);
  }

  async setStatus(ctx: TenantContext, membershipId: string, status: "ACTIVE" | "DISABLED") {
    const membership = await this.prisma.client.tenantMembership.findFirst({
      where: { id: membershipId, tenantId: ctx.tenantId },
      include: { role: true },
    });
    if (!membership) throw notFound("Collaborateur");
    if (ctx.actor.type === "user" && membership.userId === ctx.actor.userId) throw badRequest("self", "Vous ne pouvez pas modifier votre propre accès");
    if (membership.role.key === "OWNER") {
      if (ctx.actor.type !== "user" || ctx.actor.role !== "OWNER") throw forbidden();
      if (status === "DISABLED") await this.assertAnotherOwner(ctx.tenantId, membershipId);
    }
    await this.prisma.client.tenantMembership.update({ where: { id: membershipId }, data: { status } });
    await this.audit.forTenant(ctx, status === "DISABLED" ? "member.disabled" : "member.enabled", { type: "membership", id: membershipId });
  }

  private async assertAnotherOwner(tenantId: string, exceptMembershipId: string) {
    const owners = await this.prisma.client.tenantMembership.count({
      where: { tenantId, status: "ACTIVE", role: { key: "OWNER" }, id: { not: exceptMembershipId } },
    });
    if (owners === 0) throw badRequest("last_owner", "L'entreprise doit garder au moins un propriétaire");
  }
}
