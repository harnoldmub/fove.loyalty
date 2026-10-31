import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  APP_URL: z.url().default("http://localhost:5290"),
  API_URL: z.url().default("http://localhost:5291"),
  API_PORT: z.coerce.number().int().default(5291),
  CORS_ORIGINS: z.string().default("http://localhost:5290"),
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),
  APP_ENCRYPTION_KEY: z.string().min(40, "APP_ENCRYPTION_KEY : 32 octets en base64"),
  CRON_SECRET: z.string().min(24),
  EMAIL_PROVIDER: z.enum(["console", "resend"]).default("console"),
  EMAIL_FROM: z.string().default("FOVE <no-reply@fove.digital>"),
  RESEND_API_KEY: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  /** Garde-fou : les clés Stripe « live » sont refusées tant que ce drapeau n'est pas posé. */
  STRIPE_ALLOW_LIVE: z.enum(["true", "false"]).default("false"),
  /** Google Wallet : identifiant d'émetteur et compte de service (JSON). Absents = fonction masquée. */
  GOOGLE_WALLET_ISSUER_ID: z.string().regex(/^\d+$/).optional(),
  GOOGLE_WALLET_SERVICE_ACCOUNT_JSON: z.string().optional(),
  /** Apple Wallet (carte fidélité .pkpass signée). Certificats PEM encodés en base64. */
  APPLE_WALLET_PASS_TYPE_ID: z.string().optional(),
  APPLE_WALLET_TEAM_ID: z.string().optional(),
  APPLE_WALLET_SIGNER_CERT_PEM_BASE64: z.string().optional(),
  APPLE_WALLET_SIGNER_KEY_PEM_BASE64: z.string().optional(),
  APPLE_WALLET_SIGNER_KEY_PASSPHRASE: z.string().optional(),
  APPLE_WALLET_WWDR_PEM_BASE64: z.string().optional(),
  /** WhatsApp Business Cloud API (application Meta « DIZAYNA »). */
  WHATSAPP_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_WABA_ID: z.string().optional(),
  WHATSAPP_BUSINESS_ID: z.string().optional(),
});

export type AppConfig = z.infer<typeof schema> & {
  corsOrigins: string[];
  isProd: boolean;
  googleWalletEnabled: boolean;
  appleWalletEnabled: boolean;
  whatsappEnabled: boolean;
};

let cached: AppConfig | null = null;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  if (cached) return cached;
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Configuration invalide :\n${issues}`);
  }
  const value = parsed.data;
  if (value.STRIPE_SECRET_KEY?.startsWith("sk_live") && value.STRIPE_ALLOW_LIVE !== "true") {
    throw new Error("Clé Stripe live refusée : poser STRIPE_ALLOW_LIVE=true après validation.");
  }
  cached = {
    ...value,
    corsOrigins: value.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean),
    isProd: value.NODE_ENV === "production",
    googleWalletEnabled: Boolean(value.GOOGLE_WALLET_ISSUER_ID && value.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON),
    appleWalletEnabled: Boolean(
      value.APPLE_WALLET_PASS_TYPE_ID &&
      value.APPLE_WALLET_TEAM_ID &&
      value.APPLE_WALLET_SIGNER_CERT_PEM_BASE64 &&
      value.APPLE_WALLET_SIGNER_KEY_PEM_BASE64 &&
      value.APPLE_WALLET_WWDR_PEM_BASE64,
    ),
    whatsappEnabled: Boolean(value.WHATSAPP_TOKEN && value.WHATSAPP_PHONE_NUMBER_ID),
  };
  return cached;
}

export function resetConfigCache(): void {
  cached = null;
}
