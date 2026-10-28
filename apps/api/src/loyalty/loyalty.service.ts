import { Injectable } from "@nestjs/common";
import type { LoyaltyProgram, OperationSource, Prisma } from "@fove/database";
import {
  adjustSchema,
  computeEarn,
  earnSchema,
  programSchema,
  proportionalReversal,
  updateProgramSchema,
  type EarnRules,
} from "@fove/shared";
import type { z } from "zod";
import { loadConfig } from "../config";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";
import { badRequest, conflict, isUniqueViolation, notFound, unprocessable } from "../common/errors";
import type { TenantContext } from "../common/context";
import { PlanService } from "../billing/plan.service";
import { WebhooksService } from "../notifications/webhooks.service";
import { assertEstablishmentAccess } from "../tenants/tenants.service";
import { LedgerService, type PostResult } from "./ledger.service";
import { createCard, rotateAccessToken } from "./cards";

export function earnRules(program: LoyaltyProgram): EarnRules {
  return {
    mode: program.mode,
    spendStep: program.spendStep.toString(),
    pointsPerStep: program.pointsPerStep,
    stampsPerPurchase: program.stampsPerPurchase,
    minPurchaseAmount: program.minPurchaseAmount?.toString() ?? null,
    maxPerTransaction: program.maxPerTransaction,
  };
}

export function cardUrl(accessToken: string): string {
  return `${loadConfig().APP_URL}/card/${accessToken}`;
}

@Injectable()
export class LoyaltyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
    private readonly plans: PlanService,
    private readonly webhooks: WebhooksService,
  ) {}

  // --- Programmes ------------------------------------------------------------

  listPrograms(ctx: TenantContext) {
    return this.prisma.client.loyaltyProgram.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { accounts: true, rewards: true } } },
    });
  }

  async getProgram(ctx: TenantContext, id: string) {
    const program = await this.prisma.client.loyaltyProgram.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!program) throw notFound("Programme");
    return program;
  }

  async createProgram(ctx: TenantContext, input: z.infer<typeof programSchema>) {
    await this.plans.assertQuota(ctx.tenantId, "programs");
    const program = await this.prisma.client.$transaction(async (tx) => {
      const program = await tx.loyaltyProgram.create({ data: { ...input, tenantId: ctx.tenantId } });
      // Carte à tampons : la récompense de la carte pleine existe dès le départ.
      if (program.mode === "STAMPS") {
        await tx.reward.create({
          data: {
            tenantId: ctx.tenantId,
            programId: program.id,
            name: "Carte complète",
            description: `Récompense offerte après ${program.stampsTarget} tampons`,
            cost: program.stampsTarget,
          },
        });
      }
      await tx.enrollmentLink.create({
        data: { tenantId: ctx.tenantId, programId: program.id, token: crypto.randomUUID().replaceAll("-", "").slice(0, 16) },
      });
      return program;
    });
    await this.audit.forTenant(ctx, "program.created", { type: "program", id: program.id });
    return program;
  }

  async updateProgram(ctx: TenantContext, id: string, input: z.infer<typeof updateProgramSchema>) {
    const current = await this.getProgram(ctx, id);
    if (input.mode && input.mode !== current.mode) {
      const accounts = await this.prisma.client.loyaltyAccount.count({ where: { tenantId: ctx.tenantId, programId: id } });
      if (accounts > 0) throw badRequest("mode_locked", "Le type de programme ne peut plus changer une fois des cartes créées");
    }
    const program = await this.prisma.client.loyaltyProgram.update({ where: { id: current.id }, data: input });
    await this.audit.forTenant(ctx, "program.updated", { type: "program", id }, { fields: Object.keys(input) });
    return program;
  }

  // --- Cartes ----------------------------------------------------------------

  async enroll(ctx: TenantContext, customerId: string, programId: string) {
    const [customer, program] = await Promise.all([
      this.prisma.client.customer.findFirst({ where: { id: customerId, tenantId: ctx.tenantId, anonymizedAt: null } }),
      this.prisma.client.loyaltyProgram.findFirst({ where: { id: programId, tenantId: ctx.tenantId, active: true } }),
    ]);
    if (!customer) throw notFound("Client");
    if (!program) throw notFound("Programme");
    try {
      const card = await this.prisma.client.$transaction((tx) =>
        createCard(tx, { tenantId: ctx.tenantId, programId, customerId, status: "ACTIVE" }),
      );
      await this.audit.forTenant(ctx, "account.created", { type: "account", id: card.accountId });
      await this.webhooks.emit(ctx.tenantId, "loyalty_account.created", { id: card.accountId, customerId, programId });
      return { accountId: card.accountId, cardUrl: cardUrl(card.accessToken) };
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict("account_exists", "Ce client a déjà une carte pour ce programme");
      throw error;
    }
  }

  /** Nouveau lien de carte à transmettre au client ; l'ancien est révoqué. */
  async reissueCardLink(ctx: TenantContext, accountId: string) {
    const { accessToken, accessTokenHash } = rotateAccessToken();
    const { count } = await this.prisma.client.loyaltyAccount.updateMany({
      where: { id: accountId, tenantId: ctx.tenantId, status: { not: "CLOSED" } },
      data: { accessTokenHash },
    });
    if (count === 0) throw notFound("Carte");
    await this.audit.forTenant(ctx, "account.link_reissued", { type: "account", id: accountId });
    return { cardUrl: cardUrl(accessToken) };
  }

  async setAccountStatus(ctx: TenantContext, accountId: string, status: "ACTIVE" | "BLOCKED") {
    const { count } = await this.prisma.client.loyaltyAccount.updateMany({
      where: { id: accountId, tenantId: ctx.tenantId, status: { not: "CLOSED" } },
      data: { status },
    });
    if (count === 0) throw notFound("Carte");
    await this.audit.forTenant(ctx, status === "BLOCKED" ? "account.blocked" : "account.activated", { type: "account", id: accountId });
  }

  async getAccount(ctx: TenantContext, accountId: string) {
    const account = await this.prisma.client.loyaltyAccount.findFirst({
      where: { id: accountId, tenantId: ctx.tenantId },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, phone: true, email: true, anonymizedAt: true } },
        program: true,
        transactions: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    });
    if (!account) throw notFound("Carte");
    const rewards = await this.availableRewards(ctx.tenantId, account.programId);
    const { accessTokenHash: _h, ...safe } = account;
    return {
      ...safe,
      rewards: rewards.map((r) => ({ ...r, affordable: account.balance >= r.cost })),
    };
  }

  async availableRewards(tenantId: string, programId: string) {
    const now = new Date();
    return this.prisma.client.reward.findMany({
      where: {
        tenantId,
        programId,
        active: true,
        archivedAt: null,
        AND: [
          { OR: [{ availableFrom: null }, { availableFrom: { lte: now } }] },
          { OR: [{ availableUntil: null }, { availableUntil: { gte: now } }] },
          { OR: [{ stock: null }, { stock: { gt: 0 } }] },
        ],
      },
      orderBy: { cost: "asc" },
      select: { id: true, name: true, description: true, conditions: true, cost: true, stock: true },
    });
  }

  /** Identification au scanner : QR personnel ou numéro de carte, uniquement dans l'entreprise courante. */
  async lookup(ctx: TenantContext, code: string) {
    const value = code.trim();
    const account = await this.prisma.client.loyaltyAccount.findFirst({
      where: {
        tenantId: ctx.tenantId,
        OR: [{ qrToken: value }, { cardNumber: value.toUpperCase() }],
      },
      select: { id: true },
    });
    if (!account) throw notFound("Carte");
    return this.getAccount(ctx, account.id);
  }

  async listTransactions(
    ctx: TenantContext,
    params: { cursor?: string; limit: number; accountId?: string; kind?: string; from?: string; to?: string },
  ) {
    const where: Prisma.LoyaltyTransactionWhereInput = { tenantId: ctx.tenantId };
    if (params.accountId) where.accountId = params.accountId;
    if (params.kind) where.kind = params.kind as Prisma.LoyaltyTransactionWhereInput["kind"];
    if (params.from || params.to) {
      where.createdAt = { ...(params.from ? { gte: new Date(params.from) } : {}), ...(params.to ? { lte: new Date(params.to) } : {}) };
    }
    const rows = await this.prisma.client.loyaltyTransaction.findMany({
      where,
      take: params.limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        account: { select: { cardNumber: true, customer: { select: { id: true, firstName: true, lastName: true } }, program: { select: { name: true, mode: true } } } },
      },
    });
    const hasMore = rows.length > params.limit;
    const data = hasMore ? rows.slice(0, params.limit) : rows;
    return { data, nextCursor: hasMore ? data[data.length - 1]!.id : null };
  }

  // --- Opérations ------------------------------------------------------------

  /** Aperçu du gain avant confirmation au scanner (aucune écriture). */
  async previewEarn(ctx: TenantContext, accountId: string, amount: string | null) {
    const account = await this.prisma.client.loyaltyAccount.findFirst({
      where: { id: accountId, tenantId: ctx.tenantId },
      include: { program: true },
    });
    if (!account) throw notFound("Carte");
    const delta = computeEarn(earnRules(account.program), amount);
    return { delta, balanceAfter: account.balance + delta };
  }

  async earn(ctx: TenantContext, input: z.infer<typeof earnSchema> & { externalOrderId?: string | null }, source: OperationSource): Promise<PostResult> {
    assertEstablishmentAccess(ctx, input.establishmentId);
    const account = await this.prisma.client.loyaltyAccount.findFirst({
      where: { id: input.accountId, tenantId: ctx.tenantId },
      include: { program: true },
    });
    if (!account) throw notFound("Carte");
    if (!account.program.active) throw unprocessable("program_inactive", "Programme désactivé");
    if (input.establishmentId) await this.assertEstablishment(ctx.tenantId, input.establishmentId);
    const delta = computeEarn(earnRules(account.program), input.amount);

    const result = await this.ledger.run(
      ctx,
      input.idempotencyKey,
      (tx) =>
        this.ledger.post(
          ctx,
          {
            accountId: account.id,
            kind: "EARN",
            delta,
            idempotencyKey: input.idempotencyKey,
            source,
            amount: input.amount,
            currency: input.amount ? account.program.currency : null,
            saleReference: input.saleReference,
            externalOrderId: input.externalOrderId ?? null,
            establishmentId: input.establishmentId,
          },
          tx,
        ),
      async () => ({ transaction: (await this.ledger.findByKey(ctx, input.idempotencyKey))!, replayed: true }),
    );
    if (!result.replayed) await this.emitTransaction(ctx, result);
    return result;
  }

  async adjust(ctx: TenantContext, input: z.infer<typeof adjustSchema>): Promise<PostResult> {
    const result = await this.ledger.run(
      ctx,
      input.idempotencyKey,
      (tx) =>
        this.ledger.post(
          ctx,
          { accountId: input.accountId, kind: "ADJUSTMENT", delta: input.delta, idempotencyKey: input.idempotencyKey, source: "DASHBOARD", reason: input.reason },
          tx,
        ),
      async () => ({ transaction: (await this.ledger.findByKey(ctx, input.idempotencyKey))!, replayed: true }),
    );
    if (!result.replayed) {
      await this.audit.forTenant(ctx, "transaction.adjusted", { type: "transaction", id: result.transaction.id }, { delta: input.delta, reason: input.reason });
      await this.emitTransaction(ctx, result);
    }
    return result;
  }

  /** Annulation totale d'un gain ou d'un ajustement, par écriture compensatoire. */
  async reverse(ctx: TenantContext, transactionId: string, reason: string, idempotencyKey: string, source: OperationSource = "DASHBOARD") {
    const result = await this.ledger.run(
      ctx,
      idempotencyKey,
      async (tx) => {
        const replay = await this.ledger.findByKey(ctx, idempotencyKey, tx);
        if (replay) return { transaction: replay, replayed: true };
        await tx.$queryRaw`SELECT id FROM "LoyaltyTransaction" WHERE id = ${transactionId}::uuid AND "tenantId" = ${ctx.tenantId}::uuid FOR UPDATE`;
        const original = await tx.loyaltyTransaction.findFirst({ where: { id: transactionId, tenantId: ctx.tenantId } });
        if (!original) throw notFound("Opération");
        if (original.kind !== "EARN" && original.kind !== "ADJUSTMENT") {
          throw badRequest("not_reversible", "Seuls les gains et ajustements s'annulent ici ; une récompense s'annule depuis son historique");
        }
        const already = await tx.loyaltyTransaction.findUnique({ where: { reversesId: original.id } });
        if (already) throw conflict("already_reversed", "Cette opération a déjà été annulée");
        const refunded = await tx.loyaltyTransaction.aggregate({ where: { refundOfId: original.id }, _sum: { delta: true } });
        const remaining = original.delta + (refunded._sum.delta ?? 0);
        return this.ledger.post(
          ctx,
          {
            accountId: original.accountId,
            kind: "REVERSAL",
            delta: -remaining,
            idempotencyKey,
            source,
            allowNegative: true,
            reason,
            reversesId: original.id,
            saleReference: original.saleReference,
            externalOrderId: original.externalOrderId,
          },
          tx,
        );
      },
      async () => ({ transaction: (await this.ledger.findByKey(ctx, idempotencyKey))!, replayed: true }),
    );
    if (!result.replayed) {
      await this.audit.forTenant(ctx, "transaction.reversed", { type: "transaction", id: transactionId }, { reason });
      await this.emitTransaction(ctx, result);
    }
    return result;
  }

  /** Remboursement (partiel ou total) d'une commande créditée via une intégration. */
  async refundOrder(ctx: TenantContext, input: { externalOrderId: string; externalRefundId: string; amount: string }) {
    const idempotencyKey = `refund:${input.externalOrderId}:${input.externalRefundId}`;
    const result = await this.ledger.run(
      ctx,
      idempotencyKey,
      async (tx) => {
        const replay = await this.ledger.findByKey(ctx, idempotencyKey, tx);
        if (replay) return { transaction: replay, replayed: true };
        const original = await tx.loyaltyTransaction.findFirst({
          where: { tenantId: ctx.tenantId, externalOrderId: input.externalOrderId, kind: "EARN" },
        });
        if (!original) throw notFound("Commande créditée");
        await tx.$queryRaw`SELECT id FROM "LoyaltyTransaction" WHERE id = ${original.id}::uuid FOR UPDATE`;
        if (await tx.loyaltyTransaction.findUnique({ where: { reversesId: original.id } })) {
          throw conflict("already_reversed", "Commande déjà annulée");
        }
        const refunded = await tx.loyaltyTransaction.aggregate({ where: { refundOfId: original.id }, _sum: { delta: true } });
        const remaining = original.delta + (refunded._sum.delta ?? 0);
        const target = original.amount ? proportionalReversal(original.delta, original.amount.toString(), input.amount) : original.delta;
        const delta = -Math.min(target, remaining);
        return this.ledger.post(
          ctx,
          {
            accountId: original.accountId,
            kind: "REFUND",
            delta,
            idempotencyKey,
            source: "INTEGRATION",
            allowNegative: true,
            amount: input.amount,
            currency: original.currency,
            externalOrderId: input.externalOrderId,
            refundOfId: original.id,
            reason: `Remboursement ${input.externalRefundId}`,
          },
          tx,
        );
      },
      async () => ({ transaction: (await this.ledger.findByKey(ctx, idempotencyKey))!, replayed: true }),
    );
    if (!result.replayed) await this.emitTransaction(ctx, result);
    return result;
  }

  /**
   * Expiration des points après une période d'inactivité (réglage du
   * programme). Appelée par la tâche planifiée, idempotente par période.
   */
  async expireInactive(now = new Date()): Promise<number> {
    const programs = await this.prisma.client.loyaltyProgram.findMany({ where: { inactivityExpiryDays: { not: null } } });
    let expired = 0;
    for (const program of programs) {
      const cutoff = new Date(now.getTime() - program.inactivityExpiryDays! * 86_400_000);
      const accounts = await this.prisma.client.loyaltyAccount.findMany({
        where: { tenantId: program.tenantId, programId: program.id, balance: { gt: 0 }, lastActivityAt: { lt: cutoff } },
        select: { id: true, balance: true, lastActivityAt: true },
        take: 500,
      });
      for (const account of accounts) {
        const ctx: TenantContext = { tenantId: program.tenantId, readOnly: false, actor: { type: "system", label: "scheduler" } };
        const key = `expire:${account.id}:${account.lastActivityAt.toISOString()}`;
        await this.ledger.run(
          ctx,
          key,
          async (tx) => {
            const fresh = await tx.loyaltyAccount.findUniqueOrThrow({ where: { id: account.id } });
            return this.ledger.post(ctx, { accountId: account.id, kind: "EXPIRATION", delta: -fresh.balance, idempotencyKey: key, source: "SYSTEM", reason: "Inactivité" }, tx);
          },
          async () => ({ transaction: (await this.ledger.findByKey(ctx, key))!, replayed: true }),
        );
        expired++;
      }
    }
    return expired;
  }

  private async assertEstablishment(tenantId: string, establishmentId: string) {
    const est = await this.prisma.client.establishment.findFirst({ where: { id: establishmentId, tenantId, active: true } });
    if (!est) throw badRequest("invalid_establishment", "Établissement inconnu");
  }

  private async emitTransaction(ctx: TenantContext, result: PostResult) {
    const t = result.transaction;
    await this.webhooks.emit(ctx.tenantId, "loyalty_transaction.created", {
      id: t.id,
      accountId: t.accountId,
      kind: t.kind,
      delta: t.delta,
      balanceAfter: t.balanceAfter,
      externalOrderId: t.externalOrderId,
      createdAt: t.createdAt.toISOString(),
    });
  }
}
