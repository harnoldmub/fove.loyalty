import { z } from "zod";

export const financeFilterSchema = z.object({
  range: z.enum(["today", "yesterday", "7d", "30d", "month", "last_month", "quarter", "year", "all", "custom"]).default("month"),
  from: z.string().optional(),
  to: z.string().optional(),
  currency: z.string().optional().default("USD"),
});

export type FinanceFilterDto = z.infer<typeof financeFilterSchema>;

export const salesFilterSchema = financeFilterSchema.extend({
  q: z.string().optional(),
  plan: z.string().optional(),
  status: z.enum(["ALL", "DRAFT", "OPEN", "PAID", "VOID", "UNCOLLECTIBLE"]).default("ALL"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type SalesFilterDto = z.infer<typeof salesFilterSchema>;

export const paymentsFilterSchema = financeFilterSchema.extend({
  q: z.string().optional(),
  status: z.enum(["ALL", "PENDING", "PROCESSING", "SUCCEEDED", "FAILED", "CANCELLED", "PARTIALLY_REFUNDED", "REFUNDED", "DISPUTED"]).default("ALL"),
  provider: z.enum(["ALL", "STRIPE", "MANUAL", "MOCK", "BANK_TRANSFER", "MOBILE_MONEY"]).default("ALL"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type PaymentsFilterDto = z.infer<typeof paymentsFilterSchema>;

export const expenseCreateSchema = z.object({
  title: z.string().trim().min(2).max(120),
  supplier: z.string().trim().min(2).max(80),
  category: z.enum(["HOSTING", "DATABASE", "EMAILS", "DOMAINS", "SAAS", "MARKETING", "ADS", "DEV", "FREELANCE", "BANK_FEES", "LEGAL", "OFFICE", "OTHER"]),
  amountCents: z.number().int().positive(),
  currency: z.string().default("USD"),
  taxCents: z.number().int().min(0).default(0),
  isRecurring: z.boolean().default(false),
  recurringInterval: z.enum(["month", "year"]).optional(),
  status: z.enum(["PLANNED", "PAID", "CANCELLED"]).default("PAID"),
  paymentMethod: z.string().optional(),
  proofUrl: z.string().url().optional().or(z.literal("")),
  expenseDate: z.string(),
});

export type ExpenseCreateDto = z.infer<typeof expenseCreateSchema>;

export const partnerCreateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email(),
  code: z.string().trim().min(3).max(30).regex(/^[A-Z0-9_-]+$/i, "Le code doit être alphanumérique (sans espaces)"),
  phone: z.string().trim().optional(),
  company: z.string().trim().optional(),
  commissionRatePercent: z.number().min(0).max(100).default(20),
});

export type PartnerCreateDto = z.infer<typeof partnerCreateSchema>;

export const refundCreateSchema = z.object({
  amountCents: z.number().int().positive().optional(),
  reason: z.string().trim().min(3).max(300),
});

export type RefundCreateDto = z.infer<typeof refundCreateSchema>;

export const reconcileSchema = z.object({
  reconciledType: z.enum(["PAYMENT", "EXPENSE", "PARTNER_PAYOUT"]),
  reconciledId: z.string().uuid(),
  notes: z.string().optional(),
});

export type ReconcileDto = z.infer<typeof reconcileSchema>;

