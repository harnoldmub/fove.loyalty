import { CardsService } from "../cards/cards.service";
import { Injectable } from "@nestjs/common";
import type { OperationSource, Prisma } from "@fove/database";
import { computeRewardDiscount, redeemSchema, rewardSchema, updateRewardSchema } from "@fove/shared";
import type { z } from "zod";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";
import { conflict, isUniqueViolation, notFound, unprocessable } from "../common/errors";
import { actorUserId, type TenantContext } from "../common/context";
import { LedgerService } from "../loyalty/ledger.service";
import { WebhooksService } from "../notifications/webhooks.service";
import { assertEstablishmentAccess } from "../tenants/tenants.service";

@Injectable()
export class RewardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
    private readonly webhooks: WebhooksService,
    private readonly cards: CardsService,
  ) {}

  list(ctx: TenantContext, programId?: string) {
    return this.prisma.client.reward.findMany({
      where: { tenantId: ctx.tenantId, archivedAt: null, ...(programId ? { programId } : {}) },
      orderBy: [{ programId: "asc" }, { cost: "asc" }],
      include: { _count: { select: { redemptions: { where: { status: "COMPLETED" } } } } },
    });
  }

  async create(ctx: TenantContext, input: z.infer<typeof rewardSchema>) {
    const program = await this.prisma.client.loyaltyProgram.findFirst({ where: { id: input.programId, tenantId: ctx.tenantId } });
    if (!program) throw notFound("Programme");
    const reward = await this.prisma.client.reward.create({
      data: {
        ...input,
        value: input.kind === "GIFT" ? null : input.value,
        tenantId: ctx.tenantId,
        availableFrom: input.availableFrom ? new Date(input.availableFrom) : null,
        availableUntil: input.availableUntil ? new Date(input.availableUntil) : null,
      },
    });
    await this.audit.forTenant(ctx, "reward.created", { type: "reward", id: reward.id });
    await this.cards.refreshProgramWallet(ctx.tenantId, reward.programId);
    return reward;
  }

  async update(ctx: TenantContext, id: string, input: z.infer<typeof updateRewardSchema>) {
    const current = await this.prisma.client.reward.findFirst({ where: { id, tenantId: ctx.tenantId, archivedAt: null } });
    if (!current) throw notFound("Récompense");
    const merged = rewardSchema.safeParse({ ...current, value: current.value?.toString() ?? null, availableFrom: current.availableFrom?.toISOString() ?? null, availableUntil: current.availableUntil?.toISOString() ?? null, ...input });
    if (!merged.success) throw unprocessable("invalid_reward", merged.error.issues.map((i) => i.message).join(" "));
    const data: Prisma.RewardUpdateManyMutationInput = {
      ...input,
      value: merged.data.kind === "GIFT" ? null : merged.data.value,
      availableFrom: input.availableFrom === undefined ? undefined : input.availableFrom ? new Date(input.availableFrom) : null,
      availableUntil: input.availableUntil === undefined ? undefined : input.availableUntil ? new Date(input.availableUntil) : null,
    };
    const { count } = await this.prisma.client.reward.updateMany({ where: { id, tenantId: ctx.tenantId, archivedAt: null }, data });
    if (count === 0) throw notFound("Récompense");
    await this.audit.forTenant(ctx, "reward.updated", { type: "reward", id }, { fields: Object.keys(input) });
    await this.cards.refreshProgramWallet(ctx.tenantId, current.programId);
    return this.prisma.client.reward.findFirst({ where: { id, tenantId: ctx.tenantId } });
  }

  /** Archivage : la récompense disparaît du catalogue, son historique reste. */
  async archive(ctx: TenantContext, id: string) {
    const { count } = await this.prisma.client.reward.updateMany({
      where: { id, tenantId: ctx.tenantId, archivedAt: null },
      data: { archivedAt: new Date(), active: false },
    });
    if (count === 0) throw notFound("Récompense");
    await this.audit.forTenant(ctx, "reward.archived", { type: "reward", id });
    await this.cards.refreshProgramWallet(ctx.tenantId);
  }

  /**
   * Utilisation d'une récompense : débit des points, décrément du stock et
   * trace d'utilisation dans une seule transaction. Une même clé d'idempotence
   * ne débite jamais deux fois ; deux utilisations simultanées ne peuvent pas
   * dépasser le solde ni le stock.
   */
  async redeem(ctx: TenantContext, input: z.infer<typeof redeemSchema>, source: OperationSource) {
    assertEstablishmentAccess(ctx, input.establishmentId);
    const replay = () =>
      this.prisma.client.rewardRedemption.findUniqueOrThrow({
        where: { tenantId_idempotencyKey: { tenantId: ctx.tenantId, idempotencyKey: input.idempotencyKey } },
      });
    const existing = await this.prisma.client.rewardRedemption.findUnique({
      where: { tenantId_idempotencyKey: { tenantId: ctx.tenantId, idempotencyKey: input.idempotencyKey } },
    });
    if (existing) return { redemption: existing, replayed: true };

    const ledgerKey = `redeem:${input.idempotencyKey}`;
    try {
      const redemption = await this.prisma.client.$transaction(async (tx) => {
        const account = await tx.loyaltyAccount.findFirst({ where: { id: input.accountId, tenantId: ctx.tenantId } });
        if (!account) throw notFound("Carte");
        const reward = await tx.reward.findFirst({
          where: { id: input.rewardId, tenantId: ctx.tenantId, programId: account.programId, archivedAt: null },
        });
        if (!reward) throw notFound("Récompense");
        const program = await tx.loyaltyProgram.findUniqueOrThrow({ where: { id: account.programId } });
        if (!program.active) throw unprocessable("program_inactive", "Programme désactivé");
        if (input.establishmentId && !await tx.establishment.findFirst({ where: { id: input.establishmentId, tenantId: ctx.tenantId, active: true } })) throw notFound("Établissement");
        let discountAmount: string | null;
        try { discountAmount = computeRewardDiscount({ kind: reward.kind, value: reward.value?.toString() ?? null }, input.purchaseAmount); }
        catch (error) { throw unprocessable("invalid_purchase", error instanceof Error ? error.message : "Montant invalide"); }
        const now = new Date();
        if (!reward.active) throw unprocessable("reward_inactive", "Récompense désactivée");
        if ((reward.availableFrom && reward.availableFrom > now) || (reward.availableUntil && reward.availableUntil < now)) {
          throw unprocessable("reward_unavailable", "Récompense hors période de disponibilité");
        }
        if (reward.stock !== null) {
          const { count } = await tx.reward.updateMany({ where: { id: reward.id, stock: { gt: 0 } }, data: { stock: { decrement: 1 } } });
          if (count === 0) throw unprocessable("out_of_stock", "Récompense épuisée");
        }
        const { transaction } = await this.ledger.post(
          ctx,
          {
            accountId: account.id,
            kind: "REDEMPTION",
            delta: -reward.cost,
            idempotencyKey: ledgerKey,
            source,
            reason: reward.name,
            establishmentId: input.establishmentId,
          },
          tx,
        );
        return tx.rewardRedemption.create({
          data: {
            tenantId: ctx.tenantId,
            accountId: account.id,
            rewardId: reward.id,
            rewardName: reward.name,
            rewardKind: reward.kind,
            rewardValue: reward.value,
            purchaseAmount: reward.kind === "GIFT" ? null : input.purchaseAmount,
            discountAmount,
            currency: program.currency,
            cost: reward.cost,
            transactionId: transaction.id,
            idempotencyKey: input.idempotencyKey,
            establishmentId: input.establishmentId,
            actorUserId: actorUserId(ctx),
          },
        });
      });
      await this.audit.forTenant(ctx, "redemption.created", { type: "redemption", id: redemption.id }, { reward: redemption.rewardName });
      await this.webhooks.emit(ctx.tenantId, "redemption.created", {
        id: redemption.id,
        accountId: redemption.accountId,
        rewardId: redemption.rewardId,
        cost: redemption.cost,
        discountAmount: redemption.discountAmount?.toString() ?? null,
        currency: redemption.currency,
      });
      this.cards.refreshWallet(ctx.tenantId, redemption.accountId);
      return { redemption, replayed: false };
    } catch (error) {
      if (isUniqueViolation(error)) return { redemption: await replay(), replayed: true };
      throw error;
    }
  }

  /** Annulation autorisée : écriture compensatoire et remise en stock, une seule fois. */
  async cancel(ctx: TenantContext, redemptionId: string, reason: string) {
    const redemption = await this.prisma.client.$transaction(async (tx) => {
      const current = await tx.rewardRedemption.findFirst({ where: { id: redemptionId, tenantId: ctx.tenantId } });
      if (!current) throw notFound("Utilisation");
      const { count } = await tx.rewardRedemption.updateMany({
        where: { id: redemptionId, status: "COMPLETED" },
        data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: actorUserId(ctx), cancelReason: reason },
      });
      if (count === 0) throw conflict("already_cancelled", "Utilisation déjà annulée");
      const { transaction } = await this.ledger.post(
        ctx,
        {
          accountId: current.accountId,
          kind: "REDEMPTION_REVERSAL",
          delta: current.cost,
          idempotencyKey: `redemption-cancel:${current.id}`,
          source: "DASHBOARD",
          reason,
        },
        tx,
      );
      await tx.reward.updateMany({ where: { id: current.rewardId, stock: { not: null } }, data: { stock: { increment: 1 } } });
      return tx.rewardRedemption.update({ where: { id: current.id }, data: { reversalTransactionId: transaction.id } });
    });
    await this.audit.forTenant(ctx, "redemption.cancelled", { type: "redemption", id: redemptionId }, { reason });
    await this.webhooks.emit(ctx.tenantId, "redemption.cancelled", { id: redemptionId });
    return redemption;
  }

  async listRedemptions(ctx: TenantContext, params: { cursor?: string; limit: number; accountId?: string }) {
    const rows = await this.prisma.client.rewardRedemption.findMany({
      where: { tenantId: ctx.tenantId, ...(params.accountId ? { accountId: params.accountId } : {}) },
      take: params.limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { account: { select: { cardNumber: true, customer: { select: { firstName: true, lastName: true } } } } },
    });
    const hasMore = rows.length > params.limit;
    const data = hasMore ? rows.slice(0, params.limit) : rows;
    return { data, nextCursor: hasMore ? data[data.length - 1]!.id : null };
  }
}

