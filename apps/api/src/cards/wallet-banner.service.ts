import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Injectable, Logger } from "@nestjs/common";
import satori from "satori";
import sharp from "sharp";
import { PrismaService } from "../common/prisma.service";
import { loadConfig } from "../config";

const MEDIA_URL = /\/api\/media\/([0-9a-f-]{36})$/;

let fontsPromise: Promise<{ name: string; data: Buffer; weight: 400 | 600 | 700; style: "normal" }[]> | null = null;
function loadBannerFonts() {
  const file = (pkg: string, name: string) => {
    const pkgPath = require.resolve(`${pkg}/package.json`, { paths: [process.cwd(), join(process.cwd(), "apps/api")] });
    return readFile(join(pkgPath, "..", "files", name));
  };
  fontsPromise ??= Promise.all([
    file("@fontsource/bricolage-grotesque", "bricolage-grotesque-latin-700-normal.woff").then((data) => ({
      name: "Bricolage",
      data,
      weight: 700 as const,
      style: "normal" as const,
    })),
    file("@fontsource/figtree", "figtree-latin-600-normal.woff").then((data) => ({
      name: "Figtree",
      data,
      weight: 600 as const,
      style: "normal" as const,
    })),
    file("@fontsource/figtree", "figtree-latin-400-normal.woff").then((data) => ({
      name: "Figtree",
      data,
      weight: 400 as const,
      style: "normal" as const,
    })),
  ]);
  return fontsPromise;
}

@Injectable()
export class WalletBannerService {
  private readonly logger = new Logger("WalletBannerService");

  constructor(private readonly prisma: PrismaService) {}

  private safeColor(color: string | null | undefined): string {
    return /^#[0-9a-fA-F]{6}$/.test(color ?? "") ? color! : "#1F4FFF";
  }

  /** Génère la bannière par défaut au format 2250 × 864 px (nom du commerce + règle de fidélité). */
  async defaultBanner(tenant: { name: string; primaryColor?: string }, ruleText: string): Promise<Buffer> {
    const width = 2250;
    const height = 864;
    const color = this.safeColor(tenant.primaryColor);
    const fonts = await loadBannerFonts();

    const svg = await satori(
      {
        type: "div",
        props: {
          style: {
            width,
            height,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: color,
            color: "#FFFFFF",
            textAlign: "center",
            padding: "40px 80px",
          },
          children: [
            {
              type: "div",
              props: {
                style: {
                  fontFamily: "Bricolage",
                  fontWeight: 700,
                  fontSize: tenant.name.length > 20 ? 150 : 200,
                  lineHeight: 1.1,
                  letterSpacing: -2,
                  textTransform: "uppercase",
                },
                children: tenant.name,
              },
            },
            {
              type: "div",
              props: {
                style: {
                  marginTop: 40,
                  fontFamily: "Figtree",
                  fontWeight: 600,
                  fontSize: 78,
                  letterSpacing: 4,
                  textTransform: "uppercase",
                  opacity: 0.95,
                  backgroundColor: "rgba(0,0,0,0.18)",
                  padding: "16px 48px",
                  borderRadius: 24,
                },
                children: ruleText,
              },
            },
          ],
        },
      } as never,
      { width, height, fonts },
    );

    return sharp(Buffer.from(svg)).png().toBuffer();
  }

  /** Récupère la source de la bannière (image personnalisée ou bannière par défaut). */
  async getBannerSource(tenantId: string): Promise<Buffer> {
    const tenant = await this.prisma.client.tenant.findUnique({
      where: { id: tenantId },
      include: {
        settings: true,
        programs: { where: { active: true }, take: 1 },
      },
    });

    if (!tenant) throw new Error("Tenant non trouvé");

    // 1. Si une bannière personnalisée a été enregistrée
    if (tenant.settings?.walletBannerUrl) {
      const match = MEDIA_URL.exec(tenant.settings.walletBannerUrl);
      if (match?.[1]) {
        const asset = await this.prisma.client.mediaAsset.findFirst({
          where: { id: match[1], tenantId },
        });
        if (asset?.data) return Buffer.from(asset.data);
      }
    }

    // 2. Sinon, générer la bannière par défaut
    const program = tenant.programs[0];
    let ruleText = "CARTE DE FIDÉLITÉ OFFICIELLE";
    if (program) {
      if (program.mode === "STAMPS") {
        ruleText = `${program.stampsTarget} TAMPONS = RÉCOMPENSE OFFERTE`;
      } else {
        ruleText = `1 PASSAGE = 1 POINT FIDÉLITÉ`;
      }
    }

    return this.defaultBanner(
      { name: tenant.name, primaryColor: tenant.settings?.primaryColor },
      ruleText,
    );
  }

  /** Images pour le bandeau Apple Wallet (storeCard strip) : 375 × 144 points en 1x, 2x, 3x. */
  async appleStripImages(tenantId: string): Promise<Record<string, Buffer>> {
    const source = await this.getBannerSource(tenantId);
    const strip = (scale: number) =>
      sharp(source)
        .resize(375 * scale, 144 * scale, { fit: "cover" })
        .png()
        .toBuffer();

    return {
      "strip.png": await strip(1),
      "strip@2x.png": await strip(2),
      "strip@3x.png": await strip(3),
    };
  }

  /** Bannière pour la carte téléchargeable (PNG, PDF) : 1125 × 432 px. */
  async cardBannerImage(tenantId: string): Promise<Buffer> {
    const source = await this.getBannerSource(tenantId);
    return sharp(source).resize(1125, 432, { fit: "cover" }).jpeg({ quality: 90 }).toBuffer();
  }

  /** Image de bannière au format demandé (pour Google hero image ou aperçu admin). */
  async bannerImage(tenantId: string, format: "google" | "apple"): Promise<Buffer> {
    const [width, height] = format === "google" ? [1032, 336] : [1125, 432];
    const source = await this.getBannerSource(tenantId);
    return sharp(source).resize(width, height, { fit: "cover" }).png().toBuffer();
  }

  /** URL publique de l'image de héros Google Wallet. */
  googleHeroImageUrl(tenant: { id: string; slug: string; settings?: { walletBannerVersion?: string | null } | null }): string {
    const version = tenant.settings?.walletBannerVersion ?? "default";
    return `${loadConfig().API_URL}/api/public/tenants/${tenant.slug}/wallet-banner.png?v=${encodeURIComponent(version)}`;
  }
}
