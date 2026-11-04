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
  ExternalLink,
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
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { formatFinance } from "@/components/admin/finance/finance-utils";
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
  { id: "overview", label: "Vue d'ensemble", icon: LayoutDashboard },
  { id: "links", label: "Mon lien commercial", icon: Link2 },
  { id: "leads", label: "Prospects", icon: Users },
  { id: "clients", label: "Clients apportés", icon: Store },
  { id: "commissions", label: "Commissions", icon: Award },
  { id: "payouts", label: "Paiements & Retraits", icon: Wallet },
  { id: "resources", label: "Ressources de vente", icon: FileText },
];

export function PartnerDashboard({ user }: { user: { name: string; email: string; isSuperAdmin?: boolean } }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [copiedLink, setCopiedLink] = useState(false);
  const [leadModalOpen, setLeadModalOpen] = useState(false);
  const [payoutModalOpen, setPayoutModalOpen] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [utmModalOpen, setUtmModalOpen] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["partner-dashboard-data"],
    queryFn: () => api.get<DashboardData>("/partner/me"),
  });

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
    const msg = encodeURIComponent(
      `Bonjour ! Découvre FOVE, la solution moderne pour fidéliser tes clients sur leur smartphone (cartes Apple Wallet & Google Wallet sans application à installer) : ${partner.partnerLink}`
    );
    window.open(`https://wa.me/?text=${msg}`, "_blank");
  };

  if (isLoading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-paper text-sm text-ink-3">
        Chargement de votre espace partenaire...
      </div>
    );
  }

  if (!partner) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <Panel className="p-8">
          <h2 className="font-display text-xl font-bold text-ink mb-2">Espace partenaire non activé</h2>
          <p className="text-xs text-ink-2 mb-6">
            Votre candidature est soit en attente de validation par l&apos;équipe FOVE, soit vous n&apos;avez pas encore postulé.
          </p>
          <Button asChild>
            <Link href="/partenaires/rejoindre">Déposer une candidature</Link>
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
            <span className="rounded bg-[#C7FF3D] px-2 py-0.5 text-xs font-bold text-black uppercase tracking-wide">
              Partenaire
            </span>
          </Link>
          <span className="hidden sm:inline-block font-mono text-xs text-ink-3">
            Code: <strong className="text-ink">{partner.code}</strong>
          </span>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/app" className="hidden sm:flex items-center gap-1.5 text-xs text-ink-2 hover:text-ink">
            <Store className="size-3.5 text-ink-3" />
            Espace commerçant
          </Link>
          {user.isSuperAdmin && (
            <Link href="/admin" className="hidden sm:flex items-center gap-1.5 text-xs text-cobalt hover:underline">
              Back-office Admin
            </Link>
          )}
          <ThemeToggle />
          <div className="text-right hidden md:block">
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
                Bonjour {partner.name}
              </h1>
              <Badge tone="mint">Partenaire {partner.commissionRatePercent}%</Badge>
            </div>
            <p className="text-xs text-ink-2">
              Votre lien commercial permanent :{" "}
              <strong className="font-mono text-cobalt select-all">{partner.partnerLink}</strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleCopyLink} variant="secondary" size="sm" className="gap-1.5 text-xs">
              {copiedLink ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
              {copiedLink ? "Copié !" : "Copier mon lien"}
            </Button>
            <Button onClick={handleWhatsAppShare} variant="secondary" size="sm" className="gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              <Share2 className="size-3.5" />
              WhatsApp
            </Button>
            <Button onClick={() => setQrModalOpen(true)} variant="secondary" size="sm" className="gap-1.5 text-xs">
              <QrCode className="size-3.5" />
              QR Code
            </Button>
            <Button onClick={() => setUtmModalOpen(true)} variant="secondary" size="sm" className="gap-1.5 text-xs">
              <Link2 className="size-3.5" />
              Lien UTM
            </Button>
            <Button onClick={() => setLeadModalOpen(true)} variant="primary" size="sm" className="gap-1.5 text-xs">
              <UserPlus className="size-3.5" />
              Nouveau prospect
            </Button>
          </div>
        </div>

        {/* Navigation par onglets */}
        <div className="border-b border-line -mx-4 px-4 sm:-mx-8 sm:px-8 overflow-x-auto">
          <nav className="flex space-x-1" aria-label="Espace Partenaire">
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
                  {tab.label}
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
                  <span>Clics sur votre lien</span>
                  <Link2 className="size-3.5 text-cobalt" />
                </div>
                <div className="mt-2 font-display text-2xl font-bold tabular text-ink">
                  {kpi?.totalClicks ?? 0}
                </div>
                <p className="mt-1 text-xs text-ink-3">Visiteurs envoyés sur FOVE</p>
              </Panel>

              <Panel className="p-4">
                <div className="flex items-center justify-between text-xs text-ink-3">
                  <span>Inscriptions & conversions</span>
                  <Users className="size-3.5 text-mint" />
                </div>
                <div className="mt-2 font-display text-2xl font-bold tabular text-ink">
                  {kpi?.paidClients ?? 0}{" "}
                  <span className="text-xs font-normal text-ink-3">
                    / {kpi?.totalSignups ?? 0} inscrits
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-3">
                  Taux de conversion : {kpi?.conversionRatePercent.toFixed(1)}%
                </p>
              </Panel>

              <Panel className="p-4">
                <div className="flex items-center justify-between text-xs text-ink-3">
                  <span>Commissions disponibles</span>
                  <Wallet className="size-3.5 text-emerald-500" />
                </div>
                <div className="mt-2 font-display text-2xl font-bold tabular text-emerald-600 dark:text-emerald-400">
                  {formatFinance(kpi?.availableCommissionsCents ?? 0, "USD")}
                </div>
                <p className="mt-1 text-xs text-ink-3">
                  En attente : {formatFinance(kpi?.pendingCommissionsCents ?? 0, "USD")}
                </p>
              </Panel>

              <Panel className="p-4 border-cobalt/30">
                <div className="flex items-center justify-between text-xs text-ink-3">
                  <span>Total des gains perçus</span>
                  <Award className="size-3.5 text-cobalt" />
                </div>
                <div className="mt-2 font-display text-2xl font-bold tabular text-ink">
                  {formatFinance(kpi?.totalEarnedCents ?? 0, "USD")}
                </div>
                <p className="mt-1 text-xs text-ink-3">
                  Déjà viré : {formatFinance(kpi?.paidCommissionsCents ?? 0, "USD")}
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
                    Solde disponible au virement : {formatFinance(kpi?.availableCommissionsCents ?? 0, "USD")}
                  </h3>
                  <p className="text-xs text-ink-3">
                    Seuil de retrait : {formatFinance(partner.minimumPayoutThresholdCents, "USD")} · Règlements par Virement
                    bancaire ou Mobile Money.
                  </p>
                </div>
              </div>
              <Button
                onClick={() => setPayoutModalOpen(true)}
                disabled={!kpi?.canRequestPayout}
                variant="primary"
                className="w-full sm:w-auto text-xs"
              >
                Demander un virement
              </Button>
            </div>

            {/* Derniers commerces apportés & Activité */}
            <div className="grid gap-6 lg:grid-cols-2">
              <Panel className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-display text-sm font-semibold text-ink">Commerces récemment apportés</h3>
                  <button
                    type="button"
                    onClick={() => setActiveTab("clients")}
                    className="text-xs text-cobalt hover:underline"
                  >
                    Voir tout
                  </button>
                </div>

                {attributions.length === 0 ? (
                  <p className="text-xs text-ink-3 py-6 text-center">
                    Aucun commerce n&apos;a encore utilisé votre lien. Partagez-le pour démarrer !
                  </p>
                ) : (
                  <div className="divide-y divide-line text-xs">
                    {attributions.slice(0, 5).map((a) => (
                      <div key={a.id} className="py-2.5 flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-ink">{a.tenantName}</div>
                          <div className="text-ink-3">Inscrit le {formatDate(a.registeredAt)}</div>
                        </div>
                        <div className="text-right">
                          <span className="rounded bg-surface-2 px-2 py-0.5 text-xs font-medium text-ink">
                            {a.planName}
                          </span>
                          <div className="mt-0.5">
                            {a.conversionStatus === "CONVERTED" ? (
                              <Badge tone="mint">Client payant</Badge>
                            ) : (
                              <Badge tone="neutral">Essai / Gratuit</Badge>
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
                  <h3 className="font-display text-sm font-semibold text-ink">Vos derniers prospects</h3>
                  <button
                    type="button"
                    onClick={() => setActiveTab("leads")}
                    className="text-xs text-cobalt hover:underline"
                  >
                    Voir le pipeline
                  </button>
                </div>

                {leads.length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-xs text-ink-3 mb-3">Aucun prospect enregistré dans votre pipeline.</p>
                    <Button onClick={() => setLeadModalOpen(true)} size="sm" variant="secondary" className="text-xs gap-1">
                      <Plus className="size-3" /> Déclarer un commerce
                    </Button>
                  </div>
                ) : (
                  <div className="divide-y divide-line text-xs">
                    {leads.slice(0, 5).map((l) => (
                      <div key={l.id} className="py-2.5 flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-ink">{l.businessName}</div>
                          <div className="text-ink-3">
                            {l.contactName ?? l.city ?? "En cours"}
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
                          {l.status}
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
              <h2 className="font-display text-lg font-bold text-ink mb-2">Votre lien de recommandation officiel</h2>
              <p className="text-xs text-ink-2 mb-6">
                Chaque visiteur qui clique sur ce lien reçoit un cookie first-party de 30 jours. S&apos;il s&apos;inscrit et
                souscrit un abonnement FOVE, vous percevez automatiquement 20% de commission.
              </p>

              <div className="flex flex-col sm:flex-row items-center gap-3 rounded-xl border border-line bg-surface-2 p-4 mb-6">
                <div className="flex-1 font-mono text-sm text-ink break-all select-all font-semibold">
                  {partner.partnerLink}
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Button onClick={handleCopyLink} variant="primary" className="flex-1 sm:flex-initial gap-1.5 text-xs">
                    {copiedLink ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
                    {copiedLink ? "Copié !" : "Copier"}
                  </Button>
                  <Button onClick={handleWhatsAppShare} variant="secondary" className="flex-1 sm:flex-initial gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                    <Share2 className="size-3.5" />
                    WhatsApp
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3 text-xs">
                <div className="rounded-xl border border-line p-4 space-y-1">
                  <div className="text-ink-3 font-medium">Code Partenaire unique</div>
                  <div className="font-mono text-lg font-bold text-ink">{partner.code}</div>
                  <p className="text-ink-3">Peut être saisi manuellement au paiement.</p>
                </div>
                <div className="rounded-xl border border-line p-4 space-y-1">
                  <div className="text-ink-3 font-medium">Durée d&apos;attribution cookie</div>
                  <div className="font-mono text-lg font-bold text-ink">30 jours</div>
                  <p className="text-ink-3">Période de conversion après le 1er clic.</p>
                </div>
                <div className="rounded-xl border border-line p-4 space-y-1">
                  <div className="text-ink-3 font-medium">Commission garantie</div>
                  <div className="font-mono text-lg font-bold text-emerald-600 dark:text-emerald-400">
                    {partner.commissionRatePercent} %
                  </div>
                  <p className="text-ink-3">Sur le montant net du 1er abonnement.</p>
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
                <h2 className="font-display text-lg font-bold text-ink">Pipeline de prospection</h2>
                <p className="text-xs text-ink-3">Suivez vos démarches auprès des commerçants de votre zone.</p>
              </div>
              <Button onClick={() => setLeadModalOpen(true)} variant="primary" size="sm" className="gap-1.5 text-xs">
                <Plus className="size-3.5" /> Nouveau prospect
              </Button>
            </div>

            {leads.length === 0 ? (
              <Panel className="p-12 text-center text-sm text-ink-3">
                Aucun prospect enregistré. Cliquez sur &quot;Nouveau prospect&quot; pour ajouter vos premiers commerces cibles.
              </Panel>
            ) : (
              <Panel className="overflow-x-auto">
                <table className="w-full min-w-[750px] text-left text-sm">
                  <thead className="border-b border-line bg-surface-2 text-xs text-ink-3">
                    <tr>
                      <th className="py-3 px-4 font-medium">Commerce</th>
                      <th className="py-3 px-4 font-medium">Contact</th>
                      <th className="py-3 px-4 font-medium">Coordonnées</th>
                      <th className="py-3 px-4 font-medium">Ville / Secteur</th>
                      <th className="py-3 px-4 font-medium">Statut</th>
                      <th className="py-3 px-4 font-medium">Notes</th>
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
                          {l.city ? `${l.city} (${l.sector ?? "Commerce"})` : "—"}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="rounded bg-surface-2 px-2 py-0.5 text-xs font-semibold text-ink">
                            {l.status}
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
            <h2 className="font-display text-lg font-bold text-ink">Commerces inscrits via votre lien</h2>
            {attributions.length === 0 ? (
              <Panel className="p-12 text-center text-sm text-ink-3">
                Aucun commerce rattaché pour l&apos;instant. Partagez votre lien commercial pour obtenir vos premiers inscrits.
              </Panel>
            ) : (
              <Panel className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-left text-sm">
                  <thead className="border-b border-line bg-surface-2 text-xs text-ink-3">
                    <tr>
                      <th className="py-3 px-4 font-medium">Commerce</th>
                      <th className="py-3 px-4 font-medium">Date d&apos;inscription</th>
                      <th className="py-3 px-4 font-medium">Offre active</th>
                      <th className="py-3 px-4 font-medium">Statut de conversion</th>
                      <th className="py-3 px-4 font-medium text-right">Date 1er paiement</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line text-xs">
                    {attributions.map((a) => (
                      <tr key={a.id} className="hover:bg-surface-2 transition-colors">
                        <td className="py-3.5 px-4 font-semibold text-ink">{a.tenantName}</td>
                        <td className="py-3.5 px-4 text-ink-2">{formatDate(a.registeredAt)}</td>
                        <td className="py-3.5 px-4">
                          <span className="rounded bg-surface-2 px-2 py-0.5 text-xs font-medium text-ink">
                            {a.planName}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          {a.conversionStatus === "CONVERTED" ? (
                            <Badge tone="mint">Client Payant</Badge>
                          ) : (
                            <Badge tone="neutral">Essai / Gratuit</Badge>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right text-ink-2 font-mono">
                          {a.firstPaymentAt ? formatDate(a.firstPaymentAt) : "—"}
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
            <h2 className="font-display text-lg font-bold text-ink">Journal des commissions</h2>
            {commissions.length === 0 ? (
              <Panel className="p-12 text-center text-sm text-ink-3">
                Aucune commission générée pour l&apos;instant. Dès qu&apos;un client souscrit un abonnement payant, elle apparaîtra ici.
              </Panel>
            ) : (
              <Panel className="overflow-x-auto">
                <table className="w-full min-w-[750px] text-left text-sm">
                  <thead className="border-b border-line bg-surface-2 text-xs text-ink-3">
                    <tr>
                      <th className="py-3 px-4 font-medium">Date</th>
                      <th className="py-3 px-4 font-medium">Commerce</th>
                      <th className="py-3 px-4 font-medium text-right">Montant abonnement</th>
                      <th className="py-3 px-4 font-medium text-right">Votre commission</th>
                      <th className="py-3 px-4 font-medium">Disponibilité</th>
                      <th className="py-3 px-4 font-medium">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line text-xs">
                    {commissions.map((c) => (
                      <tr key={c.id} className="hover:bg-surface-2 transition-colors">
                        <td className="py-3.5 px-4 text-ink-2">{formatDate(c.createdAt)}</td>
                        <td className="py-3.5 px-4 font-semibold text-ink">{c.tenantName}</td>
                        <td className="py-3.5 px-4 text-right font-mono text-ink-2">
                          {formatFinance(c.amountBaseCents, c.currency)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          {formatFinance(c.commissionAmountCents, c.currency)} ({c.ratePercent}%)
                        </td>
                        <td className="py-3.5 px-4 text-ink-3">
                          {c.availableAt ? formatDate(c.availableAt) : "Immédiate"}
                        </td>
                        <td className="py-3.5 px-4">
                          {c.status === "PAID" ? (
                            <Badge tone="mint">Versée</Badge>
                          ) : c.status === "AVAILABLE" ? (
                            <Badge tone="mint">Disponible</Badge>
                          ) : c.status === "CANCELLED" ? (
                            <Badge tone="danger">Annulée (Remboursement)</Badge>
                          ) : (
                            <Badge tone="stamp">En attente (30j)</Badge>
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
                  Solde disponible : {formatFinance(kpi?.availableCommissionsCents ?? 0, "USD")}
                </h3>
                <p className="text-xs text-ink-3">
                  Montant minimum de retrait : {formatFinance(partner.minimumPayoutThresholdCents, "USD")}
                </p>
              </div>
              <Button
                onClick={() => setPayoutModalOpen(true)}
                disabled={!kpi?.canRequestPayout}
                variant="primary"
                className="w-full sm:w-auto"
              >
                Demander un virement
              </Button>
            </div>

            <h3 className="font-display text-sm font-bold text-ink">Historique des versements</h3>
            {payouts.length === 0 ? (
              <Panel className="p-12 text-center text-sm text-ink-3">Aucun virement demandé pour l&apos;instant.</Panel>
            ) : (
              <Panel className="overflow-x-auto">
                <table className="w-full min-w-[650px] text-left text-sm">
                  <thead className="border-b border-line bg-surface-2 text-xs text-ink-3">
                    <tr>
                      <th className="py-3 px-4 font-medium">Date demande</th>
                      <th className="py-3 px-4 font-medium">Méthode</th>
                      <th className="py-3 px-4 font-medium text-right">Montant</th>
                      <th className="py-3 px-4 font-medium">Statut</th>
                      <th className="py-3 px-4 font-medium">Référence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line text-xs">
                    {payouts.map((p) => (
                      <tr key={p.id} className="hover:bg-surface-2 transition-colors">
                        <td className="py-3.5 px-4 text-ink-2">{formatDate(p.createdAt)}</td>
                        <td className="py-3.5 px-4 text-ink font-medium">{p.method}</td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-ink">
                          {formatFinance(p.amountCents, p.currency)}
                        </td>
                        <td className="py-3.5 px-4">
                          {p.status === "PAID" ? (
                            <Badge tone="mint">Payé</Badge>
                          ) : p.status === "FAILED" ? (
                            <Badge tone="danger">Rejeté</Badge>
                          ) : (
                            <Badge tone="stamp">En cours de traitement</Badge>
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
              <h2 className="font-display text-lg font-bold text-ink mb-1">Kit de vente & Arguments commerciaux</h2>
              <p className="text-xs text-ink-3 mb-6">
                Ressources prêtes à l&apos;emploi pour convaincre les commerçants, restaurants et salons en quelques minutes.
              </p>

              <div className="grid gap-6 md:grid-cols-2">
                {/* Pitch en 30 secondes */}
                <div className="rounded-xl border border-line bg-surface-2 p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-[#C7FF3D]" />
                    <h3 className="font-display text-sm font-bold text-ink">Le pitch FOVE en 30 secondes</h3>
                  </div>
                  <p className="text-xs text-ink-2 leading-relaxed italic border-l-2 border-[#C7FF3D] pl-3">
                    &quot;80% des cartes de fidélité en carton sont perdues ou oubliées à la maison. Avec FOVE, vos clients
                    enregistrent votre carte directement dans leur Apple Wallet ou Google Wallet en scannant un QR code sur
                    votre comptoir. Zéro application à télécharger, notifications push de relance, et vous doublez le retour de vos
                    meilleurs clients dès le premier mois.&quot;
                  </p>
                </div>

                {/* Script WhatsApp */}
                <div className="rounded-xl border border-line bg-surface-2 p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Smartphone className="size-4 text-emerald-500" />
                      <h3 className="font-display text-sm font-bold text-ink">Message WhatsApp type</h3>
                    </div>
                    <Button
                      onClick={() => {
                        navigator.clipboard.writeText(
                          `Salut ! J'ai pensé à ton commerce : regarde cette solution qui remplace les cartes de fidélité en papier par des cartes digitales Apple Wallet & Google Wallet. Ça prend 5 minutes à configurer et ça marche sans aucune application : ${partner.partnerLink}`
                        );
                        alert("Message WhatsApp copié dans le presse-papier !");
                      }}
                      size="sm"
                      variant="secondary"
                      className="text-xs gap-1"
                    >
                      <Copy className="size-3" /> Copier
                    </Button>
                  </div>
                  <p className="text-xs text-ink-2 leading-relaxed border-l-2 border-emerald-500 pl-3">
                    &quot;Salut ! J&apos;ai pensé à ton commerce : regarde cette solution qui remplace les cartes de fidélité en
                    papier par des cartes digitales Apple Wallet & Google Wallet. Ça prend 5 minutes à configurer et ça marche sans
                    aucune application : {partner.partnerLink}&quot;
                  </p>
                </div>
              </div>

              {/* Arguments anti-objections */}
              <div className="mt-8 space-y-4">
                <h3 className="font-display text-sm font-bold text-ink">Réponses aux 3 objections courantes</h3>
                <div className="grid gap-4 sm:grid-cols-3 text-xs">
                  <div className="rounded-lg border border-line p-4 space-y-1">
                    <strong className="text-ink">&quot;Mes clients préfèrent le papier&quot;</strong>
                    <p className="text-ink-3">
                      En réalité, 70% des clients oublient leur carte papier. Leur smartphone, en revanche, est toujours dans leur
                      poche au moment de régler.
                    </p>
                  </div>
                  <div className="rounded-lg border border-line p-4 space-y-1">
                    <strong className="text-ink">&quot;C&apos;est trop cher pour moi&quot;</strong>
                    <p className="text-ink-3">
                      L&apos;offre Starter est à seulement 99 $ par an (moins de 9 $ par mois). Un seul client fidélisé de plus par
                      semaine rentabilise l&apos;investissement.
                    </p>
                  </div>
                  <div className="rounded-lg border border-line p-4 space-y-1">
                    <strong className="text-ink">&quot;Je n&apos;ai pas le temps de configurer&quot;</strong>
                    <p className="text-ink-3">
                      Le compte se configure en 5 minutes chrono sur smartphone ou ordinateur, et l&apos;affiche QR code est
                      générée immédiatement prête à imprimer.
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
