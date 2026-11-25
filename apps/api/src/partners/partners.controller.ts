import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { ZodPipe } from "../common/zod.pipe";
import { Auth, RequireVerified } from "../common/decorators";
import type { AuthState } from "../common/context";
import { FinanceRoute, SuperAdminRoute, UserRoute } from "../auth/guards";
import { PartnersService } from "./partners.service";
import { requestLocaleOrNull } from "../i18n/locale";
import {
  partnerApplySchema,
  partnerLeadSchema,
  partnerLeadUpdateSchema,
  partnerPayoutRequestSchema,
  partnerProfileUpdateSchema,
  adminPartnerUpdateSchema,
  adminPayoutActionSchema,
  adminSettingsUpdateSchema,
  type PartnerApplyDto,
  type PartnerLeadDto,
  type PartnerLeadUpdateDto,
  type PartnerPayoutRequestDto,
  type PartnerProfileUpdateDto,
  type AdminPartnerUpdateDto,
  type AdminPayoutActionDto,
  type AdminSettingsUpdateDto,
} from "./partners.dto";

@ApiTags("partners")
@Controller()
export class PartnersController {
  constructor(private readonly partners: PartnersService) {}

  // --- ROUTES PUBLIQUES ------------------------------------------------------

  @Post("partners/apply")
  apply(@Body(new ZodPipe(partnerApplySchema)) body: PartnerApplyDto, @Ip() ip: string, @Req() req: Request) {
    return this.partners.apply(body, ip, requestLocaleOrNull(req));
  }

  @Get("partners/track/:code")
  track(
    @Param("code") code: string,
    @Ip() ip: string,
    @Headers("user-agent") userAgent?: string,
    @Headers("referer") referrer?: string,
    @Query("utm_source") utmSource?: string,
    @Query("utm_medium") utmMedium?: string,
    @Query("utm_campaign") utmCampaign?: string,
  ) {
    return this.partners.trackClick(code, {
      ip,
      userAgent,
      referrer,
      utmSource,
      utmMedium,
      utmCampaign,
    });
  }

  // --- ESPACE PARTENAIRE AUTHENTIFIÉ -----------------------------------------

  @Get("partner/me")
  @UserRoute()
  @RequireVerified()
  getDashboard(@Auth() auth: AuthState) {
    return this.partners.getDashboard(auth.user.id);
  }

  @Post("partner/leads")
  @UserRoute()
  @RequireVerified()
  createLead(
    @Auth() auth: AuthState,
    @Body(new ZodPipe(partnerLeadSchema)) body: PartnerLeadDto,
  ) {
    return this.partners.createLead(auth.user.id, body);
  }

  @Patch("partner/leads/:id")
  @UserRoute()
  @RequireVerified()
  updateLead(
    @Auth() auth: AuthState,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(partnerLeadUpdateSchema)) body: PartnerLeadUpdateDto,
  ) {
    return this.partners.updateLead(auth.user.id, id, body);
  }

  @Post("partner/payouts/request")
  @UserRoute()
  @RequireVerified()
  requestPayout(
    @Auth() auth: AuthState,
    @Body(new ZodPipe(partnerPayoutRequestSchema)) body: PartnerPayoutRequestDto,
  ) {
    return this.partners.requestPayout(auth.user.id, body);
  }

  @Patch("partner/profile")
  @UserRoute()
  @RequireVerified()
  updateProfile(
    @Auth() auth: AuthState,
    @Body(new ZodPipe(partnerProfileUpdateSchema)) body: PartnerProfileUpdateDto,
  ) {
    return this.partners.updateProfile(auth.user.id, body);
  }

  // --- ADMINISTRATION & GOUVERNANCE ------------------------------------------

  @Get("admin/partners")
  @FinanceRoute()
  adminListPartners(@Query("status") status?: string) {
    return this.partners.adminListPartners({ status });
  }

  @Post("admin/partners/:id/approve")
  @FinanceRoute()
  adminApprove(@Auth() auth: AuthState, @Param("id", ParseUUIDPipe) id: string) {
    return this.partners.adminApprove(id, auth);
  }

  @Post("admin/partners/:id/reject")
  @FinanceRoute()
  adminReject(
    @Auth() auth: AuthState,
    @Param("id", ParseUUIDPipe) id: string,
    @Body("reason") reason: string,
  ) {
    return this.partners.adminReject(id, reason || "Dossier non retenu", auth);
  }

  @Patch("admin/partners/:id")
  @FinanceRoute()
  adminUpdatePartner(
    @Auth() auth: AuthState,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(adminPartnerUpdateSchema)) body: AdminPartnerUpdateDto,
  ) {
    return this.partners.adminUpdatePartner(id, body, auth);
  }

  @Post("admin/partners/payouts/:id/process")
  @FinanceRoute()
  adminProcessPayout(
    @Auth() auth: AuthState,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(adminPayoutActionSchema)) body: AdminPayoutActionDto,
  ) {
    return this.partners.adminProcessPayout(id, body, auth);
  }

  @Get("admin/partners/settings")
  @FinanceRoute()
  adminGetSettings() {
    return this.partners.getSettings();
  }

  @Patch("admin/partners/settings")
  @FinanceRoute()
  adminUpdateSettings(
    @Auth() auth: AuthState,
    @Body(new ZodPipe(adminSettingsUpdateSchema)) body: AdminSettingsUpdateDto,
  ) {
    return this.partners.adminUpdateSettings(body, auth);
  }
}
