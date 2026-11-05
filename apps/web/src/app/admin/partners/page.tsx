"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Award,
  CheckCircle2,
  Clock,
  ExternalLink,
  Plus,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  UserCheck,
  UserX,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Badge, PageHeader, Panel } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { formatFinance } from "@/components/admin/finance/finance-utils";
import { PartnerModal } from "@/components/admin/finance/partner-modal";

interface AdminPartnerRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  code: string;
  partnerType: string | null;
  country: string | null;
  city: string | null;
  commissionRatePercent: number;
  status: string;
  rejectionReason: string | null;
  promotionStrategy: string | null;
  networkSizeEstimate: string | null;
  websiteUrl: string | null;
  totalClicksCount: number;
  totalConversionsCount: number;
  createdAt: string;
  payoutInfo: any;
  _count: {
    clicks: number;
    attributions: number;
    commissions: number;
    payouts: number;
    leads: number;
  };
}

export default function AdminPartnersPage() {
  const [activeTab, setActiveTab] = useState<"applications" | "partners" | "payouts" | "settings">("applications");
  const [q, setQ] = useState("");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [partnerModalOpen, setPartnerModalOpen] = useState(false);

  // Modal pour paiement d'un virement
  const [payoutTarget, setPayoutTarget] = useState<any | null>(null);
  const [payoutRef, setPayoutRef] = useState("");
  const [payoutProof, setPayoutProof] = useState("");

  const { data: partners = [], isLoading, refetch } = useQuery({
    queryKey: ["admin-partners-list"],
    queryFn: () => api.get<AdminPartnerRow[]>("/admin/partners"),
  });

  const { data: settings, refetch: refetchSettings } = useQuery({
    queryKey: ["admin-partners-settings"],
    queryFn: () => api.get<any>("/admin/partners/settings"),
  });

  const { data: commissionsData, refetch: refetchCommissions } = useQuery({
    queryKey: ["admin-commissions-all"],
    queryFn: () => api.get<{ items: any[]; totalPendingCents: number; totalPaidCents: number }>("/admin/finance/commissions"),
  });

  const pendingApplications = partners.filter((p) => p.status === "PENDING" || p.status === "UNDER_REVIEW");
  const approvedPartners = partners.filter((p) => p.status === "APPROVED" || p.status === "ACTIVE" || p.status === "PAUSED" || p.status === "SUSPENDED");

  // Filtrage
  const filteredApproved = approvedPartners.filter((p) => {
    if (!q) return true;
    const term = q.toLowerCase();
    return (
      p.name.toLowerCase().includes(term) ||
      p.email.toLowerCase().includes(term) ||
      p.code.toLowerCase().includes(term) ||
      (p.company && p.company.toLowerCase().includes(term))
    );
  });

  const handleApprove = async (id: string) => {
    setActionLoadingId(id);
    try {
      await api.post(`/admin/partners/${id}/approve`);
      refetch();
    } catch (err: any) {
      alert(err?.message || "Erreur lors de l'approbation");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReject = async (id: string) => {
    const reason = prompt("Indiquez le motif du rejet de la candidature :");
    if (reason === null) return;
    setActionLoadingId(id);
    try {
      await api.post(`/admin/partners/${id}/reject`, { reason: reason.trim() || "Dossier non retenu" });
      refetch();
    } catch (err: any) {
      alert(err?.message || "Erreur lors du rejet");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleToggleStatus = async (partner: AdminPartnerRow) => {
    const nextStatus = partner.status === "ACTIVE" || partner.status === "APPROVED" ? "SUSPENDED" : "ACTIVE";
    if (!confirm(`Changer le statut de ${partner.name} vers "${nextStatus}" ?`)) return;

    setActionLoadingId(partner.id);
    try {
      await api.patch(`/admin/partners/${partner.id}`, { status: nextStatus });
      refetch();
    } catch (err: any) {
      alert(err?.message || "Erreur lors de la mise à jour");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleEditRate = async (partner: AdminPartnerRow) => {
    const input = prompt(`Nouveau taux de commission en % pour ${partner.name} :`, String(partner.commissionRatePercent));
    if (input === null) return;
    const rate = Number.parseFloat(input);
    if (Number.isNaN(rate) || rate < 0 || rate > 100) {
      alert("Taux invalide");
      return;
    }

    setActionLoadingId(partner.id);
    try {
      await api.patch(`/admin/partners/${partner.id}`, { commissionRatePercent: rate, status: partner.status });
      refetch();
    } catch (err: any) {
      alert(err?.message || "Erreur lors de la mise à jour");
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <PageHeader
          title="Programme Partenaires & Affiliation"
          description="Recrutement des apporteurs d'affaires, attribution des commerces et validation des commissions."
        />
        <Button onClick={() => setPartnerModalOpen(true)} className="gap-2" variant="primary">
          <Plus className="size-4" />
          Créer un partenaire
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <Panel className="p-4">
          <div className="flex items-center justify-between text-xs text-ink-3">
            <span>Candidatures en attente</span>
            <Clock className="size-4 text-amber-500" />
          </div>
          <div className="mt-2 font-display text-2xl font-bold tabular text-amber-500">
            {pendingApplications.length}
          </div>
          <p className="mt-1 text-xs text-ink-3">Dossiers à examiner</p>
        </Panel>

        <Panel className="p-4">
          <div className="flex items-center justify-between text-xs text-ink-3">
            <span>Partenaires actifs</span>
            <Users className="size-4 text-cobalt" />
          </div>
          <div className="mt-2 font-display text-2xl font-bold tabular text-ink">
            {approvedPartners.length}
          </div>
          <p className="mt-1 text-xs text-ink-3">Apporteurs d&apos;affaires validés</p>
        </Panel>

        <Panel className="p-4">
          <div className="flex items-center justify-between text-xs text-ink-3">
            <span>Commissions en attente</span>
            <Wallet className="size-4 text-rose-500" />
          </div>
          <div className="mt-2 font-display text-2xl font-bold tabular text-rose-500">
            {formatFinance(commissionsData?.totalPendingCents ?? 0, "USD")}
          </div>
          <p className="mt-1 text-xs text-ink-3">À verser aux partenaires</p>
        </Panel>

        <Panel className="p-4">
          <div className="flex items-center justify-between text-xs text-ink-3">
            <span>Commissions déjà versées</span>
            <CheckCircle2 className="size-4 text-emerald-500" />
          </div>
          <div className="mt-2 font-display text-2xl font-bold tabular text-emerald-600 dark:text-emerald-400">
            {formatFinance(commissionsData?.totalPaidCents ?? 0, "USD")}
          </div>
          <p className="mt-1 text-xs text-ink-3">Règlements honorés</p>
        </Panel>
      </div>

      {/* Navigation Onglets */}
      <div className="flex items-center gap-2 border-b border-line mb-6 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab("applications")}
          className={`flex items-center gap-2 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors ${
            activeTab === "applications"
              ? "border-cobalt text-ink font-semibold"
              : "border-transparent text-ink-3 hover:text-ink-2"
          }`}
        >
          <Clock className="size-3.5" />
          Candidatures ({pendingApplications.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("partners")}
          className={`flex items-center gap-2 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors ${
            activeTab === "partners"
              ? "border-cobalt text-ink font-semibold"
              : "border-transparent text-ink-3 hover:text-ink-2"
          }`}
        >
          <Users className="size-3.5" />
          Partenaires actifs ({approvedPartners.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("settings")}
          className={`flex items-center gap-2 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors ${
            activeTab === "settings"
              ? "border-cobalt text-ink font-semibold"
              : "border-transparent text-ink-3 hover:text-ink-2"
          }`}
        >
          <Settings className="size-3.5" />
          Réglages du programme
        </button>
      </div>

      {/* TAB : CANDIDATURES EN ATTENTE */}
      {activeTab === "applications" && (
        <div className="space-y-4">
          {pendingApplications.length === 0 ? (
            <Panel className="p-12 text-center text-sm text-ink-3">
              Aucune candidature en attente d&apos;examen.
            </Panel>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {pendingApplications.map((app) => (
                <Panel key={app.id} className="p-5 flex flex-col justify-between space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-display text-base font-bold text-ink">{app.name}</h3>
                        <div className="text-xs text-ink-3">{app.email} · {app.phone}</div>
                        {app.company && <div className="text-xs text-cobalt font-medium">{app.company}</div>}
                      </div>
                      <Badge tone="stamp">En attente</Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs bg-surface-2 p-3 rounded-lg">
                      <div>
                        <span className="text-ink-3">Profil :</span>{" "}
                        <strong className="text-ink">{app.partnerType}</strong>
                      </div>
                      <div>
                        <span className="text-ink-3">Zone :</span>{" "}
                        <strong className="text-ink">{app.city}, {app.country}</strong>
                      </div>
                      <div>
                        <span className="text-ink-3">Réseau estimé :</span>{" "}
                        <strong className="text-ink">{app.networkSizeEstimate ?? "Non précisé"}</strong>
                      </div>
                      <div>
                        <span className="text-ink-3">Code projeté :</span>{" "}
                        <strong className="font-mono text-cobalt">{app.code}</strong>
                      </div>
                    </div>

                    {app.promotionStrategy && (
                      <div className="text-xs text-ink-2 bg-surface p-3 rounded-lg border border-line">
                        <strong className="block text-ink-3 mb-1">Stratégie de promotion :</strong>
                        {app.promotionStrategy}
                      </div>
                    )}

                    {app.websiteUrl && (
                      <a
                        href={app.websiteUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-cobalt hover:underline"
                      >
                        Site / Profil public <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
                    <Button
                      onClick={() => handleReject(app.id)}
                      disabled={actionLoadingId === app.id}
                      variant="ghost"
                      size="sm"
                      className="text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                    >
                      <UserX className="size-3.5 mr-1" /> Rejeter
                    </Button>
                    <Button
                      onClick={() => handleApprove(app.id)}
                      disabled={actionLoadingId === app.id}
                      variant="primary"
                      size="sm"
                      className="text-xs gap-1"
                    >
                      <UserCheck className="size-3.5" /> Approuver le partenaire
                    </Button>
                  </div>
                </Panel>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB : PARTENAIRES ACTIFS */}
      {activeTab === "partners" && (
        <div className="space-y-4">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <Input
              type="search"
              placeholder="Rechercher par nom, code ou email..."
              className="pl-10"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          {filteredApproved.length === 0 ? (
            <Panel className="p-12 text-center text-sm text-ink-3">Aucun partenaire trouvé.</Panel>
          ) : (
            <Panel className="overflow-x-auto">
              <table className="w-full min-w-[950px] text-left text-sm">
                <thead className="border-b border-line bg-surface-2 text-xs text-ink-3">
                  <tr>
                    <th className="py-3 px-4 font-medium">Partenaire</th>
                    <th className="py-3 px-4 font-medium">Code Unique</th>
                    <th className="py-3 px-4 font-medium text-center">Taux</th>
                    <th className="py-3 px-4 font-medium text-center">Clics</th>
                    <th className="py-3 px-4 font-medium text-center">Clients acquis</th>
                    <th className="py-3 px-4 font-medium">Statut</th>
                    <th className="py-3 px-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line text-xs">
                  {filteredApproved.map((p) => (
                    <tr key={p.id} className="hover:bg-surface-2 transition-colors">
                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          onClick={() => handleEditRate(p)}
                          className="font-semibold text-ink hover:text-cobalt hover:underline text-left block truncate"
                        >
                          {p.name}
                        </button>
                        <div className="text-ink-3">{p.email} · {p.phone ?? ""}</div>
                        {p.company && <div className="text-[11px] text-cobalt">{p.company}</div>}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-cobalt">
                        {p.code}
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono font-semibold text-ink">
                        {p.commissionRatePercent} %
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono text-ink">
                        {p.totalClicksCount || p._count.clicks}
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {p.totalConversionsCount || p._count.attributions}
                      </td>
                      <td className="py-3.5 px-4">
                        {p.status === "ACTIVE" || p.status === "APPROVED" ? (
                          <Badge tone="mint">Actif</Badge>
                        ) : p.status === "SUSPENDED" ? (
                          <Badge tone="danger">Suspendu</Badge>
                        ) : (
                          <Badge tone="neutral">{p.status}</Badge>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-1">
                        <Button
                          onClick={() => handleEditRate(p)}
                          variant="secondary"
                          size="sm"
                          className="h-7 text-[11px]"
                        >
                          Taux %
                        </Button>
                        <Button
                          onClick={() => handleToggleStatus(p)}
                          variant="ghost"
                          size="sm"
                          className={`h-7 text-[11px] ${
                            p.status === "SUSPENDED" ? "text-emerald-500" : "text-rose-500"
                          }`}
                        >
                          {p.status === "SUSPENDED" ? "Réactiver" : "Suspendre"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}
        </div>
      )}

      {/* TAB : RÉGLAGES DU PROGRAMME */}
      {activeTab === "settings" && settings && (
        <Panel className="p-6 max-w-2xl space-y-4">
          <h2 className="font-display text-base font-bold text-ink">Paramètres globaux du programme partenaires</h2>
          <p className="text-xs text-ink-3">
            Règles par défaut appliquées aux nouvelles candidatures et aux calculs d&apos;attribution.
          </p>

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="rounded-lg border border-line p-3">
              <span className="text-ink-3">Taux de commission par défaut</span>
              <div className="mt-1 font-mono text-lg font-bold text-ink">
                {settings.defaultCommissionRatePercent} %
              </div>
            </div>

            <div className="rounded-lg border border-line p-3">
              <span className="text-ink-3">Durée d&apos;attribution cookie</span>
              <div className="mt-1 font-mono text-lg font-bold text-ink">
                {settings.cookieAttributionDays} jours
              </div>
            </div>

            <div className="rounded-lg border border-line p-3">
              <span className="text-ink-3">Délai de garantie validation</span>
              <div className="mt-1 font-mono text-lg font-bold text-ink">
                {settings.validationDelayDays} jours
              </div>
            </div>

            <div className="rounded-lg border border-line p-3">
              <span className="text-ink-3">Seuil minimum de retrait</span>
              <div className="mt-1 font-mono text-lg font-bold text-ink">
                {formatFinance(settings.minimumPayoutThresholdCents, "USD")}
              </div>
            </div>
          </div>
        </Panel>
      )}

      <PartnerModal
        open={partnerModalOpen}
        onClose={() => setPartnerModalOpen(false)}
        onCreated={() => refetch()}
      />
    </>
  );
}
