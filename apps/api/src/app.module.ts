import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { PrismaService } from "./common/prisma.service";
import { AuditService } from "./common/audit.service";
import { EmailService } from "./notifications/email.service";
import { WhatsAppService } from "./notifications/whatsapp.service";
import { WebhooksService } from "./notifications/webhooks.service";
import { SessionService } from "./auth/session.service";
import { AuthService } from "./auth/auth.service";
import { AuthController } from "./auth/auth.controller";
import { ApiKeyGuard, PublishableKeyGuard, SessionGuard, SuperAdminGuard, TenantGuard } from "./auth/guards";
import { PlanService } from "./billing/plan.service";
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
import { JobsController } from "./jobs/jobs.controller";
import { MediaController } from "./media/media.controller";
import { CardsService } from "./cards/cards.service";
import { GoogleWalletProvider } from "./cards/google-wallet";

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
    JobsController,
    MediaController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    PrismaService,
    AuditService,
    EmailService,
    WhatsAppService,
    WebhooksService,
    SessionService,
    AuthService,
    SessionGuard,
    TenantGuard,
    SuperAdminGuard,
    ApiKeyGuard,
    PublishableKeyGuard,
    PlanService,
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
    CardsService,
    GoogleWalletProvider,
  ],
})
export class AppModule {}
