import { Injectable } from "@nestjs/common";
import type { BankStatementEntry, Prisma } from "@fove/database";
import { findPaymentReferences } from "@fove/shared";
import { PrismaService } from "../../common/prisma.service";
import { badRequest, notFound } from "../../common/errors";
import type { AuthState } from "../../common/context";
import { OfflineBillingService } from "../../billing/offline.service";
import { parseBankCsv } from "./bank-csv";

/** Paiement d'un relevé de partenaire reçu à FOVE (H4), branché par StatementService. */
export interface StatementPaymentHandler {
  findOpenByReference(reference: string): Promise<{ id: string; balanceCents: number; paidCents: number; currency: string } | null>;
  recordPayment(statementId: string, amountCents: number, actor: { userId: string; email: string }, bankReference: string): Promise<void>;
}

/**
 * Rapprochement bancaire (docs/chantier-encaissement-hors-ligne.md, 5) : import d'un relevé CSV ou
 * saisie d'une ligne, détection des références FV-… dans le libellé, proposition de la facture ou du
 * relevé de partenaire correspondant, validation en un clic ; un écart de montant est signalé.
 */
@Injectable()
export class ReconciliationService {
  private statements: StatementPaymentHandler | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly offline: OfflineBillingService,
  ) {}

  registerStatements(handler: StatementPaymentHandler) {
    this.statements = handler;
  }

  /** Cherche une référence valide dans le libellé et propose la pièce correspondante. */
  async suggest(entry: Pick<BankStatementEntry, "id" | "label" | "amountCents" | "currency" | "reconciled">): Promise<Prisma.BankStatementEntryUpdateInput | null> {
    if (entry.reconciled || entry.amountCents <= 0) return null;
    for (const ref of findPaymentReferences(entry.label)) {
      if (ref.kind === "invoice") {
        const invoice = await this.prisma.client.invoice.findUnique({ where: { paymentReference: ref.reference } });
        if (invoice?.status === "OPEN") {
          return { suggestedType: "INVOICE", suggestedId: invoice.id, amountMismatch: invoice.amountDueCents !== entry.amountCents || invoice.currency !== entry.currency };
        }
      } else if (this.statements) {
        const statement = await this.statements.findOpenByReference(ref.reference);
        if (statement) {
          const due = statement.balanceCents - statement.paidCents;
          return { suggestedType: "STATEMENT", suggestedId: statement.id, amountMismatch: due !== entry.amountCents || statement.currency !== entry.currency };
        }
      }
    }
    return { suggestedType: null, suggestedId: null, amountMismatch: false };
  }

  private async applySuggestion(entry: BankStatementEntry) {
    const data = await this.suggest(entry);
    if (data) await this.prisma.client.bankStatementEntry.update({ where: { id: entry.id }, data });
    return data?.suggestedId ? 1 : 0;
  }

  /** Import d'un relevé CSV : lignes déjà présentes ignorées, références détectées. */
  async importCsv(auth: AuthState, csv: string, defaultCurrency: string) {
    let parsed;
    try {
      parsed = parseBankCsv(csv);
    } catch (error) {
      throw badRequest("csv_invalid", (error as Error).message);
    }
    const db = this.prisma.client;
    let imported = 0;
    let duplicates = 0;
    let matched = 0;
    for (const row of parsed.rows) {
      const currency = row.currency ?? defaultCurrency;
      const exists = await db.bankStatementEntry.findFirst({ where: { entryDate: row.entryDate, label: row.label, amountCents: row.amountCents, currency } });
      if (exists) {
        duplicates += 1;
        continue;
      }
      const entry = await db.bankStatementEntry.create({ data: { entryDate: row.entryDate, label: row.label, amountCents: row.amountCents, currency, source: "IMPORT_CSV" } });
      imported += 1;
      matched += await this.applySuggestion(entry);
    }
    await db.financialAuditLog.create({
      data: { actorUserId: auth.user.id, actorEmail: auth.user.email, action: "treasury.import_csv", entityType: "bank_entry", entityId: "import", newValue: { imported, duplicates, matched, skipped: parsed.skipped } },
    });
    return { imported, duplicates, matched, skipped: parsed.skipped };
  }

  /** Saisie manuelle d'une ligne de relevé. */
  async createEntry(auth: AuthState, input: { entryDate: Date; label: string; amountCents: number; currency: string; notes?: string | null }) {
    const entry = await this.prisma.client.bankStatementEntry.create({ data: { ...input, notes: input.notes ?? null, source: "MANUAL" } });
    await this.applySuggestion(entry);
    await this.prisma.client.financialAuditLog.create({
      data: { actorUserId: auth.user.id, actorEmail: auth.user.email, action: "treasury.entry_created", entityType: "bank_entry", entityId: entry.id, newValue: { label: input.label, amountCents: input.amountCents, currency: input.currency } },
    });
    return this.prisma.client.bankStatementEntry.findUniqueOrThrow({ where: { id: entry.id } });
  }

  /** Recherche à nouveau les références des lignes non rapprochées (facture créée après l'import…). */
  async rematch() {
    const entries = await this.prisma.client.bankStatementEntry.findMany({ where: { reconciled: false, amountCents: { gt: 0 } }, take: 500 });
    let matched = 0;
    for (const entry of entries) matched += await this.applySuggestion(entry);
    return { checked: entries.length, matched };
  }

  /** Validation en un clic de la proposition : paiement de la facture ou du relevé, ligne rapprochée. */
  async confirm(auth: AuthState, entryId: string) {
    const db = this.prisma.client;
    const entry = await db.bankStatementEntry.findUnique({ where: { id: entryId } });
    if (!entry) throw notFound("Ligne de relevé");
    if (entry.reconciled) throw badRequest("already_reconciled", "Cette ligne est déjà rapprochée");
    if (!entry.suggestedType || !entry.suggestedId) throw badRequest("no_suggestion", "Aucune pièce proposée pour cette ligne");
    const actor = { userId: auth.user.id, email: auth.user.email };

    if (entry.suggestedType === "INVOICE") {
      const invoice = await db.invoice.findUnique({ where: { id: entry.suggestedId } });
      if (!invoice || invoice.status !== "OPEN") throw badRequest("invoice_not_open", "Cette facture n'est plus en attente de paiement");
      if (invoice.currency !== entry.currency) throw badRequest("currency_mismatch", `Monnaie différente : facture en ${invoice.currency}, virement en ${entry.currency}`);
      // Validation explicite d'un montant différent : l'écart est affiché avant le clic.
      const { payment } = await this.offline.validate(
        invoice.id,
        { method: "BANK_TRANSFER", amountCents: entry.amountCents, paidAt: entry.entryDate, bankReference: entry.label.slice(0, 140), acceptShortfall: true, note: "Rapprochement bancaire" },
        actor,
      );
      await db.bankStatementEntry.update({ where: { id: entry.id }, data: { reconciled: true, reconciledType: "PAYMENT", reconciledId: payment.id } });
    } else if (entry.suggestedType === "STATEMENT") {
      if (!this.statements) throw badRequest("no_suggestion", "Relevés de partenaires indisponibles");
      await this.statements.recordPayment(entry.suggestedId, entry.amountCents, actor, entry.label.slice(0, 140));
      await db.bankStatementEntry.update({ where: { id: entry.id }, data: { reconciled: true, reconciledType: "PARTNER_STATEMENT", reconciledId: entry.suggestedId } });
    }
    await db.financialAuditLog.create({
      data: { actorUserId: actor.userId, actorEmail: actor.email, action: "treasury.match_confirmed", entityType: "bank_entry", entityId: entry.id, newValue: { type: entry.suggestedType, id: entry.suggestedId, amountCents: entry.amountCents, mismatch: entry.amountMismatch } },
    });
    return db.bankStatementEntry.findUniqueOrThrow({ where: { id: entry.id } });
  }
}
