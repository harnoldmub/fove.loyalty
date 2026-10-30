import { rewardValueLabel } from "@fove/shared";
import { Injectable, Logger } from "@nestjs/common";
import { loadConfig } from "../config";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";
import { notFound } from "../common/errors";
import type { TenantContext } from "../common/context";
import { newAccessToken, readAccessToken } from "../loyalty/cards";
import type { WalletCardState } from "../loyalty/wallet";
import { renderCardPdf, renderCardPng, type CardDesign } from "./card-render";
import { GoogleWalletProvider } from "./google-wallet";
import { WhatsAppService } from "../notifications/whatsapp.service";

export function cardUrl(accessToken: string): string {
  return `${loadConfig().APP_URL}/card/${accessToken}`;
}

const MEDIA_URL = /\/api\/media\/([0-9a-f-]{36})$/;

/**
 * Tout ce qui touche à la carte du client : lien stable, partage WhatsApp,
 * fichiers image/PDF, Google Wallet. Aucune de ces fonctions ne modifie le solde.
 */
@Injectable()
export class CardsService {
  private readonly logger = new Logger("Cards");

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    readonly wallet: GoogleWalletProvider,
    private readonly whatsapp: WhatsAppService,
  ) {}

  private load(where: { id: string; tenantId: string } | { accessTokenHash: string }) {
    return this.prisma.client.loyaltyAccount.findFirst({
      where,
      include: {
        customer: { select: { firstName: true, lastName: true, phone: true, email: true } },
        program: true,
        tenant: { include: { settings: true } },
      },
    });
  }

  /** Lien de la carte : le lien existant, ou un premier lien pour une carte qui n'en a pas encore. */
  async linkFor(accountId: string, tenantId: string, renew = false): Promise<string> {
    const account = await this.prisma.client.loyaltyAccount.findFirst({ where: { id: accountId, tenantId }, select: { accessTokenEncrypted: true } });
    if (!account) throw notFound("Carte");
    const existing = renew ? null : readAccessToken(account.accessTokenEncrypted);
    if (existing) return cardUrl(existing);
    const fresh = newAccessToken();
    await this.prisma.client.loyaltyAccount.update({ where: { id: accountId }, data: { accessTokenHash: fresh.accessTokenHash, accessTokenEncrypted: fresh.accessTokenEncrypted } });
    return cardUrl(fresh.accessToken);
  }

  /** Lien à envoyer au client, avec le message WhatsApp prêt à partir. */
  async share(ctx: TenantContext, accountId: string, renew: boolean) {
    const account = await this.load({ id: accountId, tenantId: ctx.tenantId });
    if (!account || account.status === "CLOSED") throw notFound("Carte");
    const url = await this.linkFor(accountId, ctx.tenantId, renew);
    if (renew) await this.audit.forTenant(ctx, "account.link_renewed", { type: "account", id: accountId });
    const reward = await this.firstReward(account.tenantId, account.programId);
    const greeting = account.customer.firstName ? `Bonjour ${account.customer.firstName}, voici` : "Voici";
    const message = `${greeting} votre carte de fidélité ${account.tenant.name} : ${url}\nPrésentez son QR code à chaque passage. ${this.rule(account.program, reward?.name)}.`;
    const rawPhone = account.customer.phone ?? "";
    const phone = rawPhone.replace(/\D/g, "");
    const hasPhone = phone.length >= 8;
    let cloudSent = false;
    if (hasPhone && this.whatsapp.isConfigured()) {
      const sent = await this.whatsapp.send(rawPhone, message);
      cloudSent = sent.sent;
    }
    return { url, message, hasPhone, cloudSent, whatsapp: `https://wa.me/${hasPhone ? phone : ""}?text=${encodeURIComponent(message)}` };
  }

  private firstReward(tenantId: string, programId: string) {
    return this.prisma.client.reward.findFirst({ where: { tenantId, programId, active: true, archivedAt: null }, orderBy: { cost: "asc" } });
  }

  rule(program: { mode: string; stampsTarget: number; spendStep: { toString(): string }; pointsPerStep: number; currency: string; name: string }, rewardName?: string) {
    if (program.mode === "STAMPS") return `${program.stampsTarget} tampons = ${rewardName ?? "une récompense"}`;
    const step = new Intl.NumberFormat("fr-FR").format(Number(program.spendStep.toString()));
    return `${step} ${program.currency} = ${program.pointsPerStep} point${program.pointsPerStep > 1 ? "s" : ""}`;
  }

  private async logo(tenantId: string, logoUrl: string | null): Promise<Buffer | null> {
    // Seuls les logos hébergés par FOVE sont chargés : pas de requête vers une URL arbitraire.
    const id = logoUrl ? MEDIA_URL.exec(logoUrl)?.[1] : null;
    if (!id) return null;
    const asset = await this.prisma.client.mediaAsset.findFirst({ where: { id, tenantId } });
    return asset?.data ? Buffer.from(asset.data) : null;
  }

  async walletState(accountId: string, tenantId: string): Promise<WalletCardState> {
    const account = await this.load({ id: accountId, tenantId });
    if (!account) throw notFound("Carte");
    const rewards = await this.prisma.client.reward.findMany({ where: { tenantId, programId: account.programId, active: true, archivedAt: null }, orderBy: { cost: "asc" }, take: 6 });
    const s = account.tenant.settings;
    return {
      accountId: account.id,
      programId: account.programId,
      tenantName: account.tenant.name,
      programName: account.program.name,
      holder: [account.customer.firstName, account.customer.lastName].filter(Boolean).join(" ") || "Membre",
      cardNumber: account.cardNumber,
      qrPayload: account.qrToken,
      cardUrl: await this.linkFor(account.id, tenantId),
      balance: account.balance,
      unit: account.program.mode === "STAMPS" ? "tampons" : "points",
      primaryColor: /^#[0-9a-fA-F]{6}$/.test(s?.primaryColor ?? "") ? s!.primaryColor : "#2C55F5",
      logoUrl: s?.logoUrl ?? null,
      rewardSummary: rewards.map((r) => `${r.name}${r.kind === "GIFT" ? "" : ` : ${rewardValueLabel({ kind: r.kind, value: r.value?.toString() ?? null }, account.program.currency)}`} — ${r.cost} ${account.program.mode === "STAMPS" ? "tampons" : "points"}`).join("\n"),
    };
  }

  async refreshProgramWallet(tenantId: string, programId?: string): Promise<void> {
    if (!this.wallet.isConfigured()) return;
    const programs = await this.prisma.client.loyaltyProgram.findMany({ where: { tenantId, ...(programId ? { id: programId } : {}) }, select: { id: true } });
    for (const program of programs) {
      const account = await this.prisma.client.loyaltyAccount.findFirst({ where: { tenantId, programId: program.id, status: "ACTIVE" }, select: { id: true } });
      if (account) {
        try { await this.wallet.updateProgram(await this.walletState(account.id, tenantId)); }
        catch { this.logger.warn("Synchronisation du programme Wallet différée"); }
      }
    }
  }

  /** Fichier de la carte depuis son lien public. */
  async file(accessTokenHash: string, format: "png" | "pdf") {
    const account = await this.load({ accessTokenHash });
    if (!account || account.status === "CLOSED" || account.tenant.status !== "ACTIVE") throw notFound("Carte");
    const reward = await this.firstReward(account.tenantId, account.programId);
    const design: CardDesign = {
      tenantName: account.tenant.name,
      logo: await this.logo(account.tenantId, account.tenant.settings?.logoUrl ?? null),
      primaryColor: account.tenant.settings?.primaryColor ?? "#2C55F5",
      holder: [account.customer.firstName, account.customer.lastName].filter(Boolean).join(" ") || "Membre",
      cardNumber: account.cardNumber,
      qrPayload: account.qrToken,
      url: await this.linkFor(account.id, account.tenantId),
      rule: this.rule(account.program, reward?.name),
    };
    const body = format === "png" ? await renderCardPng(design) : await renderCardPdf(design);
    const slug = account.tenant.slug.replace(/[^a-z0-9-]/g, "");
    return { body, filename: `carte-fidelite-${slug}.${format}` };
  }

  async walletSaveUrl(accessTokenHash: string) {
    const account = await this.prisma.client.loyaltyAccount.findUnique({ where: { accessTokenHash }, select: { id: true, tenantId: true, status: true } });
    if (!account || account.status === "CLOSED") throw notFound("Carte");
    return this.wallet.createPass(await this.walletState(account.id, account.tenantId));
  }

  /** Solde à jour sur la carte Google Wallet, en arrière-plan. */
  refreshWallet(tenantId: string, accountId: string): void {
    if (!this.wallet.isConfigured()) return;
    void this.walletState(accountId, tenantId)
      .then((state) => this.wallet.updatePass(state))
      .catch((error) => this.logger.warn(`Pass ${accountId} : ${error instanceof Error ? error.message : error}`));
  }

  async walletMessage(ctx: TenantContext, accountId: string, message: { title: string; body: string }) {
    const account = await this.prisma.client.loyaltyAccount.findFirst({ where: { id: accountId, tenantId: ctx.tenantId } });
    if (!account) throw notFound("Carte");
    await this.wallet.sendToCard(accountId, message);
    await this.audit.forTenant(ctx, "wallet.message_sent", { type: "account", id: accountId }, { title: message.title });
  }

  async walletBroadcast(ctx: TenantContext, programId: string, message: { title: string; body: string }) {
    const program = await this.prisma.client.loyaltyProgram.findFirst({ where: { id: programId, tenantId: ctx.tenantId } });
    if (!program) throw notFound("Programme");
    await this.wallet.broadcast(programId, message);
    await this.audit.forTenant(ctx, "wallet.broadcast_sent", { type: "program", id: programId }, { title: message.title });
  }
}
