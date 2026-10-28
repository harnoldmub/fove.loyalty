import { z } from "zod";
import { TENANT_ROLES, API_SCOPES } from "./permissions";

const amount = z
  .string()
  .trim()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, "Montant invalide (ex. 15000 ou 12.50)");
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur hexadécimale attendue (#RRGGBB)");
const slug = z
  .string()
  .trim()
  .min(3)
  .max(48)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lettres minuscules, chiffres et tirets uniquement");
export const password = z
  .string()
  .min(10, "10 caractères minimum")
  .max(200)
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), "Au moins une lettre et un chiffre");

// --- Auth -----------------------------------------------------------------
export const signupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.email().max(254),
  password,
  acceptTerms: z.literal(true, { error: "Vous devez accepter les conditions" }),
});
export const loginSchema = z.object({ email: z.email(), password: z.string().min(1).max(200) });
export const forgotPasswordSchema = z.object({ email: z.email() });
export const resetPasswordSchema = z.object({ token: z.string().min(20).max(200), password });
export const verifyEmailSchema = z.object({ token: z.string().min(20).max(200) });
export const switchTenantSchema = z.object({ tenantId: z.uuid() });

// --- Tenant / onboarding ---------------------------------------------------
export const createTenantSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug,
  primaryColor: hexColor.default("#1F4FFF"),
  country: z.string().length(2).default("CD"),
  currency: z.string().length(3).default("CDF"),
  timezone: z.string().max(64).default("Africa/Kinshasa"),
});
export const updateTenantSchema = createTenantSchema.omit({ slug: true }).partial().extend({
  logoUrl: z.url().max(500).nullable().optional(),
  legalName: z.string().max(120).nullable().optional(),
  contactEmail: z.email().nullable().optional(),
  privacyPolicyUrl: z.url().max(500).nullable().optional(),
});
export const establishmentSchema = z.object({
  name: z.string().trim().min(2).max(80),
  address: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().max(80).nullable().optional(),
  phone: z.string().trim().max(32).nullable().optional(),
});

// --- Programmes ------------------------------------------------------------
export const programSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    mode: z.enum(["POINTS", "STAMPS"]),
    currency: z.string().length(3),
    spendStep: amount.default("1000"),
    pointsPerStep: z.int().min(1).max(10_000).default(1),
    stampsPerPurchase: z.int().min(1).max(10).default(1),
    stampsTarget: z.int().min(2).max(50).default(10),
    minPurchaseAmount: amount.nullable().default(null),
    maxPerTransaction: z.int().min(1).max(1_000_000).nullable().default(null),
    inactivityExpiryDays: z.int().min(30).max(3650).nullable().default(null),
    enrollmentVerification: z.enum(["NONE", "EMAIL_OTP", "IN_STORE"]).default("NONE"),
    terms: z.string().max(4000).default(""),
  });
export const updateProgramSchema = programSchema.partial().extend({ active: z.boolean().optional() });

// --- Récompenses -----------------------------------------------------------
export const rewardSchema = z.object({
  programId: z.uuid(),
  name: z.string().trim().min(2).max(80),
  description: z.string().max(500).default(""),
  conditions: z.string().max(500).default(""),
  cost: z.int().min(1).max(10_000_000),
  stock: z.int().min(0).nullable().default(null),
  availableFrom: z.iso.datetime().nullable().default(null),
  availableUntil: z.iso.datetime().nullable().default(null),
  active: z.boolean().default(true),
});
export const updateRewardSchema = rewardSchema.omit({ programId: true }).partial();

// --- Clients ---------------------------------------------------------------
export const customerSchema = z
  .object({
    firstName: z.string().trim().min(1).max(60),
    lastName: z.string().trim().max(60).default(""),
    phone: z.string().trim().max(32).nullable().default(null),
    email: z.email().max(254).nullable().default(null),
    externalRef: z.string().trim().max(120).nullable().default(null),
    marketingEmailConsent: z.boolean().default(false),
    marketingSmsConsent: z.boolean().default(false),
  })
  .refine((c) => c.phone || c.email, { message: "Téléphone ou email requis", path: ["phone"] });
export const updateCustomerSchema = z.object({
  firstName: z.string().trim().min(1).max(60).optional(),
  lastName: z.string().trim().max(60).optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  email: z.email().max(254).nullable().optional(),
  externalRef: z.string().trim().max(120).nullable().optional(),
  marketingEmailConsent: z.boolean().optional(),
  marketingSmsConsent: z.boolean().optional(),
});
export const importCustomersSchema = z.object({
  programId: z.uuid().nullable().default(null),
  rows: z.array(z.record(z.string(), z.string())).min(1).max(5000),
});

// --- Opérations de fidélité ------------------------------------------------
export const earnSchema = z.object({
  accountId: z.uuid(),
  amount: amount.nullable().default(null),
  saleReference: z.string().trim().max(120).nullable().default(null),
  establishmentId: z.uuid().nullable().default(null),
  idempotencyKey: z.string().min(8).max(120),
});
export const adjustSchema = z.object({
  accountId: z.uuid(),
  delta: z.int().min(-1_000_000).max(1_000_000).refine((v) => v !== 0, "Valeur non nulle"),
  reason: z.string().trim().min(3).max(300),
  idempotencyKey: z.string().min(8).max(120),
});
export const reverseSchema = z.object({
  reason: z.string().trim().min(3).max(300),
  idempotencyKey: z.string().min(8).max(120),
});
export const redeemSchema = z.object({
  accountId: z.uuid(),
  rewardId: z.uuid(),
  establishmentId: z.uuid().nullable().default(null),
  idempotencyKey: z.string().min(8).max(120),
});
export const enrollAccountSchema = z.object({ customerId: z.uuid(), programId: z.uuid() });

// --- Inscription publique ----------------------------------------------------
export const publicEnrollSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().max(60).default(""),
  phone: z.string().trim().min(6).max(32),
  email: z.email().max(254).nullable().default(null),
  acceptTerms: z.literal(true, { error: "Vous devez accepter les conditions du programme" }),
  marketingConsent: z.boolean().default(false),
  /** Champ piège : doit rester vide. */
  website: z.string().max(0).optional(),
});
export const verifyOtpSchema = z.object({ code: z.string().regex(/^\d{6}$/) });

// --- Équipe ----------------------------------------------------------------
export const inviteMemberSchema = z.object({
  email: z.email(),
  role: z.enum(TENANT_ROLES).refine((r) => r !== "OWNER", "Un propriétaire ne s'invite pas"),
  establishmentIds: z.array(z.uuid()).default([]),
});
export const updateMemberSchema = z.object({
  role: z.enum(TENANT_ROLES).optional(),
  establishmentIds: z.array(z.uuid()).optional(),
});
export const acceptInviteSchema = z.object({
  token: z.string().min(20).max(200),
  name: z.string().trim().min(2).max(80).optional(),
  password: password.optional(),
});

// --- Intégrations ----------------------------------------------------------
export const createApiKeySchema = z.object({
  name: z.string().trim().min(2).max(60),
  kind: z.enum(["SECRET", "PUBLISHABLE"]),
  scopes: z.array(z.enum(API_SCOPES)).default([]),
  allowedOrigins: z.array(z.url()).max(20).default([]),
  environment: z.enum(["TEST", "LIVE"]).default("TEST"),
});
export const webhookEndpointSchema = z.object({
  url: z.url().refine((u) => u.startsWith("https://") || u.startsWith("http://localhost"), "HTTPS requis"),
  events: z.array(z.string().max(60)).min(1).max(20),
});

// --- Intégration commerce (Match Kwata et autres boutiques) -----------------
export const commerceCustomerSchema = z.object({
  externalId: z.string().trim().min(1).max(120),
  email: z.email().nullable().default(null),
  phone: z.string().max(32).nullable().default(null),
  firstName: z.string().trim().max(60).default(""),
  lastName: z.string().trim().max(60).default(""),
  marketingEmailConsent: z.boolean().default(false),
});
export const commerceOrderPaidSchema = z.object({
  programId: z.uuid(),
  externalOrderId: z.string().trim().min(1).max(120),
  orderNumber: z.string().max(60).nullable().default(null),
  customer: commerceCustomerSchema,
  amount,
  currency: z.string().length(3),
  paidAt: z.iso.datetime(),
});
export const commerceRefundSchema = z.object({
  programId: z.uuid(),
  externalOrderId: z.string().trim().min(1).max(120),
  externalRefundId: z.string().trim().min(1).max(120),
  amount,
});

// --- Facturation -----------------------------------------------------------
export const checkoutSchema = z.object({
  planCode: z.string().min(2).max(40),
  interval: z.enum(["MONTH", "YEAR"]),
});

export const paginationSchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(120).optional(),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type ProgramInput = z.infer<typeof programSchema>;
export type CustomerInput = z.infer<typeof customerSchema>;
export type PublicEnrollInput = z.infer<typeof publicEnrollSchema>;
export type CommerceOrderPaidInput = z.infer<typeof commerceOrderPaidSchema>;
export type CommerceRefundInput = z.infer<typeof commerceRefundSchema>;
