import { Injectable } from "@nestjs/common";
import type { CustomerSource, IdentityKind, Prisma } from "@fove/database";
import {
  computeCustomerSegment,
  customerSchema,
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
import { WebhooksService } from "../notifications/webhooks.service";
import { createCard, readAccessToken } from "../loyalty/cards";
import { cardUrl } from "../cards/cards.service";

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
  ) {}

  /** Création stricte : refuse si un identifiant appartient déjà à un client (pas de fusion automatique). */
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
    await this.plans.assertQuota(ctx.tenantId, "customers");
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
      return result;
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict("customer_exists", "Un client existe déjà avec ces coordonnées");
      throw error;
    }
  }

  async search(ctx: TenantContext, params: { q?: string; cursor?: string; limit: number }) {
    const q = params.q?.trim();
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
    const rows = await this.prisma.client.customer.findMany({
      where,
      take: params.limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { accounts: { select: { id: true, programId: true, balance: true, cardNumber: true, status: true } } },
    });
    const hasMore = rows.length > params.limit;
    const rawData = hasMore ? rows.slice(0, params.limit) : rows;
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
    const limits = await this.plans.limits(ctx.tenantId);
    const usage = await this.plans.usage(ctx.tenantId);
    let room = limits.customers === null ? Infinity : limits.customers - usage.customers;
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
      });
      if (!parsed.success) {
        results.push({ row, status: "invalid", message: parsed.error.issues[0]?.message });
        continue;
      }
      if (room <= 0) {
        results.push({ row, status: "quota", message: "Limite de clients de l'offre atteinte" });
        continue;
      }
      try {
        await this.prisma.client.$transaction(async (tx) => {
          const customer = await this.createInTx(tx, ctx, parsed.data, "IMPORT");
          if (program) await createCard(tx, { tenantId: ctx.tenantId, programId: program.id, customerId: customer.id, status: "ACTIVE" });
        });
        room -= 1;
        results.push({ row, status: "created" });
      } catch (error) {
        const code = (error as { response?: { error?: { code?: string; message?: string } } }).response?.error;
        if (code?.code === "customer_exists" || isUniqueViolation(error)) results.push({ row, status: "duplicate" });
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
    return { summary, results };
  }

  /** Export RGPD : toutes les données d'un client chez ce commerçant. */
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
          anonymizedAt: new Date(),
        },
      });
      await tx.loyaltyAccount.updateMany({ where: { tenantId: ctx.tenantId, customerId: id }, data: { status: "CLOSED" } });
      await tx.otpChallenge.deleteMany({ where: { tenantId: ctx.tenantId, account: { customerId: id } } });
    });
    await this.audit.forTenant(ctx, "customer.anonymized", { type: "customer", id });
  }
}
