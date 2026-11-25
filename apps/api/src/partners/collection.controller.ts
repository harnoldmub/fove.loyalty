import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe";
import { Auth, RequireVerified } from "../common/decorators";
import type { AuthState } from "../common/context";
import { UserRoute } from "../auth/guards";
import { CollectionService } from "./collection.service";
import { PartnersService } from "./partners.service";
import { StatementService } from "./statement.service";

const referenceSchema = z.object({ reference: z.string().trim().min(8).max(30) });
const collectSchema = referenceSchema.extend({
  receiptNumber: z.string().trim().max(60).optional(),
  method: z.enum(["CASH", "MOBILE_MONEY", "BANK_TRANSFER"]).optional(),
});
const invoiceSchema = z.object({ tenantId: z.uuid(), planCode: z.string().min(2).max(40) });
const reportSchema = z.object({ token: z.string().min(10).max(200), note: z.string().trim().max(1000).optional() });

/** Encaissement hors ligne par les partenaires (docs/chantier-encaissement-hors-ligne.md, 6). */
@ApiTags("partners")
@Controller()
export class CollectionController {
  constructor(
    private readonly collection: CollectionService,
    private readonly partners: PartnersService,
    private readonly statements: StatementService,
  ) {}

  /** Plafond, encours, blocage éventuel et historique des encaissements. */
  @Get("partner/collection")
  @UserRoute()
  @RequireVerified()
  async overview(@Auth() auth: AuthState) {
    const partner = await this.partners.getPartnerByUserId(auth.user.id);
    const [status, history, statements] = await Promise.all([this.collection.status(partner.id), this.collection.history(auth.user.id), this.statements.forPartner(partner.id)]);
    return { status, history, statements };
  }

  @Get("partner/collection/clients")
  @UserRoute()
  @RequireVerified()
  clients(@Auth() auth: AuthState) {
    return this.collection.clients(auth.user.id);
  }

  @Get("partner/collection/lookup")
  @UserRoute()
  @RequireVerified()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  lookup(@Auth() auth: AuthState, @Query(new ZodPipe(referenceSchema)) query: z.infer<typeof referenceSchema>) {
    return this.collection.lookup(auth.user.id, query.reference);
  }

  @Post("partner/collection/collect")
  @UserRoute()
  @RequireVerified()
  collect(@Auth() auth: AuthState, @Body(new ZodPipe(collectSchema)) body: z.infer<typeof collectSchema>) {
    return this.collection.collect(auth.user.id, body);
  }

  /** Souscription ou renouvellement d'un de ses clients : facture à encaisser. */
  @Post("partner/collection/invoice")
  @UserRoute()
  @RequireVerified()
  invoice(@Auth() auth: AuthState, @Body(new ZodPipe(invoiceSchema)) body: z.infer<typeof invoiceSchema>) {
    return this.collection.invoiceForClient(auth.user.id, body.tenantId, body.planCode);
  }

  /** Lien « Signaler un problème » de l'email de confirmation envoyé au commerçant. */
  @Post("public/collection-report")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  report(@Body(new ZodPipe(reportSchema)) body: z.infer<typeof reportSchema>) {
    return this.collection.report(body.token, body.note);
  }
}
