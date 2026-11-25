"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Award,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  DollarSign,
  Download,
  FileText,
  Gift,
  HelpCircle,
  LayoutDashboard,
  Link2,
  LogOut,
  Plus,
  QrCode,
  RotateCcw,
  Send,
  Share2,
  ShieldCheck,
  Smartphone,
  Store,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Badge, PageHeader, Panel } from "@/components/ui/misc";
import { api, ApiError, useErrorMessage } from "@/lib/api";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { formatDate, formatNumber, formatPrice } from "@/lib/utils";
import { PartnerLeadModal } from "./partner-lead-modal";
import { PartnerPayoutModal } from "./partner-payout-modal";
import { PartnerQrModal } from "./partner-qr-modal";
import { PartnerUtmModal } from "./partner-utm-modal";

interface DashboardData {
  partner: {
    id: string;
    name: string;
    code: string;
    email: string;
    phone: string | null;
    company: string | null;
    partnerType: string | null;
    commissionRatePercent: number;
    status: string;
    payoutInfo: any;
    minimumPayoutThresholdCents: number;
    /** Monnaie de versement (USD ou EUR) : solde, seuil et versements. */
    payoutCurrency: "USD" | "EUR";
    partnerLink: string;
  };
  kpi: {
    totalClicks: number;
    totalSignups: number;
    paidClients: number;
    conversionRatePercent: number;
    pendingCommissionsCents: number;
    availableCommissionsCents: number;
    paidCommissionsCents: number;
    totalEarnedCents: number;
    canRequestPayout: boolean;
  };
  attributions: {
    id: string;
    tenantName: string;
    tenantSlug: string;
    planName: string;
    conversionStatus: string;
    registeredAt: string;
    firstPaymentAt: string | null;
  }[];
  commissions: {
    id: string;
    tenantName: string;
    invoiceNumber: string;
    amountBaseCents: number;
    commissionAmountCents: number;
    ratePercent: number;
    currency: string;
    /** Équivalent dans la monnaie de versement (figé quand la commission est disponible). */
    payoutAmountCents: number;
    payoutCurrency: string;
    status: string;
    availableAt: string | null;
    createdAt: string;
  }[];
  payouts: {
    id: string;
    amountCents: number;
    currency: string;
    method: string;
    status: string;
    reference: string | null;
    createdAt: string;
    paidAt: string | null;
  }[];
  leads: {
    id: string;
    businessName: string;
    contactName: string | null;
    email: string | null;
    phone: string | null;
    city: string | null;
    country: string | null;
    sector: string | null;
    notes: string | null;
    status: string;
    updatedAt: string;
  }[];
}

const TABS = [
  { id: "overview", icon: LayoutDashboard },
  { id: "links", icon: Link2 },
  { id: "leads", icon: Users },
  { id: "clients", icon: Store },
  { id: "commissions", icon: Award },
  { id: "payouts", icon: Wallet },
  { id: "resources", icon: FileText },
] as const;

const LEAD_STATUSES = ["NEW", "CONTACTED", "INTERESTED", "REGISTERED", "CONVERTED", "LOST"] as const;
const PAYOUT_METHODS = ["BANK_TRANSFER", "MOBILE_MONEY"] as const;

export function PartnerDashboard({ user }: { user: { name: string; email: string; isSuperAdmin?: boolean } }) {
  const t = useTranslations("partner.dashboard");
  const locale = useLocale();
  const toErrorMessage = useErrorMessage();
  const money = (cents: number, currency?: string) => formatPrice(cents, currency ?? data?.partner.payoutCurrency ?? "USD", locale);
  const date = (value: string) => formatDate(value, false, locale);
  const leadStatus = (status: string) =>
    (LEAD_STATUSES as readonly string[]).includes(status) ? t(`leadStatus.${status as (typeof LEAD_STATUSES)[number]}`) : status;
  const payoutMethod = (method: string) =>
    (PAYOUT_METHODS as readonly string[]).includes(method)
      ? t(`payouts.methods.${method as (typeof PAYOUT_METHODS)[number]}`)
      : method;
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [copiedLink, setCopiedLink] = useState(false);
  const [leadModalOpen, setLeadModalOpen] = useState(false);
  const [payoutModalOpen, setPayoutModalOpen] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [utmModalOpen, setUtmModalOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["partner-dashboard-data"],
    queryFn: () => api.get<DashboardData>("/partner/me"),
    retry: (count, e) => !(e instanceof ApiError && e.code === "email_not_verified") && count < 3,
  });
  const [verificationSent, setVerificationSent] = useState(false);

  const partner = data?.partner;
  const kpi = data?.kpi;
  const attributions = data?.attributions ?? [];
  const commissions = data?.commissions ?? [];
  const payouts = data?.payouts ?? [];
  const leads = data?.leads ?? [];

  const handleCopyLink = () => {
    if (!partner?.partnerLink) return;
    navigator.clipboard.writeText(partner.partnerLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleWhatsAppShare = () => {
    if (!partner?.partnerLink) return;
    const msg = encodeURIComponent(t("whatsappShare", { link: partner.partnerLink }));
    window.open(`https://wa.me/?text=${msg}`, "_blank");
  };

  if (isLoading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-paper text-sm text-ink-3">
        {t("loading")}
      </div>
    );
  }

  // Espace partenaire (argent, coordonnées de versement) réservé aux comptes à l'email confirmé.
  if (error instanceof ApiError && error.code === "email_not_verified") {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <Panel className="p-8">
          <h2 className="font-display text-xl font-bold text-ink mb-2">{t("unverified.title")}</h2>
          <p className="text-xs text-ink-2 mb-6">{t("unverified.body")}</p>
          {verificationSent ? (
            <p className="text-sm text-mint">{t("unverified.sent")}</p>
          ) : (
            <Button
              onClick={async () => {
                await api.post("/auth/resend-verification").catch(() => undefined);
                setVerificationSent(true);
              }}
            >
              {t("unverified.resend")}
            </Button>
          )}
        </Panel>
      </div>
    );
  }

  if (!partner) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <Panel className="p-8">
          <h2 className="font-display text-xl font-bold text-ink mb-2">{t("inactive.title")}</h2>
          <p className="text-xs text-ink-2 mb-6">
            {t("inactive.body")}
          </p>
          <Button asChild>
            <Link href="/partenaires/rejoindre">{t("inactive.cta")}</Link>
          </Button>
        </Panel>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-paper">
      {/* Top Header */}
      <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur px-4 sm:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/partner" className="flex items-center gap-2">
            <Logo className="text-lg" />
            <span className="rounded bg-[#C7FF3D] px-2 py-0.5 text-xs font-bold text-black">
              {t("header.badge")}
            </span>
          </Link>
          <span className="hidden sm:inline-block font-mono text-xs text-ink-3">
            {t.rich("header.code", {
              code: partner.code,
              strong: (chunks) => <strong className="text-ink">{chunks}</strong>,
            })}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/app" className="hidden sm:flex items-center gap-1.5 text-xs text-ink-2 hover:text-ink">
            <Store className="size-3.5 text-ink-3" />
            {t("header.merchantSpace")}
          </Link>
          {user.isSuperAdmin && (
            <Link href="/admin" className="hidden sm:flex items-center gap-1.5 text-xs text-cobalt hover:underline">
              {t("header.admin")}
            </Link>
          )}
          <ThemeToggle />
          <div className="text-end hidden md:block">
            <div className="text-xs font-semibold text-ink">{partner.name}</div>
            <div className="text-[11px] text-ink-3">{partner.email}</div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8 space-y-6">
        {/* Banner Partenaire & Lien rapide */}
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="font-display text-xl sm:text-2xl font-bold text-ink">
                {t("banner.greeting", { name: partner.name })}
              </h1>
              <Badge tone="mint">{t("banner.rateBadge", { rate: formatNumber(partner.commissionRatePercent, locale) })}</Badge>
            </div>
            <p className="text-xs text-ink-2">
              {t("banner.link")}{" "}
              <strong className="font-mono text-cobalt select-all">{partner.partnerLink}</strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleCopyLink} variant="secondary" size="sm" className="gap-1.5 text-xs">
              {copiedLink ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
              {copiedLink ? t("banner.copied") : t("banner.copyLink")}
            </Button>
            <Button onClick={handleWhatsAppShare} variant="secondary" size="sm" className="gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              <Share2 className="size-3.5" />
              WhatsApp
            </Button>
            <Button onClick={() => setQrModalOpen(true)} variant="secondary" size="sm" className="gap-1.5 text-xs">
              <QrCode className="size-3.5" />
              {t("banner.qr")}
            </Button>
            <Button onClick={() => setUtmModalOpen(true)} variant="secondary" size="sm" className="gap-1.5 text-xs">
              <Link2 className="size-3.5" />
              {t("banner.utm")}
            </Button>
            <Button onClick={() => setLeadModalOpen(true)} variant="primary" size="sm" className="gap-1.5 text-xs">
              <UserPlus className="size-3.5" />
              {t("banner.newLead")}
            </Button>
          </div>
        </div>

        {/* Navigation par onglets */}
        <div className="border-b border-line -mx-4 px-4 sm:-mx-8 sm:px-8 overflow-x-auto">
          <nav className="flex gap-1" aria-label={t("tabsLabel")}>
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-medium transition-colors ${
                    active
                      ? "border-cobalt text-ink font-semibold"
                      : "border-transparent text-ink-3 hover:border-line hover:text-ink-2"
                  }`}
                >
                  <Icon className={`size-3.5 sm:size-4 ${active ? "text-cobalt" : "text-ink-3"}`} />
                  {t(`tabs.${tab.id}`)}
                </button>
              );
            })}
          </nav>
        </div>

        {/* VUE : VUE D'ENSEMBLE */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Panel className="p-4">
                <div className="flex items-center justify-between text-xs text-ink-3">
                  <span>{t("overview.clicks")}</span>
                  <Link2 className="size-3.5 text-cobalt" />
                </div>
                <div className="mt-2 font-display text-2xl font-bold tabular text-ink">
                  {kpi?.totalClicks ?? 0}
                </div>
                <p className="mt-1 text-xs text-ink-3">{t("overview.clicksHint")}</p>
              </Panel>

              <Panel className="p-4">
                <div className="flex items-center justify-between text-xs text-ink-3">
                  <span>{t("overview.signups")}</span>
                  <Users className="size-3.5 text-mint" />
                </div>
                <div className="mt-2 font-display text-2xl font-bold tabular text-ink">
                  {kpi?.paidClients ?? 0}{" "}
                  <span className="text-xs font-normal text-ink-3">
                    {t("overview.signupsCount", { count: kpi?.totalSignups ?? 0 })}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-3">
                  {t("overview.conversionRate", {
                    rate: formatNumber(Math.round((kpi?.conversionRatePercent ?? 0) * 10) / 10, locale),
                  })}
                </p>
              </Panel>

              <Panel className="p-4">
                <div className="flex items-center justify-between text-xs text-ink-3">
                  <span>{t("overview.available")}</span>
                  <Wallet className="size-3.5 text-emerald-500" />
                </div>
                <div className="mt-2 font-display text-2xl font-bold tabular text-emerald-600 dark:text-emerald-400">
                  {money(kpi?.availableCommissionsCents ?? 0)}
                </div>
                <p className="mt-1 text-xs text-ink-3">
                  {t("overview.pending", { amount: money(kpi?.pendingCommissionsCents ?? 0) })}
                </p>
              </Panel>

              <Panel className="p-4 border-cobalt/30">
                <div className="flex items-center justify-between text-xs text-ink-3">
                  <span>{t("overview.totalEarned")}</span>
                  <Award className="size-3.5 text-cobalt" />
                </div>
                <div className="mt-2 font-display text-2xl font-bold tabular text-ink">
                  {money(kpi?.totalEarnedCents ?? 0)}
                </div>
                <p className="mt-1 text-xs text-ink-3">
                  {t("overview.alreadyPaid", { amount: money(kpi?.paidCommissionsCents ?? 0) })}
                </p>
              </Panel>
            </div>

            {/* Demande de virement si seuil atteint */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl border border-line bg-surface p-5 shadow-xs">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                  <Wallet className="size-5" />
                </span>
                <div>
                  <h3 className="font-display text-sm font-semibold text-ink">
                    {t("overview.balance", { amount: money(kpi?.availableCommissionsCents ?? 0) })}
                  </h3>
                  <p className="text-xs text-ink-3">
                    {t("overview.threshold", { amount: money(partner.minimumPayoutThresholdCents) })}
                  </p>
                </div>
              </div>
              <Button
                onClick={() => setPayoutModalOpen(true)}
                disabled={!kpi?.canRequestPayout}
                variant="primary"
                className="w-full sm:w-auto text-xs"
              >
                {t("overview.requestPayout")}
              </Button>
            </div>

            {/* Derniers commerces apportés & Activité */}
            <div className="grid gap-6 lg:grid-cols-2">
              <Panel className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-display text-sm font-semibold text-ink">{t("overview.recentClients")}</h3>
                  <button
                    type="button"
                    onClick={() => setActiveTab("clients")}
                    className="text-xs text-cobalt hover:underline"
                  >
                    {t("overview.seeAll")}
                  </button>
                </div>

                {attributions.length === 0 ? (
                  <p className="text-xs text-ink-3 py-6 text-center">
                    {t("overview.noClients")}
                  </p>
                ) : (
                  <div className="divide-y divide-line text-xs">
                    {attributions.slice(0, 5).map((a) => (
                      <div key={a.id} className="py-2.5 flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-ink">{a.tenantName}</div>
                          <div className="text-ink-3">{t("overview.registeredOn", { date: date(a.registeredAt) })}</div>
                        </div>
                        <div className="text-end">
                          <span className="rounded bg-surface-2 px-2 py-0.5 text-xs font-medium text-ink">
                            {a.planName}
                          </span>
                          <div className="mt-0.5">
                            {a.conversionStatus === "CONVERTED" ? (
                              <Badge tone="mint">{t("overview.paidClient")}</Badge>
                            ) : (
                              <Badge tone="neutral">{t("overview.trial")}</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              <Panel className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-display text-sm font-semibold text-ink">{t("overview.recentLeads")}</h3>
                  <button
                    type="button"
                    onClick={() => setActiveTab("leads")}
                    className="text-xs text-cobalt hover:underline"
                  >
                    {t("overview.seePipeline")}
                  </button>
                </div>

                {leads.length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-xs text-ink-3 mb-3">{t("overview.noLeads")}</p>
                    <Button onClick={() => setLeadModalOpen(true)} size="sm" variant="secondary" className="text-xs gap-1">
                      <Plus className="size-3" /> {t("overview.declareLead")}
                    </Button>
                  </div>
                ) : (
                  <div className="divide-y divide-line text-xs">
                    {leads.slice(0, 5).map((l) => (
                      <div key={l.id} className="py-2.5 flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-ink">{l.businessName}</div>
                          <div className="text-ink-3">
                            {l.contactName ?? l.city ?? t("overview.inProgress")}
                          </div>
                        </div>
                        <Badge
                          tone={
                            l.status === "CONVERTED"
                              ? "mint"
                              : l.status === "REGISTERED"
                              ? "cobalt"
                              : "neutral"
                          }
                        >
                          {leadStatus(l.status)}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>
          </div>
        )}

        {/* VUE : MON LIEN COMMERCIAL */}
        {activeTab === "links" && (
          <div className="space-y-6">
            <Panel className="p-6">
              <h2 className="font-display text-lg font-bold text-ink mb-2">{t("links.title")}</h2>
              <p className="text-xs text-ink-2 mb-6">
                {t("links.body")}
              </p>

              <div className="flex flex-col sm:flex-row items-center gap-3 rounded-xl border border-line bg-surface-2 p-4 mb-6">
                <div className="flex-1 font-mono text-sm text-ink break-all select-all font-semibold">
                  {partner.partnerLink}
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Button onClick={handleCopyLink} variant="primary" className="flex-1 sm:flex-initial gap-1.5 text-xs">
                    {copiedLink ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
                    {copiedLink ? t("links.copied") : t("links.copy")}
                  </Button>
                  <Button onClick={handleWhatsAppShare} variant="secondary" className="flex-1 sm:flex-initial gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                    <Share2 className="size-3.5" />
                    WhatsApp
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3 text-xs">
                <div className="rounded-xl border border-line p-4 space-y-1">
                  <div className="text-ink-3 font-medium">{t("links.codeTitle")}</div>
                  <div className="font-mono text-lg font-bold text-ink">{partner.code}</div>
                  <p className="text-ink-3">{t("links.codeHint")}</p>
                </div>
                <div className="rounded-xl border border-line p-4 space-y-1">
                  <div className="text-ink-3 font-medium">{t("links.cookieTitle")}</div>
                  <div className="font-mono text-lg font-bold text-ink">{t("links.cookieValue")}</div>
                  <p className="text-ink-3">{t("links.cookieHint")}</p>
                </div>
                <div className="rounded-xl border border-line p-4 space-y-1">
                  <div className="text-ink-3 font-medium">{t("links.rateTitle")}</div>
                  <div className="font-mono text-lg font-bold text-emerald-600 dark:text-emerald-400">
                    {t("links.rateValue", { rate: formatNumber(partner.commissionRatePercent, locale) })}
                  </div>
                  <p className="text-ink-3">{t("links.rateHint")}</p>
                </div>
              </div>
            </Panel>
          </div>
        )}

        {/* VUE : PROSPECTS (CRM PIPELINE) */}
        {activeTab === "leads" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-bold text-ink">{t("leads.title")}</h2>
                <p className="text-xs text-ink-3">{t("leads.subtitle")}</p>
              </div>
              <Button onClick={() => setLeadModalOpen(true)} variant="primary" size="sm" className="gap-1.5 text-xs">
                <Plus className="size-3.5" /> {t("leads.newLead")}
              </Button>
            </div>

            {leads.length === 0 ? (
              <Panel className="p-12 text-center text-sm text-ink-3">
                {t("leads.empty")}
              </Panel>
            ) : (
              <Panel className="overflow-x-auto">
                <table className="w-full min-w-[750px] text-start text-sm">
                  <thead className="border-b border-line bg-surface-2 text-xs text-ink-3">
                    <tr>
                      <th className="py-3 px-4 font-medium">{t("leads.colBusiness")}</th>
                      <th className="py-3 px-4 font-medium">{t("leads.colContact")}</th>
                      <th className="py-3 px-4 font-medium">{t("leads.colDetails")}</th>
                      <th className="py-3 px-4 font-medium">{t("leads.colCity")}</th>
                      <th className="py-3 px-4 font-medium">{t("leads.colStatus")}</th>
                      <th className="py-3 px-4 font-medium">{t("leads.colNotes")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line text-xs">
                    {leads.map((l) => (
                      <tr key={l.id} className="hover:bg-surface-2 transition-colors">
                        <td className="py-3.5 px-4 font-semibold text-ink">{l.businessName}</td>
                        <td className="py-3.5 px-4 text-ink-2">{l.contactName ?? "—"}</td>
                        <td className="py-3.5 px-4 text-ink-3">
                          <div>{l.phone ?? "—"}</div>
                          <div>{l.email ?? ""}</div>
                        </td>
                        <td className="py-3.5 px-4 text-ink-2">
                          {l.city ? `${l.city} (${l.sector ?? t("leads.defaultSector")})` : "—"}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="rounded bg-surface-2 px-2 py-0.5 text-xs font-semibold text-ink">
                            {leadStatus(l.status)}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-ink-3 max-w-xs truncate">{l.notes ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            )}
          </div>
        )}

        {/* VUE : CLIENTS APPORTÉS */}
        {activeTab === "clients" && (
          <div className="space-y-4">
            <h2 className="font-display text-lg font-bold text-ink">{t("clients.title")}</h2>
            {attributions.length === 0 ? (
              <Panel className="p-12 text-center text-sm text-ink-3">
                {t("clients.empty")}
              </Panel>
            ) : (
              <Panel className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-start text-sm">
                  <thead className="border-b border-line bg-surface-2 text-xs text-ink-3">
                    <tr>
                      <th className="py-3 px-4 font-medium">{t("clients.colBusiness")}</th>
                      <th className="py-3 px-4 font-medium">{t("clients.colRegistered")}</th>
                      <th className="py-3 px-4 font-medium">{t("clients.colPlan")}</th>
                      <th className="py-3 px-4 font-medium">{t("clients.colStatus")}</th>
                      <th className="py-3 px-4 font-medium text-end">{t("clients.colFirstPayment")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line text-xs">
                    {attributions.map((a) => (
                      <tr key={a.id} className="hover:bg-surface-2 transition-colors">
                        <td className="py-3.5 px-4 font-semibold text-ink">{a.tenantName}</td>
                        <td className="py-3.5 px-4 text-ink-2">{date(a.registeredAt)}</td>
                        <td className="py-3.5 px-4">
                          <span className="rounded bg-surface-2 px-2 py-0.5 text-xs font-medium text-ink">
                            {a.planName}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          {a.conversionStatus === "CONVERTED" ? (
                            <Badge tone="mint">{t("clients.paidClient")}</Badge>
                          ) : (
                            <Badge tone="neutral">{t("clients.trial")}</Badge>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-end text-ink-2 font-mono">
                          {a.firstPaymentAt ? date(a.firstPaymentAt) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            )}
          </div>
        )}

        {/* VUE : COMMISSIONS */}
        {activeTab === "commissions" && (
          <div className="space-y-4">
            <h2 className="font-display text-lg font-bold text-ink">{t("commissions.title")}</h2>
            {commissions.length === 0 ? (
              <Panel className="p-12 text-center text-sm text-ink-3">
                {t("commissions.empty")}
              </Panel>
            ) : (
              <Panel className="overflow-x-auto">
                <table className="w-full min-w-[750px] text-start text-sm">
                  <thead className="border-b border-line bg-surface-2 text-xs text-ink-3">
                    <tr>
                      <th className="py-3 px-4 font-medium">{t("commissions.colDate")}</th>
                      <th className="py-3 px-4 font-medium">{t("commissions.colBusiness")}</th>
                      <th className="py-3 px-4 font-medium text-end">{t("commissions.colAmount")}</th>
                      <th className="py-3 px-4 font-medium text-end">{t("commissions.colCommission")}</th>
                      <th className="py-3 px-4 font-medium">{t("commissions.colAvailability")}</th>
                      <th className="py-3 px-4 font-medium">{t("commissions.colStatus")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line text-xs">
                    {commissions.map((c) => (
                      <tr key={c.id} className="hover:bg-surface-2 transition-colors">
                        <td className="py-3.5 px-4 text-ink-2">{date(c.createdAt)}</td>
                        <td className="py-3.5 px-4 font-semibold text-ink">{c.tenantName}</td>
                        <td className="py-3.5 px-4 text-end font-mono text-ink-2">
                          {money(c.amountBaseCents, c.currency)}
                        </td>
                        <td className="py-3.5 px-4 text-end font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          {money(c.commissionAmountCents, c.currency)} ({formatNumber(c.ratePercent, locale)}%)
                          {c.payoutCurrency !== c.currency && (
                            <span className="block text-[11px] font-normal text-ink-3">{t("commissions.converted", { amount: money(c.payoutAmountCents, c.payoutCurrency) })}</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-ink-3">
                          {c.availableAt ? date(c.availableAt) : t("commissions.immediate")}
                        </td>
                        <td className="py-3.5 px-4">
                          {c.status === "PAID" ? (
                            <Badge tone="mint">{t("commissions.paid")}</Badge>
                          ) : c.status === "AVAILABLE" ? (
                            <Badge tone="mint">{t("commissions.available")}</Badge>
                          ) : c.status === "CANCELLED" ? (
                            <Badge tone="danger">{t("commissions.cancelled")}</Badge>
                          ) : (
                            <Badge tone="stamp">{t("commissions.pending")}</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            )}
          </div>
        )}

        {/* VUE : PAIEMENTS & RETRAITS */}
        {activeTab === "payouts" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl border border-line bg-surface p-6 shadow-xs">
              <div>
                <h3 className="font-display text-base font-bold text-ink">
                  {t("payouts.balance", { amount: money(kpi?.availableCommissionsCents ?? 0) })}
                </h3>
                <p className="text-xs text-ink-3">
                  {t("payouts.minimum", { amount: money(partner.minimumPayoutThresholdCents) })}
                </p>
                <label className="mt-3 flex items-center gap-2 text-xs text-ink-2">
                  {t("payouts.currency")}
                  <select
                    className="rounded-md border border-line bg-surface px-2 py-1 text-xs"
                    value={partner.payoutCurrency}
                    onChange={async (e) => {
                      try {
                        await api.patch("/partner/profile", { payoutCurrency: e.target.value });
                        await refetch();
                        toast.success(t("payouts.currencySaved"));
                      } catch (err) {
                        toast.error(toErrorMessage(err));
                      }
                    }}
                  >
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                  </select>
                </label>
                <p className="mt-1 text-[11px] text-ink-3">{t("payouts.currencyHelp")}</p>
              </div>
              <Button
                onClick={() => setPayoutModalOpen(true)}
                disabled={!kpi?.canRequestPayout}
                variant="primary"
                className="w-full sm:w-auto"
              >
                {t("payouts.requestPayout")}
              </Button>
            </div>

            <h3 className="font-display text-sm font-bold text-ink">{t("payouts.history")}</h3>
            {payouts.length === 0 ? (
              <Panel className="p-12 text-center text-sm text-ink-3">{t("payouts.empty")}</Panel>
            ) : (
              <Panel className="overflow-x-auto">
                <table className="w-full min-w-[650px] text-start text-sm">
                  <thead className="border-b border-line bg-surface-2 text-xs text-ink-3">
                    <tr>
                      <th className="py-3 px-4 font-medium">{t("payouts.colDate")}</th>
                      <th className="py-3 px-4 font-medium">{t("payouts.colMethod")}</th>
                      <th className="py-3 px-4 font-medium text-end">{t("payouts.colAmount")}</th>
                      <th className="py-3 px-4 font-medium">{t("payouts.colStatus")}</th>
                      <th className="py-3 px-4 font-medium">{t("payouts.colReference")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line text-xs">
                    {payouts.map((p) => (
                      <tr key={p.id} className="hover:bg-surface-2 transition-colors">
                        <td className="py-3.5 px-4 text-ink-2">{date(p.createdAt)}</td>
                        <td className="py-3.5 px-4 text-ink font-medium">{payoutMethod(p.method)}</td>
                        <td className="py-3.5 px-4 text-end font-mono font-bold text-ink">
                          {money(p.amountCents, p.currency)}
                        </td>
                        <td className="py-3.5 px-4">
                          {p.status === "PAID" ? (
                            <Badge tone="mint">{t("payouts.paid")}</Badge>
                          ) : p.status === "FAILED" ? (
                            <Badge tone="danger">{t("payouts.failed")}</Badge>
                          ) : (
                            <Badge tone="stamp">{t("payouts.processing")}</Badge>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-ink-3">{p.reference ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            )}
          </div>
        )}

        {/* VUE : RESSOURCES DE VENTE */}
        {activeTab === "resources" && (
          <div className="space-y-6">
            <Panel className="p-6">
              <h2 className="font-display text-lg font-bold text-ink mb-1">{t("resources.title")}</h2>
              <p className="text-xs text-ink-3 mb-6">
                {t("resources.subtitle")}
              </p>

              <div className="grid gap-6 md:grid-cols-2">
                {/* Pitch en 30 secondes */}
                <div className="rounded-xl border border-line bg-surface-2 p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-[#C7FF3D]" />
                    <h3 className="font-display text-sm font-bold text-ink">{t("resources.pitchTitle")}</h3>
                  </div>
                  <p className="text-xs text-ink-2 leading-relaxed italic border-s-2 border-[#C7FF3D] ps-3">
                    {t("resources.pitch")}
                  </p>
                </div>

                {/* Script WhatsApp */}
                <div className="rounded-xl border border-line bg-surface-2 p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Smartphone className="size-4 text-emerald-500" />
                      <h3 className="font-display text-sm font-bold text-ink">{t("resources.whatsappTitle")}</h3>
                    </div>
                    <Button
                      onClick={() => {
                        navigator.clipboard.writeText(t("resources.whatsappMessage", { link: partner.partnerLink }));
                        toast.success(t("resources.whatsappCopied"));
                      }}
                      size="sm"
                      variant="secondary"
                      className="text-xs gap-1"
                    >
                      <Copy className="size-3" /> {t("resources.copy")}
                    </Button>
                  </div>
                  <p className="text-xs text-ink-2 leading-relaxed border-s-2 border-emerald-500 ps-3">
                    {t("resources.whatsappMessage", { link: partner.partnerLink })}
                  </p>
                </div>
              </div>

              {/* Arguments anti-objections */}
              <div className="mt-8 space-y-4">
                <h3 className="font-display text-sm font-bold text-ink">{t("resources.objectionsTitle")}</h3>
                <div className="grid gap-4 sm:grid-cols-3 text-xs">
                  <div className="rounded-lg border border-line p-4 space-y-1">
                    <strong className="text-ink">{t("resources.objectionPaper")}</strong>
                    <p className="text-ink-3">
                      {t("resources.answerPaper")}
                    </p>
                  </div>
                  <div className="rounded-lg border border-line p-4 space-y-1">
                    <strong className="text-ink">{t("resources.objectionPrice")}</strong>
                    <p className="text-ink-3">
                      {t("resources.answerPrice")}
                    </p>
                  </div>
                  <div className="rounded-lg border border-line p-4 space-y-1">
                    <strong className="text-ink">{t("resources.objectionTime")}</strong>
                    <p className="text-ink-3">
                      {t("resources.answerTime")}
                    </p>
                  </div>
                </div>
              </div>
            </Panel>
          </div>
        )}
      </main>

      {/* Modales */}
      <PartnerLeadModal
        open={leadModalOpen}
        onClose={() => setLeadModalOpen(false)}
        onCreated={() => refetch()}
      />

      <PartnerPayoutModal
        open={payoutModalOpen}
        availableCents={kpi?.availableCommissionsCents ?? 0}
        thresholdCents={partner.minimumPayoutThresholdCents}
        currency={partner.payoutCurrency}
        existingPayoutInfo={partner.payoutInfo}
        onClose={() => setPayoutModalOpen(false)}
        onRequested={() => refetch()}
      />

      <PartnerQrModal
        open={qrModalOpen}
        partnerLink={partner.partnerLink}
        partnerCode={partner.code}
        onClose={() => setQrModalOpen(false)}
      />

      <PartnerUtmModal
        open={utmModalOpen}
        partnerLink={partner.partnerLink}
        onClose={() => setUtmModalOpen(false)}
      />
    </div>
  );
}
