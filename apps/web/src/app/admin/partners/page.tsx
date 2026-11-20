"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import {
  Award,
  CheckCircle2,
  Clock,
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
import { Field, Input, Textarea } from "@/components/ui/field";
import { ConfirmDialog, DialogContent, DialogRoot } from "@/components/ui/dialog";
import { Badge, PageHeader, Panel } from "@/components/ui/misc";
import { api, useErrorMessage } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { formatFinance, formatPct } from "@/components/admin/finance/finance-utils";
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
  const t = useTranslations("admin.partners");
  const errMsg = useErrorMessage();
  const [rateTarget, setRateTarget] = useState<AdminPartnerRow | null>(null);
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
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReject = async (id: string, reason: string) => {
    setActionLoadingId(id);
    try {
      await api.post(`/admin/partners/${id}/reject`, { reason: reason.trim() || t("reject.defaultReason") });
      refetch();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleToggleStatus = async (partner: AdminPartnerRow) => {
    const nextStatus = partner.status === "ACTIVE" || partner.status === "APPROVED" ? "SUSPENDED" : "ACTIVE";
    setActionLoadingId(partner.id);
    try {
      await api.patch(`/admin/partners/${partner.id}`, { status: nextStatus });
      refetch();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleEditRate = async (partner: AdminPartnerRow, rate: number) => {
    setActionLoadingId(partner.id);
    try {
      await api.patch(`/admin/partners/${partner.id}`, { commissionRatePercent: rate, status: partner.status });
      refetch();
      setRateTarget(null);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <PageHeader
          title={t("title")}
          description={t("description")}
        />
        <Button onClick={() => setPartnerModalOpen(true)} className="gap-2" variant="primary">
          <Plus className="size-4" />
          {t("create")}
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <Panel className="p-4">
          <div className="flex items-center justify-between text-xs text-ink-3">
            <span>{t("kpi.pendingApplications")}</span>
            <Clock className="size-4 text-amber-500" />
          </div>
          <div className="mt-2 font-display text-2xl font-bold tabular text-amber-500">
            {pendingApplications.length}
          </div>
          <p className="mt-1 text-xs text-ink-3">{t("kpi.pendingApplicationsHelp")}</p>
        </Panel>

        <Panel className="p-4">
          <div className="flex items-center justify-between text-xs text-ink-3">
            <span>{t("kpi.activePartners")}</span>
            <Users className="size-4 text-cobalt" />
          </div>
          <div className="mt-2 font-display text-2xl font-bold tabular text-ink">
            {approvedPartners.length}
          </div>
          <p className="mt-1 text-xs text-ink-3">{t("kpi.activePartnersHelp")}</p>
        </Panel>

        <Panel className="p-4">
          <div className="flex items-center justify-between text-xs text-ink-3">
            <span>{t("kpi.pendingCommissions")}</span>
            <Wallet className="size-4 text-rose-500" />
          </div>
          <div className="mt-2 font-display text-2xl font-bold tabular text-rose-500">
            {formatFinance(commissionsData?.totalPendingCents ?? 0, "USD")}
          </div>
          <p className="mt-1 text-xs text-ink-3">{t("kpi.pendingCommissionsHelp")}</p>
        </Panel>

        <Panel className="p-4">
          <div className="flex items-center justify-between text-xs text-ink-3">
            <span>{t("kpi.paidCommissions")}</span>
            <CheckCircle2 className="size-4 text-emerald-500" />
          </div>
          <div className="mt-2 font-display text-2xl font-bold tabular text-emerald-600 dark:text-emerald-400">
            {formatFinance(commissionsData?.totalPaidCents ?? 0, "USD")}
          </div>
          <p className="mt-1 text-xs text-ink-3">{t("kpi.paidCommissionsHelp")}</p>
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
          {t("tabs.applications", { count: pendingApplications.length })}
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
          {t("tabs.partners", { count: approvedPartners.length })}
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
          {t("tabs.settings")}
        </button>
      </div>

      {/* TAB : CANDIDATURES EN ATTENTE */}
      {activeTab === "applications" && (
        <div className="space-y-4">
          {pendingApplications.length === 0 ? (
            <Panel className="p-12 text-center text-sm text-ink-3">
              {t("applications.empty")}
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
                      <Badge tone="stamp">{t("applications.pending")}</Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs bg-surface-2 p-3 rounded-lg">
                      <div>
                        <span className="text-ink-3">{t("applications.profile")}</span>{" "}
                        <strong className="text-ink">{app.partnerType}</strong>
                      </div>
                      <div>
                        <span className="text-ink-3">{t("applications.area")}</span>{" "}
                        <strong className="text-ink">{app.city}, {app.country}</strong>
                      </div>
                      <div>
                        <span className="text-ink-3">{t("applications.network")}</span>{" "}
                        <strong className="text-ink">{app.networkSizeEstimate ?? t("applications.notSpecified")}</strong>
                      </div>
                      <div>
                        <span className="text-ink-3">{t("applications.code")}</span>{" "}
                        <strong className="font-mono text-cobalt" dir="ltr">{app.code}</strong>
                      </div>
                    </div>

                    {app.promotionStrategy && (
                      <div className="text-xs text-ink-2 bg-surface p-3 rounded-lg border border-line">
                        <strong className="block text-ink-3 mb-1">{t("applications.strategy")}</strong>
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
                        {t("applications.website")}
                      </a>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
                    <RejectDialog
                      name={app.name}
                      disabled={actionLoadingId === app.id}
                      onReject={(reason) => handleReject(app.id, reason)}
                    />
                    <Button
                      onClick={() => handleApprove(app.id)}
                      disabled={actionLoadingId === app.id}
                      variant="primary"
                      size="sm"
                      className="text-xs gap-1"
                    >
                      <UserCheck className="size-3.5" /> {t("applications.approve")}
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
            <Search className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <Input
              type="search"
              aria-label={t("partners.searchLabel")}
              placeholder={t("partners.searchPlaceholder")}
              className="ps-10"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          {filteredApproved.length === 0 ? (
            <Panel className="p-12 text-center text-sm text-ink-3">{t("partners.empty")}</Panel>
          ) : (
            <Panel className="overflow-x-auto">
              <table className="w-full min-w-[950px] text-start text-sm">
                <thead className="border-b border-line bg-surface-2 text-xs text-ink-3">
                  <tr>
                    <th className="py-3 px-4 font-medium">{t("partners.table.partner")}</th>
                    <th className="py-3 px-4 font-medium">{t("partners.table.code")}</th>
                    <th className="py-3 px-4 font-medium text-center">{t("partners.table.rate")}</th>
                    <th className="py-3 px-4 font-medium text-center">{t("partners.table.clicks")}</th>
                    <th className="py-3 px-4 font-medium text-center">{t("partners.table.conversions")}</th>
                    <th className="py-3 px-4 font-medium">{t("partners.table.status")}</th>
                    <th className="py-3 px-4 font-medium text-end">{t("partners.table.actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line text-xs">
                  {filteredApproved.map((p) => (
                    <tr key={p.id} className="hover:bg-surface-2 transition-colors">
                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          onClick={() => setRateTarget(p)}
                          className="font-semibold text-ink hover:text-cobalt hover:underline text-start block truncate"
                        >
                          {p.name}
                        </button>
                        <div className="text-ink-3">{p.email} · {p.phone ?? ""}</div>
                        {p.company && <div className="text-[11px] text-cobalt">{p.company}</div>}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-cobalt" dir="ltr">
                        {p.code}
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono font-semibold text-ink">
                        {formatPct(p.commissionRatePercent)}
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono text-ink">
                        {p.totalClicksCount || p._count.clicks}
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {p.totalConversionsCount || p._count.attributions}
                      </td>
                      <td className="py-3.5 px-4">
                        {p.status === "ACTIVE" || p.status === "APPROVED" ? (
                          <Badge tone="mint">{t("status.active")}</Badge>
                        ) : p.status === "SUSPENDED" ? (
                          <Badge tone="danger">{t("status.suspended")}</Badge>
                        ) : (
                          <Badge tone="neutral">{p.status}</Badge>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-end">
                        <div className="inline-flex gap-1">
                          <Button
                            onClick={() => setRateTarget(p)}
                            variant="secondary"
                            size="sm"
                            className="h-7 text-[11px]"
                          >
                            {t("partners.rateButton")}
                          </Button>
                          <ConfirmDialog
                            trigger={
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={actionLoadingId === p.id}
                                className={`h-7 text-[11px] ${
                                  p.status === "SUSPENDED" ? "text-emerald-500" : "text-rose-500"
                                }`}
                              >
                                {p.status === "SUSPENDED" ? t("partners.reactivate") : t("partners.suspend")}
                              </Button>
                            }
                            title={p.status === "SUSPENDED" ? t("toggle.reactivateTitle", { name: p.name }) : t("toggle.suspendTitle", { name: p.name })}
                            consequence={p.status === "SUSPENDED" ? t("toggle.reactivateConsequence") : t("toggle.suspendConsequence")}
                            confirmLabel={p.status === "SUSPENDED" ? t("partners.reactivate") : t("partners.suspend")}
                            destructive={p.status !== "SUSPENDED"}
                            onConfirm={() => handleToggleStatus(p)}
                          />
                        </div>
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
          <h2 className="font-display text-base font-bold text-ink">{t("settings.title")}</h2>
          <p className="text-xs text-ink-3">
            {t("settings.description")}
          </p>

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="rounded-lg border border-line p-3">
              <span className="text-ink-3">{t("settings.defaultRate")}</span>
              <div className="mt-1 font-mono text-lg font-bold text-ink">
                {formatPct(settings.defaultCommissionRatePercent)}
              </div>
            </div>

            <div className="rounded-lg border border-line p-3">
              <span className="text-ink-3">{t("settings.cookieDays")}</span>
              <div className="mt-1 font-mono text-lg font-bold text-ink">
                {t("settings.days", { count: settings.cookieAttributionDays })}
              </div>
            </div>

            <div className="rounded-lg border border-line p-3">
              <span className="text-ink-3">{t("settings.validationDelay")}</span>
              <div className="mt-1 font-mono text-lg font-bold text-ink">
                {t("settings.days", { count: settings.validationDelayDays })}
              </div>
            </div>

            <div className="rounded-lg border border-line p-3">
              <span className="text-ink-3">{t("settings.minimumPayout")}</span>
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

      <RateDialog
        partner={rateTarget}
        busy={rateTarget !== null && actionLoadingId === rateTarget.id}
        onClose={() => setRateTarget(null)}
        onSave={(rate) => rateTarget && handleEditRate(rateTarget, rate)}
      />
    </>
  );
}

function RejectDialog({ name, disabled, onReject }: { name: string; disabled: boolean; onReject: (reason: string) => Promise<void> }) {
  const t = useTranslations("admin.partners.reject");
  const [reason, setReason] = useState("");
  return (
    <ConfirmDialog
      trigger={
        <Button
          disabled={disabled}
          variant="ghost"
          size="sm"
          className="text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
        >
          <UserX className="size-3.5 me-1" /> {t("button")}
        </Button>
      }
      title={t("title", { name })}
      consequence={t("consequence")}
      confirmLabel={t("confirm")}
      destructive
      onConfirm={() => onReject(reason)}
    >
      <Field label={t("reasonLabel")}>
        {(f) => <Textarea {...f} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />}
      </Field>
    </ConfirmDialog>
  );
}

function RateDialog({ partner, busy, onClose, onSave }: { partner: AdminPartnerRow | null; busy: boolean; onClose: () => void; onSave: (rate: number) => void }) {
  const t = useTranslations("admin.partners.rate");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lastId, setLastId] = useState<string | null>(null);
  if (partner && partner.id !== lastId) {
    setLastId(partner.id);
    setValue(String(partner.commissionRatePercent));
    setError(null);
  }
  return (
    <DialogRoot open={partner !== null} onOpenChange={(o) => !o && !busy && onClose()}>
      {partner && (
        <DialogContent title={t("title", { name: partner.name })} description={t("description")}>
          <Field label={t("label")} error={error ?? undefined}>
            {(f) => (
              <Input
                {...f}
                type="number"
                min="0"
                max="100"
                step="0.5"
                dir="ltr"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            )}
          </Field>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              {t("cancel")}
            </Button>
            <Button
              loading={busy}
              onClick={() => {
                const rate = Number.parseFloat(value.replace(",", "."));
                if (Number.isNaN(rate) || rate < 0 || rate > 100) {
                  setError(t("invalid"));
                  return;
                }
                onSave(rate);
              }}
            >
              {t("save")}
            </Button>
          </div>
        </DialogContent>
      )}
    </DialogRoot>
  );
}
