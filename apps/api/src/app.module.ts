import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { PrismaService } from "./common/prisma.service";
import { AuditService } from "./common/audit.service";
import { EmailService } from "./notifications/email.service";
import { TeamAlertService } from "./notifications/team-alert.service";
import { MfaService } from "./auth/mfa.service";
import { AutomationService } from "./automation/automation.service";
import { AutomationController } from "./automation/automation.controller";
import { TeamDigestService } from "./notifications/team-digest.service";
import { BillingEmailService } from "./billing/billing-emails.service";
import { WhatsAppService } from "./notifications/whatsapp.service";
import { WebhooksService } from "./notifications/webhooks.service";
import { SessionService } from "./auth/session.service";
import { AuthService } from "./auth/auth.service";
import { AuthController } from "./auth/auth.controller";
import { ApiKeyGuard, FinanceAccessGuard, PartnerGuard, PublishableKeyGuard, SessionGuard, SuperAdminGuard, TenantGuard } from "./auth/guards";
import { PlanService } from "./billing/plan.service";
import { PricingService } from "./billing/pricing.service";
import { OfflineBillingService } from "./billing/offline.service";
import { ReconciliationService } from "./admin/finance/reconciliation.service";
import { QuotaAlertService } from "./billing/quota-alert.service";
import { BillingService } from "./billing/billing.service";
import { BillingController } from "./billing/billing.controller";
import { TenantsService } from "./tenants/tenants.service";
import { TeamService } from "./tenants/team.service";
import { TenantsController } from "./tenants/tenants.controller";
import { CustomersService } from "./customers/customers.service";
import { CustomersController } from "./customers/customers.controller";
import { LedgerService } from "./loyalty/ledger.service";
import { LoyaltyService } from "./loyalty/loyalty.service";
import { LoyaltyController } from "./loyalty/loyalty.controller";
import { RewardsService } from "./rewards/rewards.service";
import { PublicService } from "./public/public.service";
import { PublicController } from "./public/public.controller";
import { AnalyticsService } from "./analytics/analytics.service";
import { AnalyticsController } from "./analytics/analytics.controller";
import { IntegrationsService } from "./integrations/integrations.service";
import { CommerceService } from "./integrations/commerce.service";
import { IntegrationsController } from "./integrations/integrations.controller";
import { PublicApiController } from "./public-api/public-api.controller";
import { WidgetController } from "./public-api/widget.controller";
import { AdminService } from "./admin/admin.service";
import { AdminController } from "./admin/admin.controller";
import { FinanceService } from "./admin/finance/finance.service";
import { FinanceController } from "./admin/finance/finance.controller";
import { OfflineFinanceController } from "./admin/finance/offline.controller";
import { PartnersService } from "./partners/partners.service";
import { PartnersController } from "./partners/partners.controller";
import { JobsController } from "./jobs/jobs.controller";
import { MediaController } from "./media/media.controller";
import { CardsService } from "./cards/cards.service";
import { GoogleWalletProvider } from "./cards/google-wallet";
import { AppleWalletProvider } from "./cards/apple-wallet";
import { WalletBannerService } from "./cards/wallet-banner.service";
import { AppleWalletServiceController } from "./cards/apple-wallet-service.controller";
import { ClientSessionService } from "./client-account/client-session.service";
import { ClientAccountService } from "./client-account/client-account.service";
import { ClientAccountController } from "./client-account/client-account.controller";
import { ClientSessionGuard } from "./client-account/client-guard";
import { ClientEnrollmentService } from "./client-account/client-enrollment.service";
import { ClientCardsService } from "./client-account/client-cards.service";
import { ReferralService } from "./referrals/referral.service";
import { ClientJoinController } from "./client-account/client-join.controller";

/**
 * Monolithe modulaire : un seul déploiement, des modules métier séparés par
 * dossier (auth, tenants, customers, loyalty, rewards, billing, integrations,
 * analytics, notifications, audit, admin).
 */
@Module({
  imports: [
    // Limiteur en mémoire : suffisant pour une instance. Passer à un stockage
    // partagé (Redis) le jour où l'API tourne sur plusieurs instances.
    ThrottlerModule.forRoot({ throttlers: [{ name: "default", ttl: 60_000, limit: 120 }], skipIf: () => process.env.NODE_ENV === "test" && process.env.TEST_THROTTLE !== "1" }),
  ],
  controllers: [
    AuthController,
    TenantsController,
    CustomersController,
    LoyaltyController,
    PublicController,
    AnalyticsController,
    BillingController,
    IntegrationsController,
    PublicApiController,
    WidgetController,
    AdminController,
    FinanceController,
    OfflineFinanceController,
    PartnersController,
    JobsController,
    MediaController,
    AppleWalletServiceController,
    ClientAccountController,
    ClientJoinController,
    AutomationController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    PrismaService,
    AuditService,
    EmailService,
    TeamAlertService,
    TeamDigestService,
    WhatsAppService,
    WebhooksService,
    SessionService,
    AuthService,
    MfaService,
    AutomationService,
    ClientSessionService,
    ClientAccountService,
    ClientSessionGuard,
    ClientEnrollmentService,
    ClientCardsService,
    ReferralService,
    SessionGuard,
    TenantGuard,
    SuperAdminGuard,
    FinanceAccessGuard,
    PartnerGuard,
    ApiKeyGuard,
    PublishableKeyGuard,
    PlanService,
    PricingService,
    OfflineBillingService,
    BillingEmailService,
    ReconciliationService,
    QuotaAlertService,
    BillingService,
    TenantsService,
    TeamService,
    CustomersService,
    LedgerService,
    LoyaltyService,
    RewardsService,
    PublicService,
    AnalyticsService,
    IntegrationsService,
    CommerceService,
    AdminService,
    FinanceService,
    PartnersService,
    CardsService,
    GoogleWalletProvider,
    AppleWalletProvider,
    WalletBannerService,
  ],
})
export class AppModule {}
