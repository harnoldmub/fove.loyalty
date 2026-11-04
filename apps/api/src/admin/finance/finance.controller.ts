import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ZodPipe } from "../../common/zod.pipe";
import { Auth } from "../../common/decorators";
import type { AuthState } from "../../common/context";
import { FinanceRoute } from "../../auth/guards";
import { FinanceService } from "./finance.service";
import {
  financeFilterSchema,
  salesFilterSchema,
  paymentsFilterSchema,
  expenseCreateSchema,
  partnerCreateSchema,
  refundCreateSchema,
  reconcileSchema,
  type FinanceFilterDto,
  type SalesFilterDto,
  type PaymentsFilterDto,
  type ExpenseCreateDto,
  type PartnerCreateDto,
  type RefundCreateDto,
  type ReconcileDto,
} from "./finance.dto";

@ApiTags("admin-finance")
@Controller("admin/finance")
@FinanceRoute()
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get("overview")
  overview(@Query(new ZodPipe(financeFilterSchema)) filter: FinanceFilterDto) {
    return this.finance.overview(filter);
  }

  @Get("charts")
  charts(@Query(new ZodPipe(financeFilterSchema)) filter: FinanceFilterDto) {
    return this.finance.charts(filter);
  }

  @Get("sales")
  sales(@Query(new ZodPipe(salesFilterSchema)) filter: SalesFilterDto) {
    return this.finance.sales(filter);
  }

  @Get("sales/:id")
  saleDetail(@Param("id", ParseUUIDPipe) id: string) {
    return this.finance.saleDetail(id);
  }

  @Get("payments")
  payments(@Query(new ZodPipe(paymentsFilterSchema)) filter: PaymentsFilterDto) {
    return this.finance.payments(filter);
  }

  @Post("payments/:id/refund")
  refundPayment(
    @Auth() auth: AuthState,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(refundCreateSchema)) body: RefundCreateDto,
  ) {
    return this.finance.refundPayment(auth, id, body);
  }

  @Get("subscriptions")
  subscriptions() {
    return this.finance.subscriptions();
  }

  @Get("customers")
  customers() {
    return this.finance.customers();
  }

  @Get("expenses")
  expenses(
    @Query("category") category?: string,
    @Query("range") range?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.finance.expenses({ category, range, from, to });
  }

  @Post("expenses")
  createExpense(
    @Auth() auth: AuthState,
    @Body(new ZodPipe(expenseCreateSchema)) body: ExpenseCreateDto,
  ) {
    return this.finance.createExpense(auth, body);
  }

  @Delete("expenses/:id")
  deleteExpense(
    @Auth() auth: AuthState,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.finance.deleteExpense(auth, id);
  }

  @Get("partners")
  partners() {
    return this.finance.partners();
  }

  @Post("partners")
  createPartner(
    @Auth() auth: AuthState,
    @Body(new ZodPipe(partnerCreateSchema)) body: PartnerCreateDto,
  ) {
    return this.finance.createPartner(auth, body);
  }

  @Get("commissions")
  commissions(
    @Query("partnerId") partnerId?: string,
    @Query("status") status?: string,
  ) {
    return this.finance.commissions({ partnerId, status });
  }

  @Post("commissions/:id/pay")
  payCommission(
    @Auth() auth: AuthState,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.finance.payCommission(auth, id);
  }

  @Get("referrals")
  referrals() {
    return this.finance.referrals();
  }

  @Get("treasury")
  treasury() {
    return this.finance.treasury();
  }

  @Post("treasury/reconcile/:id")
  reconcile(
    @Auth() auth: AuthState,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(reconcileSchema)) body: ReconcileDto,
  ) {
    return this.finance.reconcileEntry(auth, id, body);
  }

  @Get("audit")
  audit(@Query("limit") limit?: string) {
    const lim = limit ? Number.parseInt(limit, 10) : 100;
    return this.finance.auditLogs(Number.isFinite(lim) ? lim : 100);
  }

  @Get("reports/monthly")
  monthlyReport(
    @Query("year") year?: string,
    @Query("month") month?: string,
  ) {
    const y = year ? Number.parseInt(year, 10) : new Date().getFullYear();
    const m = month ? Number.parseInt(month, 10) : new Date().getMonth() + 1;
    return this.finance.monthlyAssociateReport(y, m);
  }
}

