import http2 from "node:http2";
import { Injectable, Logger } from "@nestjs/common";
import { PKPass } from "passkit-generator";
import sharp from "sharp";
import { PrismaService } from "../common/prisma.service";
import { loadConfig } from "../config";
import { WalletBannerService } from "./wallet-banner.service";

function certificate(value: string | undefined, label: string): Buffer {
  if (!value) throw new Error(`${label} manquant.`);
  try {
    return Buffer.from(value, "base64");
  } catch {
    throw new Error(`${label} invalide.`);
  }
}

/** « oct. 2026 » : mois et année d'inscription. */
export const memberSince = (date: Date) =>
  date.toLocaleDateString("fr-FR", { month: "short", year: "numeric" });

async function passLogoImages(logoBuffer: Buffer | null, tenantName: string, primaryColor: string) {
  let input = logoBuffer;
  if (!input) {
    const initial = (tenantName[0] ?? "F").toUpperCase();
    const svg = `<svg width="200" height="200" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <rect width="200" height="200" rx="40" fill="${primaryColor}" />
      <text x="100" y="135" font-family="system-ui, -apple-system, sans-serif" font-size="110" font-weight="bold" fill="#ffffff" text-anchor="middle">${initial}</text>
    </svg>`;
    input = await sharp(Buffer.from(svg)).png().toBuffer();
  }

  const contain = (width: number, height: number, position: "centre" | "left" = "centre") =>
    sharp(input!)
      .resize(width, height, { fit: "contain", position, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

  return {
    "icon.png": await contain(29, 29),
    "icon@2x.png": await contain(58, 58),
    "icon@3x.png": await contain(87, 87),
    "logo.png": await contain(160, 50, "left"),
    "logo@2x.png": await contain(320, 100, "left"),
    "logo@3x.png": await contain(480, 150, "left"),
  };
}

export interface AppleWalletCardAccount {
  id: string;
  tenantId: string;
  qrToken: string;
  cardNumber: string;
  balance: number;
  createdAt: Date;
  customer: { firstName: string | null; lastName: string | null };
  program: {
    name: string;
    mode: string;
    stampsTarget: number;
    currency: string;
    terms?: string | null;
  };
  tenant: {
    id: string;
    name: string;
    slug: string;
    settings: {
      primaryColor?: string | null;
      logoUrl?: string | null;
      contactEmail?: string | null;
    } | null;
  };
}

@Injectable()
export class AppleWalletProvider {
  private readonly logger = new Logger("AppleWallet");

  constructor(
    private readonly prisma: PrismaService,
    private readonly banners: WalletBannerService,
  ) {}

  isConfigured(): boolean {
    return loadConfig().appleWalletEnabled;
  }

  /** Génère un pass fidélité Apple Wallet (.pkpass signé). */
  async generatePass(account: AppleWalletCardAccount, logoBuffer: Buffer | null): Promise<Buffer> {
    const cfg = loadConfig();
    if (!cfg.appleWalletEnabled) {
      throw new Error("Apple Wallet n'est pas configuré sur ce serveur.");
    }

    const holder = [account.customer.firstName, account.customer.lastName].filter(Boolean).join(" ") || "Membre";
    const primaryColor = account.tenant.settings?.primaryColor ?? "#1F4FFF";
    const isStamps = account.program.mode === "STAMPS";

    const [images, strip] = await Promise.all([
      passLogoImages(logoBuffer, account.tenant.name, primaryColor),
      this.banners.appleStripImages(account.tenantId),
    ]);

    const passJson = {
      formatVersion: 1,
      passTypeIdentifier: cfg.APPLE_WALLET_PASS_TYPE_ID,
      teamIdentifier: cfg.APPLE_WALLET_TEAM_ID,
      organizationName: account.tenant.name,
      description: `Carte fidélité ${account.tenant.name}`,
      serialNumber: account.id,
      webServiceURL: `${cfg.API_URL}/api/loyalty/apple-wallet-service`,
      authenticationToken: account.qrToken,
      foregroundColor: "rgb(17, 17, 17)",
      backgroundColor: "rgb(255, 255, 255)",
      labelColor: "rgb(17, 17, 17)",
      storeCard: {
        headerFields: [
          {
            key: "balance",
            label: isStamps ? "PASSAGES" : "POINTS",
            value: isStamps ? `${Math.max(0, account.balance)}/${account.program.stampsTarget}` : `${Math.max(0, account.balance)}`,
            changeMessage: `${account.tenant.name} : %@`,
            textAlignment: "PKTextAlignmentRight",
          },
        ],
        primaryFields: [],
        secondaryFields: [
          { key: "holder", label: "MEMBRE", value: holder },
          { key: "since", label: "MEMBRE DEPUIS", value: memberSince(account.createdAt), textAlignment: "PKTextAlignmentRight" },
        ],
        backFields: [
          { key: "number", label: "Numéro de carte", value: account.cardNumber },
          {
            key: "rules",
            label: "Fonctionnement",
            value: isStamps
              ? `Présentez cette carte à chaque passage en boutique. Après ${account.program.stampsTarget} passages, profitez de votre récompense offerte.`
              : `Présentez cette carte à chaque achat pour cumuler des points et débloquer des réductions.`,
          },
          { key: "website", label: "Page du commerce", value: `${cfg.APP_URL}/${account.tenant.slug}` },
        ],
      },
      barcodes: [
        {
          format: "PKBarcodeFormatQR",
          message: account.qrToken,
          messageEncoding: "iso-8859-1",
          altText: account.cardNumber,
        },
      ],
    };

    const pass = new PKPass(
      { ...images, ...strip, "pass.json": Buffer.from(JSON.stringify(passJson)) },
      {
        wwdr: certificate(cfg.APPLE_WALLET_WWDR_PEM_BASE64, "Certificat WWDR"),
        signerCert: certificate(cfg.APPLE_WALLET_SIGNER_CERT_PEM_BASE64, "Certificat Apple Wallet"),
        signerKey: certificate(cfg.APPLE_WALLET_SIGNER_KEY_PEM_BASE64, "Clé Apple Wallet"),
        ...(cfg.APPLE_WALLET_SIGNER_KEY_PASSPHRASE ? { signerKeyPassphrase: cfg.APPLE_WALLET_SIGNER_KEY_PASSPHRASE } : {}),
      },
    );

    return pass.getAsBuffer();
  }

  /** Envoi de notifications push APNs HTTP/2 pour forcer la mise à jour des pass sur iPhone. */
  async sendApnsPassUpdate(pushTokens: string[]): Promise<{ sent: number; failed: number }> {
    const cfg = loadConfig();
    if (!cfg.appleWalletEnabled || !pushTokens.length) return { sent: 0, failed: 0 };

    const cert = certificate(cfg.APPLE_WALLET_SIGNER_CERT_PEM_BASE64, "Certificat Apple Wallet");
    const key = certificate(cfg.APPLE_WALLET_SIGNER_KEY_PEM_BASE64, "Clé Apple Wallet");

    return new Promise((resolve) => {
      let client: http2.ClientHttp2Session | null = null;
      try {
        client = http2.connect("https://api.push.apple.com:443", { cert, key });
      } catch (err) {
        this.logger.error("Erreur de connexion APNs :", err);
        return resolve({ sent: 0, failed: pushTokens.length });
      }

      client.on("error", (err) => {
        this.logger.error("Erreur client APNs :", err);
        resolve({ sent: 0, failed: pushTokens.length });
      });

      let completed = 0;
      let sent = 0;
      let failed = 0;

      const finalize = () => {
        if (completed >= pushTokens.length) {
          try {
            client?.close();
          } catch {}
          resolve({ sent, failed });
        }
      };

      for (const token of pushTokens) {
        try {
          const req = client.request({
            ":method": "POST",
            ":path": `/3/device/${token}`,
            "apns-topic": cfg.APPLE_WALLET_PASS_TYPE_ID!,
            "apns-push-type": "background",
            "apns-priority": "10",
          });

          req.on("response", (headers) => {
            const status = headers[":status"];
            if (status === 200) {
              sent++;
            } else {
              failed++;
            }
            completed++;
            finalize();
          });

          req.on("error", () => {
            failed++;
            completed++;
            finalize();
          });

          req.end(JSON.stringify({}));
        } catch {
          failed++;
          completed++;
          finalize();
        }
      }
    });
  }

  /** Prévient l'iPhone d'un client spécifique quand son solde change. */
  async notifyAccount(accountId: string): Promise<{ sent: number; failed: number }> {
    const registrations = await this.prisma.client.appleWalletRegistration.findMany({
      where: { serialNumber: accountId },
      select: { pushToken: true },
      distinct: ["pushToken"],
    });

    if (!registrations.length) return { sent: 0, failed: 0 };
    return this.sendApnsPassUpdate(registrations.map((r) => r.pushToken));
  }

  /** Prévient tous les iPhone enregistrés pour un commerce (ex. après modification de bannière). */
  async broadcastTenant(tenantId: string): Promise<{ sent: number; failed: number }> {
    const registrations = await this.prisma.client.appleWalletRegistration.findMany({
      where: { tenantId },
      select: { pushToken: true },
      distinct: ["pushToken"],
    });

    if (!registrations.length) return { sent: 0, failed: 0 };
    return this.sendApnsPassUpdate(registrations.map((r) => r.pushToken));
  }
}
