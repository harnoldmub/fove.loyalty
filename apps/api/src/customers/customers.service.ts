import { Injectable } from "@nestjs/common";
import type { CustomerSource, IdentityKind, Prisma } from "@fove/database";
import {
  computeCustomerSegment,
  customerSchema,
  isValidBirthday,
  normalizeEmail,
  normalizePhone,
  updateCustomerSchema,
  importCustomersSchema,
} from "@fove/shared";
import type { z } from "zod";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";
import { badRequest, conflict, isUniqueViolation, notFound } from "../common/errors";
import type { TenantContext } from "../common/context";
import { PlanService } from "../billing/plan.service";
import { QuotaAlertService } from "../billing/quota-alert.service";
import { WebhooksService } from "../notifications/webhooks.service";
import { createCard, readAccessToken } from "../loyalty/cards";
import { cardUrl } from "../cards/cards.service";
import { exportHeader, exportRow } from "./customers-export";
import { tenantLocale } from "../i18n/locale";

type Db = Prisma.TransactionClient;

export interface NormalizedIdentity {
  kind: IdentityKind;
  value: string;
}

export async function tenantCountry(db: Db | PrismaService["client"], tenantId: string): Promise<string> {
  const settings = await db.tenantSettings.findUnique({ where: { tenantId }, select: { country: true } });
  return settings?.country ?? "CD";
}

export function buildIdentities(input: { phone?: string | null; email?: string | null; externalRef?: string | null }, country: string) {
  const identities: NormalizedIdentity[] = [];
  let phone: string | null = null;
  if (input.phone) {
    phone = normalizePhone(input.phone, country);
    if (!phone) throw badRequest("invalid_phone", "Numéro de téléphone invalide");
    identities.push({ kind: "PHONE", value: phone });
  }
  const email = input.email ? normalizeEmail(input.email) : null;
  if (email) identities.push({ kind: "EMAIL", value: email });
  const externalRef = input.externalRef?.trim() || null;
  if (externalRef) identities.push({ kind: "EXTERNAL", value: externalRef });
  return { identities, phone, email, externalRef };
}

/** Client déjà connu sur l'un de ces identifiants (téléphone, email, référence externe). */
export async function findByIdentities(db: Db | PrismaService["client"], tenantId: string, identities: NormalizedIdentity[]) {
  if (identities.length === 0) return null;
  const match = await db.customerIdentity.findFirst({
    where: { tenantId, OR: identities.map((i) => ({ kind: i.kind, value: i.value })) },
    select: { customerId: true },
  });
  return match?.customerId ?? null;
}

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly plans: PlanService,
    private readonly webhooks: WebhooksService,
    private readonly quotaAlerts: QuotaAlertService,
  ) {}

  /**
   * Création stricte : refuse si un identifiant appartient déjà à un client (pas
   * de fusion automatique) ou si le quota de clients de l'offre est atteint.
   * Toutes les créations de client passent ici.
   */
  async createInTx(
    tx: Db,
    ctx: TenantContext,
    input: Omit<z.infer<typeof customerSchema>, "tags" | "notes"> & {
      tags?: string[];
      notes?: string | null;
      termsAcceptedAt?: Date | null;
    },
    source: CustomerSource,
  ) {
    const country = await tenantCountry(tx, ctx.tenantId);
    const { identities, phone, email, externalRef } = buildIdentities(input, country);
    const existing = await findByIdentities(tx, ctx.tenantId, identities);
    if (existing) throw conflict("customer_exists", "Un client existe déjà avec ce téléphone, cet email ou cette référence");
    await this.plans.assertCustomerQuotaInTx(tx, ctx.tenantId);
    const now = new Date();
    const customer = await tx.customer.create({
      data: {
        tenantId: ctx.tenantId,
        firstName: input.firstName,
        lastName: input.lastName,
        phone,
        email,
        externalRef,
        source,
        tags: input.tags ?? [],
        notes: input.notes ?? null,
        termsAcceptedAt: input.termsAcceptedAt ?? null,
        marketingEmailConsent: input.marketingEmailConsent,
        marketingSmsConsent: input.marketingSmsConsent,
        consentUpdatedAt: input.marketingEmailConsent || input.marketingSmsConsent ? now : null,
        birthDay: input.birthDay ?? null,
        birthMonth: input.birthMonth ?? null,
      },
    });
    await tx.customerIdentity.createMany({ data: identities.map((i) => ({ ...i, tenantId: ctx.tenantId, customerId: customer.id })) });
    return customer;
  }

  async create(
    ctx: TenantContext,
    input: Omit<z.infer<typeof customerSchema>, "tags" | "notes"> & {
      tags?: string[];
      notes?: string | null;
      programId?: string | null;
    },
    source: CustomerSource = "DASHBOARD",
  ) {
    try {
      const result = await this.prisma.client.$transaction(async (tx) => {
        const customer = await this.createInTx(tx, ctx, input, source);
        let card = null;
        if (input.programId) {
          const program = await tx.loyaltyProgram.findFirst({ where: { id: input.programId, tenantId: ctx.tenantId, active: true } });
          if (!program) throw notFound("Programme");
          card = await createCard(tx, { tenantId: ctx.tenantId, programId: program.id, customerId: customer.id, status: "ACTIVE" });
        }
        return { customer, card };
      });
      await this.audit.forTenant(ctx, "customer.created", { type: "customer", id: result.customer.id }, { source });
      await this.webhooks.emit(ctx.tenantId, "customer.created", { id: result.customer.id, externalRef: result.customer.externalRef });
      await this.quotaAlerts.afterCustomerCreated(ctx.tenantId);
      return result;
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict("customer_exists", "Un client existe déjà avec ces coordonnées");
      throw error;
    }
  }

  async search(ctx: TenantContext, params: { q?: string; cursor?: string; limit: number }) {
    const where = await this.searchWhere(ctx, params.q);
    const rows = await this.prisma.client.customer.findMany({
      where,
      take: params.limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { accounts: { select: { id: true, programId: true, balance: true, cardNumber: true, status: true } } },
    });
    return this.searchResult(rows, params.limit);
  }

  /** Filtre de la recherche (nom, téléphone, email, référence, numéro de carte), partagé par la liste et l'export. */
  private async searchWhere(ctx: TenantContext, rawQ?: string): Promise<Prisma.CustomerWhereInput> {
    const q = rawQ?.trim();
    const where: Prisma.CustomerWhereInput = { tenantId: ctx.tenantId, anonymizedAt: null };
    if (q) {
      const digits = q.replace(/\D/g, "");
      // Numéro saisi avec espaces, tirets ou au format local (081 234 5678) : comparé en E.164.
      const phone = digits.length >= 6 ? normalizePhone(q, await tenantCountry(this.prisma.client, ctx.tenantId)) : null;
      where.OR = [
        ...(phone ? [{ phone }] : []),
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        { email: { contains: q.toLowerCase() } },
        { externalRef: q },
        ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : []),
        { accounts: { some: { cardNumber: q.toUpperCase() } } },
      ];
    }
    return where;
  }

  private searchResult<T extends { id: string; totalVisits: number; totalSpend: Prisma.Decimal; lastVisitAt: Date | null; createdAt: Date }>(rows: T[], limit: number) {
    const hasMore = rows.length > limit;
    const rawData = hasMore ? rows.slice(0, limit) : rows;
    const data = rawData.map((c) => ({
      ...c,
      segment: computeCustomerSegment({
        totalVisits: c.totalVisits,
        totalSpend: c.totalSpend ? Number(c.totalSpend) : 0,
        lastVisitAt: c.lastVisitAt,
        createdAt: c.createdAt,
      }),
    }));
    return { data, nextCursor: hasMore ? data[data.length - 1]!.id : null };
  }

  async get(ctx: TenantContext, id: string) {
    const customer = await this.prisma.client.customer.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        accounts: {
          include: { program: { select: { id: true, name: true, mode: true, stampsTarget: true } } },
          orderBy: { createdAt: "asc" },
        },
        customerNotes: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });
    if (!customer) throw notFound("Client");
    const segment = computeCustomerSegment({
      totalVisits: customer.totalVisits,
      totalSpend: customer.totalSpend ? Number(customer.totalSpend) : 0,
      lastVisitAt: customer.lastVisitAt,
      createdAt: customer.createdAt,
    });
    return {
      ...customer,
      segment,
      accounts: customer.accounts.map(({ accessTokenHash: _h, accessTokenEncrypted, ...a }) => {
        const token = readAccessToken(accessTokenEncrypted);
        return {
          ...a,
          cardUrl: token ? cardUrl(token) : null,
        };
      }),
    };
  }

  async addNote(ctx: TenantContext, customerId: string, content: string, authorName: string, authorId?: string | null) {
    const customer = await this.prisma.client.customer.findFirst({ where: { id: customerId, tenantId: ctx.tenantId } });
    if (!customer) throw notFound("Client");
    const note = await this.prisma.client.customerNote.create({
      data: {
        tenantId: ctx.tenantId,
        customerId,
        content: content.trim(),
        authorName,
        authorId: authorId ?? null,
      },
    });
    await this.audit.forTenant(ctx, "customer.note_added", { type: "customer", id: customerId });
    return note;
  }

  async listNotes(ctx: TenantContext, customerId: string) {
    const customer = await this.prisma.client.customer.findFirst({ where: { id: customerId, tenantId: ctx.tenantId } });
    if (!customer) throw notFound("Client");
    return this.prisma.client.customerNote.findMany({
      where: { tenantId: ctx.tenantId, customerId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  async updateTags(ctx: TenantContext, customerId: string, tags: string[]) {
    const customer = await this.prisma.client.customer.findFirst({ where: { id: customerId, tenantId: ctx.tenantId } });
    if (!customer) throw notFound("Client");
    const updated = await this.prisma.client.customer.update({
      where: { id: customerId },
      data: { tags },
    });
    await this.audit.forTenant(ctx, "customer.tags_updated", { type: "customer", id: customerId }, { tags });
    return updated;
  }

  async update(ctx: TenantContext, id: string, input: z.infer<typeof updateCustomerSchema>) {
    const current = await this.get(ctx, id);
    if (current.anonymizedAt) throw badRequest("anonymized", "Client anonymisé : modification impossible");
    const merged = {
      phone: input.phone !== undefined ? input.phone : current.phone,
      email: input.email !== undefined ? input.email : current.email,
      externalRef: input.externalRef !== undefined ? input.externalRef : current.externalRef,
    };
    if (!merged.phone && !merged.email) throw badRequest("contact_required", "Téléphone ou email requis");
    try {
      await this.prisma.client.$transaction(async (tx) => {
        const country = await tenantCountry(tx, ctx.tenantId);
        const { identities, phone, email, externalRef } = buildIdentities(merged, country);
        const consentChanged = input.marketingEmailConsent !== undefined || input.marketingSmsConsent !== undefined;
        await tx.customer.update({
          where: { id },
          data: {
            firstName: input.firstName,
            lastName: input.lastName,
            phone,
            email,
            externalRef,
            marketingEmailConsent: input.marketingEmailConsent,
            marketingSmsConsent: input.marketingSmsConsent,
            ...(consentChanged ? { consentUpdatedAt: new Date() } : {}),
            ...(input.birthDay !== undefined ? { birthDay: input.birthDay ?? null, birthMonth: input.birthMonth ?? null } : {}),
          },
        });
        await tx.customerIdentity.deleteMany({ where: { tenantId: ctx.tenantId, customerId: id } });
        await tx.customerIdentity.createMany({ data: identities.map((i) => ({ ...i, tenantId: ctx.tenantId, customerId: id })) });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict("customer_exists", "Ces coordonnées appartiennent déjà à un autre client");
      throw error;
    }
    await this.audit.forTenant(ctx, "customer.updated", { type: "customer", id }, { fields: Object.keys(input) });
    return this.get(ctx, id);
  }

  async import(ctx: TenantContext, input: z.infer<typeof importCustomersSchema>) {
    let full = false;
    const program = input.programId
      ? await this.prisma.client.loyaltyProgram.findFirst({ where: { id: input.programId, tenantId: ctx.tenantId } })
      : null;
    if (input.programId && !program) throw notFound("Programme");

    const results: { row: number; status: "created" | "duplicate" | "invalid" | "quota"; message?: string }[] = [];
    for (const [index, raw] of input.rows.entries()) {
      const row = index + 1;
      const pick = (...keys: string[]) => keys.map((k) => raw[k]?.trim()).find((v) => v) ?? null;
      const parsed = customerSchema.safeParse({
        firstName: pick("firstName", "prenom", "prénom", "first_name") ?? "",
        lastName: pick("lastName", "nom", "last_name") ?? "",
        phone: pick("phone", "telephone", "téléphone", "tel"),
        email: pick("email", "mail"),
        externalRef: pick("externalRef", "reference", "référence", "id"),
        ...parseBirthday(pick("birthday", "anniversaire", "date de naissance", "birthdate", "naissance")),
      });
      if (!parsed.success) {
        results.push({ row, status: "invalid", message: parsed.error.issues[0]?.message });
        continue;
      }
      if (full) {
        results.push({ row, status: "quota", message: "Limite de clients de l'offre atteinte" });
        continue;
      }
      try {
        await this.prisma.client.$transaction(async (tx) => {
          const customer = await this.createInTx(tx, ctx, parsed.data, "IMPORT");
          if (program) await createCard(tx, { tenantId: ctx.tenantId, programId: program.id, customerId: customer.id, status: "ACTIVE" });
        });
        results.push({ row, status: "created" });
      } catch (error) {
        const code = (error as { response?: { error?: { code?: string; message?: string } } }).response?.error;
        if (code?.code === "quota_exceeded" || code?.code === "email_not_verified") {
          full = true;
          results.push({ row, status: "quota", message: code.code === "quota_exceeded" ? "Limite de clients de l'offre atteinte" : code.message });
        } else if (code?.code === "customer_exists" || isUniqueViolation(error)) results.push({ row, status: "duplicate" });
        else results.push({ row, status: "invalid", message: code?.message ?? "Ligne invalide" });
      }
    }
    const summary = {
      created: results.filter((r) => r.status === "created").length,
      duplicates: results.filter((r) => r.status === "duplicate").length,
      invalid: results.filter((r) => r.status === "invalid").length,
      overQuota: results.filter((r) => r.status === "quota").length,
    };
    await this.audit.forTenant(ctx, "customer.imported", undefined, summary);
    if (summary.created > 0) await this.quotaAlerts.afterCustomerCreated(ctx.tenantId);
    return { summary, results };
  }

  /** Export RGPD : toutes les données d'un client chez ce commerçant. */
  /**
   * Export du fichier clients (CSV) : les clients non effacés, filtrés comme la liste (recherche, segment),
   * lus par lots de 1 000. En-têtes dans la langue du commerce ; trace dans le journal d'audit.
   */
  async exportCsv(ctx: TenantContext, params: { q?: string; segment?: string }): Promise<{ csv: string; count: number; filename: string }> {
    const tenant = await this.prisma.client.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId }, include: { settings: true } });
    const locale = tenantLocale(tenant.settings);
    const now = new Date();
    const where = await this.searchWhere(ctx, params.q);
    const lines = [exportHeader(locale)];
    let cursor: string | undefined;
    let count = 0;
    for (;;) {
      const batch = await this.prisma.client.customer.findMany({
        where,
        take: 1000,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { id: "asc" },
        include: { accounts: { select: { cardNumber: true, balance: true, status: true, program: { select: { name: true } } } } },
      });
      for (const c of batch) {
        const { line, segment } = exportRow(c, locale, now);
        if (params.segment && params.segment !== segment) continue;
        lines.push(line);
        count += 1;
      }
      if (batch.length < 1000) break;
      cursor = batch[batch.length - 1]!.id;
    }
    await this.audit.forTenant(ctx, "customers.exported", undefined, { count, segment: params.segment ?? null, q: params.q ?? null });
    // BOM : Excel lit l'UTF-8 (accents, arabe) correctement.
    return { csv: `\uFEFF${lines.join("\r\n")}\r\n`, count, filename: `clients-${tenant.slug}-${now.toISOString().slice(0, 10)}.csv` };
  }

  async exportData(ctx: TenantContext, id: string) {
    const customer = await this.prisma.client.customer.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        identities: { select: { kind: true, value: true, verifiedAt: true, createdAt: true } },
        accounts: {
          include: {
            program: { select: { name: true, mode: true } },
            transactions: { orderBy: { createdAt: "asc" } },
            redemptions: { orderBy: { createdAt: "asc" } },
          },
        },
      },
    });
    if (!customer) throw notFound("Client");
    await this.audit.forTenant(ctx, "customer.exported", { type: "customer", id });
    const { accounts, ...profile } = customer;
    return {
      exportedAt: new Date().toISOString(),
      profile,
      accounts: accounts.map(({ accessTokenHash: _h, qrToken: _q, ...a }) => a),
    };
  }

  /**
   * Droit à l'effacement : les données personnelles sont effacées, l'historique
   * comptable des points est conservé sans aucune donnée identifiante.
   */
  async anonymize(ctx: TenantContext, id: string) {
    const customer = await this.get(ctx, id);
    if (customer.anonymizedAt) return;
    await this.prisma.client.$transaction(async (tx) => {
      await tx.customerIdentity.deleteMany({ where: { tenantId: ctx.tenantId, customerId: id } });
      await tx.customer.update({
        where: { id },
        data: {
          firstName: "Client",
          lastName: "anonymisé",
          phone: null,
          email: null,
          externalRef: null,
          marketingEmailConsent: false,
          marketingSmsConsent: false,
          birthDay: null,
          birthMonth: null,
          anonymizedAt: new Date(),
          // Détachée du compte client FOVE : le client ne la retrouve plus dans « Mes cartes ».
          clientAccountId: null,
        },
      });
      await tx.loyaltyAccount.updateMany({ where: { tenantId: ctx.tenantId, customerId: id }, data: { status: "CLOSED" } });
      await tx.otpChallenge.deleteMany({ where: { tenantId: ctx.tenantId, account: { customerId: id } } });
    });
    await this.audit.forTenant(ctx, "customer.anonymized", { type: "customer", id });
  }
}

/**
 * Anniversaire lu dans un import : « JJ/MM », « JJ/MM/AAAA », « JJ-MM », « AAAA-MM-JJ ». Seuls le jour
 * et le mois sont gardés (jamais l'année). Valeur illisible : ignorée, sans bloquer la ligne.
 */
export function parseBirthday(raw: string | null): { birthDay?: number; birthMonth?: number } {
  if (!raw) return {};
  const value = raw.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  const dm = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/.exec(value);
  const [day, month] = iso ? [Number(iso[3]), Number(iso[2])] : dm ? [Number(dm[1]), Number(dm[2])] : [NaN, NaN];
  return isValidBirthday(day, month) ? { birthDay: day, birthMonth: month } : {};
}
