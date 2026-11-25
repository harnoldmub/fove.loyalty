import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { BILLING_CURRENCIES } from "@fove/shared";
import { ZodPipe } from "../../common/zod.pipe";
import { Auth } from "../../common/decorators";
import type { AuthState } from "../../common/context";
import { FinanceRoute } from "../../auth/guards";
import { OFFLINE_METHODS, OfflineBillingService, type OfflineMethod } from "../../billing/offline.service";
import { ReconciliationService } from "./reconciliation.service";

const importSchema = z.object({
  csv: z.string().min(10).max(2_000_000),
  /** Monnaie des lignes sans colonne « devise ». */
  currency: z.enum(BILLING_CURRENCIES),
});

const entrySchema = z.object({
  entryDate: z.iso.date(),
  label: z.string().trim().min(2).max(500),
  amountCents: z.int().refine((v) => v !== 0, "Montant non nul"),
  currency: z.enum(BILLING_CURRENCIES),
  notes: z.string().trim().max(500).optional(),
});

const validateSchema = z.object({
  method: z.enum(Object.keys(OFFLINE_METHODS) as [OfflineMethod, ...OfflineMethod[]]),
  amountCents: z.int().positive().max(100_000_000_000),
  paidAt: z.iso.datetime().optional(),
  bankReference: z.string().trim().max(140).optional(),
  receiptNumber: z.string().trim().max(60).optional(),
  proofUrl: z.url().max(500).optional().or(z.literal("")),
  note: z.string().trim().max(500).optional(),
  acceptShortfall: z.boolean().optional(),
});

const voidSchema = z.object({ reason: z.string().trim().min(3).max(300) });

const bankAccountSchema = z.object({
  /** Code pays ISO (MA, DZ, CD…) ou « * » pour les coordonnées par défaut. */
  country: z.string().trim().toUpperCase().regex(/^([A-Z]{2}|\*)$/),
  currency: z.enum(BILLING_CURRENCIES),
  beneficiary: z.string().trim().min(2).max(120),
  bankName: z.string().trim().max(120).nullable().optional(),
  iban: z.string().trim().max(60).nullable().optional(),
  accountNumber: z.string().trim().max(80).nullable().optional(),
  swift: z.string().trim().max(20).nullable().optional(),
  instructions: z.string().trim().max(1000).nullable().optional(),
  active: z.boolean().default(true),
});
type BankAccountDto = z.infer<typeof bankAccountSchema>;

const clean = (b: BankAccountDto) => ({
  country: b.country,
  currency: b.currency,
  beneficiary: b.beneficiary,
  bankName: b.bankName || null,
  iban: b.iban || null,
  accountNumber: b.accountNumber || null,
  swift: b.swift || null,
  instructions: b.instructions || null,
  active: b.active,
});

/** Back-office : factures réglées hors ligne et coordonnées bancaires (docs/chantier-encaissement-hors-ligne.md, 4-5). */
@ApiTags("admin-finance")
@Controller("admin/finance")
@FinanceRoute()
export class OfflineFinanceController {
  constructor(
    private readonly offline: OfflineBillingService,
    private readonly reconciliation: ReconciliationService,
  ) {}

  /** Import d'un relevé bancaire CSV : références FV-… détectées et pièces proposées. */
  @Post("treasury/import")
  importCsv(@Auth() auth: AuthState, @Body(new ZodPipe(importSchema)) body: z.infer<typeof importSchema>) {
    return this.reconciliation.importCsv(auth, body.csv, body.currency);
  }

  @Post("treasury/entries")
  createEntry(@Auth() auth: AuthState, @Body(new ZodPipe(entrySchema)) body: z.infer<typeof entrySchema>) {
    return this.reconciliation.createEntry(auth, { ...body, entryDate: new Date(`${body.entryDate}T00:00:00Z`) });
  }

  @Post("treasury/rematch")
  rematch() {
    return this.reconciliation.rematch();
  }

  /** Validation en un clic de la pièce proposée pour une ligne de relevé. */
  @Post("treasury/entries/:id/confirm")
  confirm(@Auth() auth: AuthState, @Param("id", ParseUUIDPipe) id: string) {
    return this.reconciliation.confirm(auth, id);
  }

  @Get("offline-invoices")
  list(@Query("status") status?: string, @Query("q") q?: string) {
    return this.offline.list({ status: status ?? "OPEN", q: q?.slice(0, 80) });
  }

  @Post("offline-invoices/:id/validate")
  async validate(@Auth() auth: AuthState, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(validateSchema)) body: z.infer<typeof validateSchema>) {
    const { payment, periodEnd } = await this.offline.validate(
      id,
      { ...body, paidAt: body.paidAt ? new Date(body.paidAt) : undefined, proofUrl: body.proofUrl || null },
      { userId: auth.user.id, email: auth.user.email },
    );
    return { paymentId: payment.id, periodEnd };
  }

  @Post("offline-invoices/:id/void")
  @HttpCode(204)
  async void(@Auth() auth: AuthState, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(voidSchema)) body: z.infer<typeof voidSchema>) {
    await this.offline.voidByAdmin(id, body.reason, { userId: auth.user.id, email: auth.user.email });
  }

  @Get("bank-accounts")
  bankAccounts() {
    return this.offline.listAllBankAccounts();
  }

  @Post("bank-accounts")
  createBankAccount(@Auth() auth: AuthState, @Body(new ZodPipe(bankAccountSchema)) body: BankAccountDto) {
    return this.offline.saveBankAccount(null, clean(body), { userId: auth.user.id, email: auth.user.email });
  }

  @Patch("bank-accounts/:id")
  updateBankAccount(@Auth() auth: AuthState, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(bankAccountSchema)) body: BankAccountDto) {
    return this.offline.saveBankAccount(id, clean(body), { userId: auth.user.id, email: auth.user.email });
  }

  @Delete("bank-accounts/:id")
  @HttpCode(204)
  async deleteBankAccount(@Auth() auth: AuthState, @Param("id", ParseUUIDPipe) id: string) {
    await this.offline.deleteBankAccount(id, { userId: auth.user.id, email: auth.user.email });
  }
}
