import { Injectable } from "@nestjs/common";
import type { LoyaltyTransaction, OperationSource, Prisma, TransactionKind } from "@fove/database";
import { PrismaService } from "../common/prisma.service";
import { conflict, isUniqueViolation, notFound, unprocessable } from "../common/errors";
import { actorApiKeyId, actorUserId, type TenantContext } from "../common/context";

export interface PostInput {
  accountId: string;
  kind: TransactionKind;
  delta: number;
  idempotencyKey: string;
  source: OperationSource;
  /** Autorise un solde négatif (annulations / remboursements après dépense). */
  allowNegative?: boolean;
  amount?: string | null;
  currency?: string | null;
  saleReference?: string | null;
  externalOrderId?: string | null;
  reason?: string | null;
  reversesId?: string | null;
  refundOfId?: string | null;
  establishmentId?: string | null;
}

export interface PostResult {
  transaction: LoyaltyTransaction;
  replayed: boolean;
}

/**
 * Registre de fidélité. Invariants :
 * - chaque mouvement est une ligne immuable avec le solde après opération ;
 * - le solde du compte n'est modifié que par `post`, dans la même transaction
 *   PostgreSQL que l'écriture de la ligne ;
 * - la mise à jour du solde est conditionnelle (`balance >= -delta`) : deux
 *   débits simultanés ne peuvent pas rendre le solde négatif ;
 * - une clé d'idempotence déjà vue renvoie l'opération d'origine.
 */
@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  /** Exécute `fn` dans une transaction ; rejoue proprement les clés d'idempotence concurrentes. */
  async run<T>(ctx: TenantContext, idempotencyKey: string, fn: (tx: Prisma.TransactionClient) => Promise<T>, onReplay: () => Promise<T>): Promise<T> {
    try {
      return await this.prisma.client.$transaction(fn, { timeout: 15_000 });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const existing = await this.prisma.client.loyaltyTransaction.findUnique({
          where: { tenantId_idempotencyKey: { tenantId: ctx.tenantId, idempotencyKey } },
        });
        if (existing) return onReplay();
        throw conflict("concurrent_operation", "Opération concurrente détectée, réessayez");
      }
      throw error;
    }
  }

  async findByKey(ctx: TenantContext, idempotencyKey: string, db: Prisma.TransactionClient | PrismaService["client"] = this.prisma.client) {
    return db.loyaltyTransaction.findUnique({ where: { tenantId_idempotencyKey: { tenantId: ctx.tenantId, idempotencyKey } } });
  }

  async post(ctx: TenantContext, input: PostInput, tx: Prisma.TransactionClient): Promise<PostResult> {
    if (!Number.isInteger(input.delta)) throw new Error("delta entier attendu");

    const existing = await this.findByKey(ctx, input.idempotencyKey, tx);
    if (existing) {
      if (existing.accountId !== input.accountId || existing.kind !== input.kind) {
        throw conflict("idempotency_conflict", "Clé d'idempotence déjà utilisée pour une autre opération");
      }
      return { transaction: existing, replayed: true };
    }

    const earned = input.delta > 0 && (input.kind === "EARN" || input.kind === "ADJUSTMENT") ? input.delta : 0;
    const spent = input.kind === "REDEMPTION" ? -input.delta : input.kind === "REDEMPTION_REVERSAL" ? -input.delta : 0;

    const where: Prisma.LoyaltyAccountWhereInput = {
      id: input.accountId,
      tenantId: ctx.tenantId,
      status: { in: input.kind === "EARN" || input.kind === "REDEMPTION" ? ["ACTIVE"] : ["ACTIVE", "BLOCKED", "PENDING_VERIFICATION"] },
    };
    if (input.delta < 0 && !input.allowNegative) where.balance = { gte: -input.delta };

    const { count } = await tx.loyaltyAccount.updateMany({
      where,
      data: {
        balance: { increment: input.delta },
        lifetimeEarned: { increment: earned },
        lifetimeSpent: { increment: spent },
        ...(input.kind === "EXPIRATION" ? {} : { lastActivityAt: new Date() }),
      },
    });

    if (count === 0) {
      const account = await tx.loyaltyAccount.findFirst({ where: { id: input.accountId, tenantId: ctx.tenantId } });
      if (!account) throw notFound("Carte de fidélité");
      if (account.status !== "ACTIVE") throw unprocessable("account_inactive", "Carte non active : opération impossible");
      throw unprocessable("insufficient_balance", "Solde insuffisant", { balance: account.balance, required: -input.delta });
    }

    const account = await tx.loyaltyAccount.findUniqueOrThrow({ where: { id: input.accountId }, select: { balance: true } });
    const transaction = await tx.loyaltyTransaction.create({
      data: {
        tenantId: ctx.tenantId,
        accountId: input.accountId,
        kind: input.kind,
        delta: input.delta,
        balanceAfter: account.balance,
        amount: input.amount ?? null,
        currency: input.currency ?? null,
        saleReference: input.saleReference ?? null,
        externalOrderId: input.externalOrderId ?? null,
        reason: input.reason ?? null,
        idempotencyKey: input.idempotencyKey,
        reversesId: input.reversesId ?? null,
        refundOfId: input.refundOfId ?? null,
        establishmentId: input.establishmentId ?? null,
        actorUserId: actorUserId(ctx),
        actorApiKeyId: actorApiKeyId(ctx),
        source: input.source,
      },
    });
    return { transaction, replayed: false };
  }
}
