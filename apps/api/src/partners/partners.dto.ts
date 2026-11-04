import { z } from "zod";

export const partnerTypeEnum = z.enum([
  "AGENCY",
  "DEVELOPER",
  "SALES_FREELANCE",
  "CONSULTANT",
  "ENTREPRENEUR",
  "MERCHANT_NETWORK",
  "OTHER",
]);

export const partnerApplySchema = z.object({
  name: z.string().trim().min(2, "Nom requis (minimum 2 caractères)").max(100),
  email: z.string().trim().email("Adresse email invalide").toLowerCase(),
  phone: z.string().trim().min(5, "Numéro de téléphone ou WhatsApp requis").max(30),
  company: z.string().trim().max(100).optional().or(z.literal("")),
  country: z.string().trim().min(2, "Pays requis").max(60),
  city: z.string().trim().min(2, "Ville requise").max(60),
  partnerType: partnerTypeEnum.default("SALES_FREELANCE"),
  websiteUrl: z.string().trim().url("URL de site ou profil invalide").optional().or(z.literal("")),
  promotionStrategy: z.string().trim().min(10, "Veuillez expliquer brièvement comment vous comptez recommander FOVE").max(2000),
  networkSizeEstimate: z.string().trim().max(50).optional().or(z.literal("")),
  acceptTerms: z.boolean().refine((v) => v === true, "Vous devez accepter les conditions du programme partenaires"),
});

export type PartnerApplyDto = z.infer<typeof partnerApplySchema>;

export const partnerLeadSchema = z.object({
  businessName: z.string().trim().min(2, "Nom de l'entreprise requis").max(100),
  contactName: z.string().trim().max(100).optional().or(z.literal("")),
  email: z.string().trim().email("Email invalide").toLowerCase().optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  city: z.string().trim().max(60).optional().or(z.literal("")),
  country: z.string().trim().max(60).optional().or(z.literal("")),
  sector: z.string().trim().max(60).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  status: z.enum(["NEW", "CONTACTED", "INTERESTED", "REGISTERED", "CONVERTED", "LOST"]).default("NEW"),
});

export type PartnerLeadDto = z.infer<typeof partnerLeadSchema>;

export const partnerPayoutRequestSchema = z.object({
  amountCents: z.number().int().positive().min(5000, "Le seuil minimum de retrait est de 50.00 USD/EUR"),
  method: z.enum(["BANK_TRANSFER", "MOBILE_MONEY", "OTHER"]).default("BANK_TRANSFER"),
  payoutDetails: z.record(z.string(), z.any()),
});

export type PartnerPayoutRequestDto = z.infer<typeof partnerPayoutRequestSchema>;

export const partnerProfileUpdateSchema = z.object({
  phone: z.string().trim().max(30).optional(),
  company: z.string().trim().max(100).optional(),
  payoutInfo: z.record(z.string(), z.any()).optional(),
});

export type PartnerProfileUpdateDto = z.infer<typeof partnerProfileUpdateSchema>;

export const adminPartnerUpdateSchema = z.object({
  status: z.enum(["PENDING", "UNDER_REVIEW", "APPROVED", "ACTIVE", "PAUSED", "SUSPENDED", "REJECTED"]),
  commissionRatePercent: z.number().min(0).max(100).optional(),
  minimumPayoutThresholdCents: z.number().int().positive().optional(),
  rejectionReason: z.string().trim().max(500).optional(),
});

export type AdminPartnerUpdateDto = z.infer<typeof adminPartnerUpdateSchema>;

export const adminPayoutActionSchema = z.object({
  status: z.enum(["PAID", "REJECTED"]),
  reference: z.string().trim().max(100).optional(),
  proofFileUrl: z.string().trim().url().optional().or(z.literal("")),
  rejectionReason: z.string().trim().max(500).optional(),
});

export type AdminPayoutActionDto = z.infer<typeof adminPayoutActionSchema>;

export const adminSettingsUpdateSchema = z.object({
  defaultCommissionRatePercent: z.number().min(0).max(100),
  cookieAttributionDays: z.number().int().min(1).max(365),
  conversionWindowDays: z.number().int().min(1).max(365),
  validationDelayDays: z.number().int().min(0).max(180),
  minimumPayoutThresholdCents: z.number().int().min(1000),
  firstPaymentOnly: z.boolean(),
  autoApproveApplications: z.boolean(),
});

export type AdminSettingsUpdateDto = z.infer<typeof adminSettingsUpdateSchema>;
