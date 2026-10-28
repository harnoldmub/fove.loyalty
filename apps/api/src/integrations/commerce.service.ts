import { Injectable } from "@nestjs/common";
import { commerceCustomerSchema, commerceOrderPaidSchema, commerceRefundSchema } from "@fove/shared";
import type { z } from "zod";
import { PrismaService } from "../common/prisma.service";
import { AppError, badRequest, isUniqueViolation, notFound, unprocessable } from "../common/errors";
import type { TenantContext } from "../common/context";
import { PlanService } from "../billing/plan.service";
import { buildIdentities, CustomersService, tenantCountry } from "../customers/customers.service";
import { LoyaltyService } from "../loyalty/loyalty.service";
import { createCard } from "../loyalty/cards";

/**
 * Connecteur e-commerce générique (Match Kwata est le premier utilisateur).
 * La boutique appelle FOVE avec une clé secrète ; FOVE n'accède jamais à sa
 * base. Références stables : `externalId` du client, `externalOrderId` de la
 * commande (clé d'idempotence du crédit), `externalRefundId` du remboursement.
 */
@Injectable()
export class CommerceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomersService,
    private readonly loyalty: LoyaltyService,
    private readonly plans: PlanService,
  ) {}

  /**
   * Rattache un client de la boutique : d'abord par référence externe, puis par
   * email (identifiant unique). Jamais par nom. Sinon, création.
   */
  async linkCustomer(ctx: TenantContext, input: z.infer<typeof commerceCustomerSchema>) {
    const db = this.prisma.client;
    const byExternal = await db.customerIdentity.findUnique({
      where: { tenantId_kind_value: { tenantId: ctx.tenantId, kind: "EXTERNAL", value: input.externalId } },
    });
    if (byExternal) return { customerId: byExternal.customerId, created: false, matchedBy: "externalId" as const };

    const country = await tenantCountry(db, ctx.tenantId);
    const { identities } = buildIdentities({ email: input.email, phone: input.phone }, country);
    const emailIdentity = identities.find((i) => i.kind === "EMAIL");
    if (emailIdentity) {
      const byEmail = await db.customerIdentity.findUnique({
        where: { tenantId_kind_value: { tenantId: ctx.tenantId, kind: "EMAIL", value: emailIdentity.value } },
      });
      if (byEmail) {
        try {
          await db.$transaction([
            db.customerIdentity.create({ data: { tenantId: ctx.tenantId, customerId: byEmail.customerId, kind: "EXTERNAL", value: input.externalId } }),
            db.customer.update({ where: { id: byEmail.customerId }, data: { externalRef: input.externalId } }),
          ]);
        } catch (error) {
          if (!isUniqueViolation(error)) throw error;
        }
        return { customerId: byEmail.customerId, created: false, matchedBy: "email" as const };
      }
    }

    if (!input.email && !input.phone) throw badRequest("contact_required", "Email ou téléphone requis pour créer le client");
    try {
      const { customer } = await this.customers.create(
        ctx,
        {
          firstName: input.firstName || "Client",
          lastName: input.lastName,
          email: input.email,
          // Un téléphone déjà pris par un autre client bloquerait la création : on ne garde que l'email dans ce cas.
          phone: input.phone,
          externalRef: input.externalId,
          marketingEmailConsent: input.marketingEmailConsent,
          marketingSmsConsent: false,
        },
        "INTEGRATION",
      );
      return { customerId: customer.id, created: true, matchedBy: null };
    } catch (error) {
      if (error instanceof AppError && error.code === "customer_exists") {
        throw unprocessable("customer_conflict", "Le téléphone appartient à un autre client : rattachement manuel requis");
      }
      throw error;
    }
  }

  private async ensureAccount(ctx: TenantContext, customerId: string, programId: string) {
    const existing = await this.prisma.client.loyaltyAccount.findFirst({ where: { tenantId: ctx.tenantId, programId, customerId } });
    if (existing) return existing.id;
    try {
      const card = await this.prisma.client.$transaction((tx) => createCard(tx, { tenantId: ctx.tenantId, programId, customerId, status: "ACTIVE" }));
      return card.accountId;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const again = await this.prisma.client.loyaltyAccount.findFirstOrThrow({ where: { tenantId: ctx.tenantId, programId, customerId } });
      return again.id;
    }
  }

  private async log(ctx: TenantContext, kind: string, externalId: string, status: "ok" | "error", error?: string) {
    const connection = await this.prisma.client.integrationConnection.findFirst({ where: { tenantId: ctx.tenantId, status: { not: "PAUSED" } } });
    await this.prisma.client.integrationSyncLog.create({
      data: { tenantId: ctx.tenantId, connectionId: connection?.id ?? null, kind, externalId, status, error: error?.slice(0, 500) },
    });
    if (connection) {
      await this.prisma.client.integrationConnection.update({
        where: { id: connection.id },
        data: status === "ok" ? { lastSyncAt: new Date(), lastError: null } : { lastError: error?.slice(0, 500) },
      });
    }
  }

  /** Commande payée → points. Rejouer la même commande ne crédite jamais deux fois. */
  async orderPaid(ctx: TenantContext, input: z.infer<typeof commerceOrderPaidSchema>) {
    try {
      await this.plans.assertFeature(ctx.tenantId, "integrations");
      const program = await this.prisma.client.loyaltyProgram.findFirst({ where: { id: input.programId, tenantId: ctx.tenantId } });
      if (!program) throw notFound("Programme");
      if (program.mode === "POINTS" && program.currency !== input.currency.toUpperCase()) {
        throw unprocessable("currency_mismatch", `Devise ${input.currency} différente de celle du programme (${program.currency})`);
      }
      const link = await this.linkCustomer(ctx, input.customer);
      const accountId = await this.ensureAccount(ctx, link.customerId, program.id);
      const result = await this.loyalty.earn(
        ctx,
        {
          accountId,
          amount: input.amount,
          saleReference: input.orderNumber ?? input.externalOrderId,
          establishmentId: null,
          idempotencyKey: `order:${input.externalOrderId}`,
          externalOrderId: input.externalOrderId,
        },
        "INTEGRATION",
      );
      await this.log(ctx, "order.paid", input.externalOrderId, "ok");
      return {
        customerId: link.customerId,
        customerCreated: link.created,
        accountId,
        transactionId: result.transaction.id,
        pointsEarned: result.transaction.delta,
        balance: result.transaction.balanceAfter,
        replayed: result.replayed,
      };
    } catch (error) {
      await this.log(ctx, "order.paid", input.externalOrderId, "error", error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  async refund(ctx: TenantContext, input: z.infer<typeof commerceRefundSchema>) {
    try {
      const result = await this.loyalty.refundOrder(ctx, input);
      await this.log(ctx, "order.refunded", input.externalOrderId, "ok");
      return { transactionId: result.transaction.id, pointsRemoved: -result.transaction.delta, balance: result.transaction.balanceAfter, replayed: result.replayed };
    } catch (error) {
      await this.log(ctx, "order.refunded", input.externalOrderId, "error", error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /** Recherche d'un client par référence externe, email ou téléphone. */
  async findCustomer(ctx: TenantContext, query: { externalId?: string; email?: string; phone?: string }) {
    const country = await tenantCountry(this.prisma.client, ctx.tenantId);
    const { identities } = buildIdentities({ email: query.email, phone: query.phone, externalRef: query.externalId }, country);
    if (identities.length === 0) throw badRequest("query_required", "externalId, email ou phone requis");
    const match = await this.prisma.client.customerIdentity.findFirst({
      where: { tenantId: ctx.tenantId, OR: identities },
      include: { customer: { include: { accounts: { select: { id: true, programId: true, balance: true, cardNumber: true, status: true } } } } },
    });
    if (!match) throw notFound("Client");
    return match.customer;
  }
}
