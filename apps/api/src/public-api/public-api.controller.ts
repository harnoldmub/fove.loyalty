import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query, UseInterceptors } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import {
  commerceCustomerSchema,
  commerceOrderPaidSchema,
  commerceRefundSchema,
  customerSchema,
  enrollAccountSchema,
  paginationSchema,
  reverseSchema,
} from "@fove/shared";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe";
import { RequireScope, Tenant } from "../common/decorators";
import type { TenantContext } from "../common/context";
import { ApiKeyRoute } from "../auth/guards";
import { CustomersService } from "../customers/customers.service";
import { LoyaltyService } from "../loyalty/loyalty.service";
import { RewardsService } from "../rewards/rewards.service";
import { CommerceService } from "../integrations/commerce.service";
import { IdempotencyInterceptor } from "./idempotency.interceptor";

const amount = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/).nullable().default(null);
const apiEarnSchema = z.object({
  accountId: z.uuid(),
  amount,
  saleReference: z.string().max(120).nullable().default(null),
  establishmentId: z.uuid().nullable().default(null),
});
const apiRedeemSchema = z.object({ accountId: z.uuid(), rewardId: z.uuid(), establishmentId: z.uuid().nullable().default(null) });
const apiReverseSchema = reverseSchema.omit({ idempotencyKey: true });
const findSchema = z.object({ externalId: z.string().max(120).optional(), email: z.string().max(254).optional(), phone: z.string().max(32).optional() });

/**
 * API publique v1 (serveur à serveur). Authentification : `Authorization:
 * Bearer fove_sk_…`. Les POST exigent `Idempotency-Key`.
 */
@ApiTags("api-v1")
@ApiBearerAuth()
@ApiHeader({ name: "Idempotency-Key", required: false, description: "Obligatoire sur les POST" })
@Controller("v1")
@ApiKeyRoute()
@UseInterceptors(IdempotencyInterceptor)
@Throttle({ default: { limit: 300, ttl: 60_000 } })
export class PublicApiController {
  constructor(
    private readonly customers: CustomersService,
    private readonly loyalty: LoyaltyService,
    private readonly rewards: RewardsService,
    private readonly commerce: CommerceService,
  ) {}

  @Get("customers")
  @RequireScope("customers:read")
  listCustomers(@Tenant() ctx: TenantContext, @Query(new ZodPipe(paginationSchema)) query: z.infer<typeof paginationSchema>) {
    return this.customers.search(ctx, query);
  }

  @Get("customers/lookup")
  @RequireScope("customers:read")
  lookup(@Tenant() ctx: TenantContext, @Query(new ZodPipe(findSchema)) query: z.infer<typeof findSchema>) {
    return this.commerce.findCustomer(ctx, query);
  }

  @Get("customers/:id")
  @RequireScope("customers:read")
  customer(@Tenant() ctx: TenantContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.customers.get(ctx, id);
  }

  @Post("customers")
  @RequireScope("customers:write")
  async createCustomer(@Tenant() ctx: TenantContext, @Body(new ZodPipe(customerSchema)) body: z.infer<typeof customerSchema>) {
    const { customer } = await this.customers.create(ctx, body, "API");
    return customer;
  }

  @Get("programs")
  @RequireScope("programs:read")
  programs(@Tenant() ctx: TenantContext) {
    return this.loyalty.listPrograms(ctx);
  }

  @Post("loyalty/accounts")
  @RequireScope("loyalty:write")
  enroll(@Tenant() ctx: TenantContext, @Body(new ZodPipe(enrollAccountSchema)) body: z.infer<typeof enrollAccountSchema>) {
    return this.loyalty.enroll(ctx, body.customerId, body.programId);
  }

  @Get("loyalty/accounts/:id")
  @RequireScope("loyalty:read")
  account(@Tenant() ctx: TenantContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.loyalty.getAccount(ctx, id);
  }

  @Get("loyalty/transactions")
  @RequireScope("loyalty:read")
  transactions(@Tenant() ctx: TenantContext, @Query(new ZodPipe(paginationSchema.extend({ accountId: z.uuid().optional() }))) query: z.infer<typeof paginationSchema> & { accountId?: string }) {
    return this.loyalty.listTransactions(ctx, query);
  }

  @Post("loyalty/transactions")
  @RequireScope("loyalty:write")
  earn(@Tenant() ctx: TenantContext, @Body(new ZodPipe(apiEarnSchema)) body: z.infer<typeof apiEarnSchema>, @Headers("idempotency-key") key: string) {
    return this.loyalty.earn(ctx, { ...body, idempotencyKey: `api:${key}` }, "API");
  }

  @Post("loyalty/transactions/:id/reverse")
  @RequireScope("loyalty:write")
  reverse(@Tenant() ctx: TenantContext, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(apiReverseSchema)) body: z.infer<typeof apiReverseSchema>, @Headers("idempotency-key") key: string) {
    return this.loyalty.reverse(ctx, id, body.reason, `api:${key}`, "API");
  }

  @Get("rewards")
  @RequireScope("rewards:read")
  rewardList(@Tenant() ctx: TenantContext) {
    return this.rewards.list(ctx);
  }

  @Post("redemptions")
  @RequireScope("redemptions:write")
  redeem(@Tenant() ctx: TenantContext, @Body(new ZodPipe(apiRedeemSchema)) body: z.infer<typeof apiRedeemSchema>, @Headers("idempotency-key") key: string) {
    return this.rewards.redeem(ctx, { ...body, idempotencyKey: `api:${key}` }, "API");
  }

  // --- Connecteur e-commerce (Match Kwata…) ---------------------------------

  @Post("integrations/commerce/customers")
  @RequireScope("integrations:write")
  link(@Tenant() ctx: TenantContext, @Body(new ZodPipe(commerceCustomerSchema)) body: z.infer<typeof commerceCustomerSchema>) {
    return this.commerce.linkCustomer(ctx, body);
  }

  @Post("integrations/commerce/orders/paid")
  @RequireScope("integrations:write")
  orderPaid(@Tenant() ctx: TenantContext, @Body(new ZodPipe(commerceOrderPaidSchema)) body: z.infer<typeof commerceOrderPaidSchema>) {
    return this.commerce.orderPaid(ctx, body);
  }

  @Post("integrations/commerce/orders/refunded")
  @RequireScope("integrations:write")
  refund(@Tenant() ctx: TenantContext, @Body(new ZodPipe(commerceRefundSchema)) body: z.infer<typeof commerceRefundSchema>) {
    return this.commerce.refund(ctx, body);
  }
}
