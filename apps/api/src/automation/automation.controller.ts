import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Put } from "@nestjs/common";
import { ApiExcludeEndpoint, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { safeEqual } from "../common/crypto";
import { ZodPipe } from "../common/zod.pipe";
import { RequirePermission, Tenant, RegisterAllowed } from "../common/decorators";
import type { TenantContext } from "../common/context";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";
import { TenantRoute } from "../auth/guards";
import { AutomationService, unsubscribeSignature } from "./automation.service";

const KINDS = ["NEAR_REWARD", "REWARD_WAITING", "AT_RISK", "DORMANT", "BIRTHDAY"] as const;
const text = (max: number) => z.string().trim().max(max).nullable().optional();
const ruleSchema = z.object({
  enabled: z.boolean(),
  title: text(60),
  body: text(180),
  bonus: z.int().min(0).max(1000).nullable().optional(),
  giftLabel: text(60),
  daysBefore: z.int().min(0).max(14).optional(),
  daysAfter: z.int().min(0).max(30).optional(),
  dayTitle: text(60),
  dayBody: text(180),
});

const contactedSchema = z.object({
  customerId: z.uuid(),
  scenario: z.enum(["NEAR_REWARD", "REWARD_WAITING", "AT_RISK", "DORMANT", "BIRTHDAY_DAY"]),
});

/** Relances automatiques et anniversaire (docs/chantier-relances-anniversaire.md). */
@ApiTags("app")
@Controller()
export class AutomationController {
  constructor(
    private readonly automation: AutomationService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get("app/automations")
  @TenantRoute()
  @RequirePermission("programs.read")
  rules(@Tenant() ctx: TenantContext) {
    return this.automation.rules(ctx.tenantId);
  }

  @Put("app/automations/:kind")
  @TenantRoute()
  @RequirePermission("programs.write")
  update(@Tenant() ctx: TenantContext, @Param("kind", new ZodPipe(z.enum(KINDS))) kind: (typeof KINDS)[number], @Body(new ZodPipe(ruleSchema)) body: z.infer<typeof ruleSchema>) {
    return this.automation.updateRule(ctx, kind, body);
  }

  @Get("app/automations/stats")
  @TenantRoute()
  @RequirePermission("analytics.read")
  stats(@Tenant() ctx: TenantContext) {
    return this.automation.stats(ctx.tenantId);
  }

  /** Liste « À relancer » (toutes offres) : le commerçant envoie lui-même le message WhatsApp. */
  @Get("app/automations/to-contact")
  @TenantRoute()
  @RequirePermission("customers.read")
  toContact(@Tenant() ctx: TenantContext) {
    return this.automation.toContact(ctx.tenantId);
  }

  @Post("app/automations/contacted")
  @TenantRoute()
  @RequirePermission("customers.read")
  @HttpCode(200)
  contacted(@Tenant() ctx: TenantContext, @Body(new ZodPipe(contactedSchema)) body: z.infer<typeof contactedSchema>) {
    return this.automation.markContacted(ctx, body.customerId, body.scenario);
  }

  /** Cadeau d'anniversaire utilisé en caisse (une seule fois). */
  @Post("app/accounts/:id/birthday-gift/use")
  @RegisterAllowed()
  @TenantRoute()
  @RequirePermission("transactions.create")
  @HttpCode(200)
  useGift(@Tenant() ctx: TenantContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.automation.useGift(ctx, id);
  }

  /** Lien de désinscription des emails d'un commerce (pied de chaque email de relance). */
  @Get("public/unsubscribe/:customerId/:signature")
  @ApiExcludeEndpoint()
  @Header("Content-Type", "text/html; charset=utf-8")
  @Header("Cache-Control", "no-store")
  async unsubscribe(@Param("customerId", ParseUUIDPipe) customerId: string, @Param("signature") signature: string) {
    if (!safeEqual(signature, unsubscribeSignature(customerId))) return page("Lien invalide", "Ce lien de désinscription n'est pas valide.");
    const customer = await this.prisma.client.customer.findUnique({ where: { id: customerId }, include: { tenant: { select: { name: true } } } });
    if (!customer) return page("Lien invalide", "Ce lien de désinscription n'est pas valide.");
    if (customer.marketingEmailConsent) {
      await this.prisma.client.customer.update({ where: { id: customerId }, data: { marketingEmailConsent: false, consentUpdatedAt: new Date() } });
      await this.audit.log({ tenantId: customer.tenantId, action: "customer.unsubscribed", targetType: "customer", targetId: customerId });
    }
    return page("Désinscription enregistrée", `Vous ne recevrez plus d'emails d'offres de ${customer.tenant.name}. Votre carte de fidélité reste active.`);
  }
}

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const page = (title: string, body: string) =>
  `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head><body style="font-family:system-ui,sans-serif;background:#f6f7fb;color:#14204a;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px"><main style="max-width:420px;background:#fff;border:1px solid #dce1ec;border-radius:16px;padding:28px"><h1 style="font-size:20px;margin:0 0 8px">${esc(title)}</h1><p style="margin:0;color:#4a5579">${esc(body)}</p></main></body></html>`;
