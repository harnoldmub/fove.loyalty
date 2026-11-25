"use client";

import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, DialogContent, DialogRoot } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { ArrowLeft, Palette, ShieldCheck, Store } from "lucide-react";
import Link from "next/link";
import { Badge, ErrorNote, Panel, Skeleton } from "@/components/ui/misc";
import { api, useErrorMessage } from "@/lib/api";
import { formatDate, formatNumber, formatPrice } from "@/lib/utils";
import { BILLING_CURRENCIES, type BillingCurrency } from "@fove/shared";

type QuotaKey = "customers" | "establishments" | "staff" | "programs";
const QUOTAS: QuotaKey[] = ["customers", "establishments", "staff", "programs"];

interface Detail {
  id: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "SUSPENDED";
  suspendedReason: string | null;
  createdAt: string;
  settings?: {
    logoUrl: string | null;
    primaryColor: string;
    walletBannerUrl?: string | null;
    country: string;
    currency: string;
    /** Monnaie de facturation choisie (vide = celle du pays). */
    billingCurrency?: string | null;
    timezone: string;
    legalName?: string | null;
    contactEmail?: string | null;
    instagramHandle?: string | null;
    privacyPolicyUrl?: string | null;
  } | null;
  subscription: {
    status: string;
    provider: string;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    limitsOverride: Partial<Record<QuotaKey, number | null>> | null;
    contractPriceYearlyCents: number | null;
    currency: string;
    plan: { code: string; name: string };
  } | null;
  /** Monnaie de facturation effective (choix du commerce, sinon celle du pays). */
  billingCurrency: BillingCurrency;
  memberships: { id: string; user: { email: string; name: string }; role: { key: string } }[];
  integrations: { id: string; name: string; provider: string; lastSyncAt: string | null; lastError: string | null }[];
  _count: { customers: number; accounts: number; transactions: number; programs: number; establishments: number };
  audit: { id: string; action: string; createdAt: string; metadata: unknown }[];
  programs?: { id: string; name: string; mode: "POINTS" | "STAMPS"; stampsTarget: number }[];
  establishments?: { id: string; name: string; city: string | null; address: string | null }[];
}


export default function AdminTenant() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("admin.tenant");
  const errMsg = useErrorMessage();
  const label = (group: "subStatus" | "provider" | "role", key: string) => (t.has(`${group}.${key}`) ? t(`${group}.${key}`) : key);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin-tenant", id], queryFn: () => api.get<Detail>(`/admin/tenants/${id}`) });
  const [reason, setReason] = useState("");
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportReason, setSupportReason] = useState("");
  const [supportError, setSupportError] = useState<string | null>(null);
  if (!data) return <Skeleton className="h-96" />;
  const suspended = data.status === "SUSPENDED";

  return (
    <>
      <Link href="/admin" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden /> {t("back")}
      </Link>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          {data.settings?.logoUrl ? (
            <img
              src={data.settings.logoUrl}
              alt={data.name}
              className="size-16 shrink-0 rounded-2xl border border-line bg-surface object-cover shadow-xs"
            />
          ) : (
            <div
              className="grid size-16 shrink-0 place-items-center rounded-2xl font-display text-2xl font-bold text-white shadow-xs"
              style={{ background: data.settings?.primaryColor ?? "var(--cobalt)" }}
            >
              {data.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold text-ink sm:text-[1.75rem]">{data.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-2">
              <span className="font-mono text-xs text-ink-3" dir="ltr">{data.slug}</span>
              <span>·</span>
              <span>{t("createdOn", { date: formatDate(data.createdAt) })}</span>
              {data.settings?.primaryColor && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1.5 text-xs text-ink-3">
                    <span className="size-2.5 rounded-full border border-black/10" style={{ background: data.settings.primaryColor }} />
                    {data.settings.primaryColor}
                  </span>
                </>
              )}
              <span>·</span>
              <Link
                href={`/${data.slug}`}
                target="_blank"
                className="inline-flex items-center gap-1 text-xs text-cobalt hover:underline"
              >
                {t("publicPage")}
              </Link>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => setSupportOpen(true)}>{t("support.button")}</Button>
          <ConfirmDialog
            trigger={<Button variant={suspended ? "primary" : "danger"}>{suspended ? t("status.reactivate") : t("status.suspend")}</Button>}
            title={suspended ? t("status.reactivateTitle") : t("status.suspendTitle")}
            consequence={suspended ? t("status.reactivateConsequence") : t("status.suspendConsequence")}
            confirmLabel={suspended ? t("status.reactivate") : t("status.suspend")}
            destructive={!suspended}
            onConfirm={async () => {
              try {
                await api.post(`/admin/tenants/${id}/status`, { status: suspended ? "ACTIVE" : "SUSPENDED", reason: reason || (suspended ? t("status.defaultReactivate") : t("status.defaultSuspend")) });
                qc.invalidateQueries({ queryKey: ["admin-tenant", id] });
              } catch (e) {
                toast.error(errMsg(e));
              }
            }}
          >
            <Field label={t("status.reason")}>{(p) => <Input {...p} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
          </ConfirmDialog>
        </div>
      </div>
      {suspended && <p className="mb-4"><Badge tone="danger">{t("suspendedBadge", { reason: data.suspendedReason ?? "—" })}</Badge></p>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel className="p-5">
          <h2 className="mb-3 font-display text-lg font-semibold">{t("activity.title")}</h2>
          <dl className="grid grid-cols-3 gap-4 text-sm">
            {(["customers", "accounts", "transactions", "programs", "establishments"] as const).map((k) => [k, data._count[k]] as const).map(([k, v]) => (
              <div key={k}><dt className="text-ink-2">{t(`activity.${k}`)}</dt><dd className="font-display text-xl font-semibold tabular">{formatNumber(v)}</dd></div>
            ))}
          </dl>
        </Panel>
        <Panel className="grid gap-3 p-5">
          <h2 className="font-display text-lg font-semibold">{t("subscription.title")}</h2>
          <p className="text-sm text-ink-2">
            {data.subscription
              ? `${data.subscription.plan.name} · ${label("subStatus", data.subscription.status)} · ${label("provider", data.subscription.provider)}`
              : t("subscription.none")}
            {data.subscription?.trialEndsAt && t("subscription.trialUntil", { date: formatDate(data.subscription.trialEndsAt) })}
            {data.subscription?.currentPeriodEnd && t("subscription.until", { date: formatDate(data.subscription.currentPeriodEnd) })}
            {data.subscription?.contractPriceYearlyCents ? t("subscription.contract", { price: formatPrice(data.subscription.contractPriceYearlyCents, data.subscription.currency) }) : ""}
          </p>
          <BillingCurrencyField tenantId={id} chosen={data.settings?.billingCurrency ?? null} effective={data.billingCurrency} subscriptionCurrency={data.subscription?.status !== "CANCELED" ? (data.subscription?.currency ?? null) : null} />
          <SubscriptionForm tenantId={id} current={data.subscription} defaultCurrency={data.billingCurrency} />
        </Panel>
        <Panel className="p-5">
          <h2 className="mb-3 font-display text-lg font-semibold">{t("team.title")}</h2>
          {data.memberships.length === 0 ? (
            <p className="text-sm text-ink-3">{t("team.empty")}</p>
          ) : (
            <ul className="grid gap-2.5 text-sm">
              {data.memberships.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{m.user.name}</span>
                    <span className="block truncate text-ink-3">{m.user.email}</span>
                  </span>
                  <Badge>{label("role", m.role.key)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel className="p-5">
          <h2 className="mb-3 font-display text-lg font-semibold flex items-center gap-2">
            <Palette className="size-4 text-cobalt" />
            {t("brand.title")}
          </h2>
          <div className="grid gap-3 text-sm">
            <div className="flex items-center justify-between gap-3 border-b border-line pb-2.5">
              <span className="text-ink-2">{t("brand.logo")}</span>
              {data.settings?.logoUrl ? (
                <div className="flex items-center gap-2">
                  <img src={data.settings.logoUrl} alt="" className="size-8 rounded-lg border border-line bg-surface object-cover" />
                  <a href={data.settings.logoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-cobalt hover:underline">
                    {t("brand.open")}
                  </a>
                </div>
              ) : (
                <span className="text-xs text-ink-3">{t("brand.noLogo")}</span>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-line pb-2.5">
              <span className="text-ink-2">{t("brand.color")}</span>
              <span className="inline-flex items-center gap-1.5 font-mono text-xs" dir="ltr">
                <span className="size-3.5 rounded-full border border-black/10" style={{ background: data.settings?.primaryColor ?? "#1F4FFF" }} />
                {data.settings?.primaryColor ?? "#1F4FFF"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-line pb-2.5">
              <span className="text-ink-2">{t("brand.countryCurrency")}</span>
              <span className="font-medium">{data.settings?.country ?? "CD"} · {data.settings?.currency ?? "CDF"}</span>
            </div>
            {data.settings?.contactEmail && (
              <div className="flex items-center justify-between gap-3 border-b border-line pb-2.5">
                <span className="text-ink-2">{t("brand.email")}</span>
                <span className="truncate text-xs font-mono" dir="ltr">{data.settings.contactEmail}</span>
              </div>
            )}
            {data.settings?.instagramHandle && (
              <div className="flex items-center justify-between gap-3 border-b border-line pb-2.5">
                <span className="text-ink-2">Instagram</span>
                <span className="text-xs font-medium" dir="ltr">@{data.settings.instagramHandle.replace(/^@/, "")}</span>
              </div>
            )}
            {data.settings?.walletBannerUrl && (
              <div>
                <span className="block mb-1.5 text-xs text-ink-2">{t("brand.banner")}</span>
                <img src={data.settings.walletBannerUrl} alt={t("brand.banner")} className="aspect-[375/144] w-full rounded-lg border border-line object-cover" />
              </div>
            )}
          </div>
        </Panel>
        <Panel className="p-5 lg:col-span-2 space-y-6">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg font-semibold flex items-center gap-2">
                <Store className="size-4 text-cobalt" />
                {t("structure.title")}
              </h2>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-line bg-surface-2 p-3.5">
                <div className="text-xs text-ink-3">{t("structure.establishments")}</div>
                <div className="mt-1 font-display text-2xl font-bold tabular text-ink">
                  {formatNumber(data._count.establishments)}
                </div>
                {data.establishments && data.establishments.length > 0 && (
                  <ul className="mt-2.5 divide-y divide-line/60 text-xs text-ink-2">
                    {data.establishments.map((est) => (
                      <li key={est.id} className="py-1 flex items-center justify-between">
                        <span className="font-medium truncate">{est.name}</span>
                        <span className="text-ink-3 shrink-0 ms-2">{est.city ?? "—"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-lg border border-line bg-surface-2 p-3.5">
                <div className="text-xs text-ink-3">{t("structure.programs")}</div>
                <div className="mt-1 font-display text-2xl font-bold tabular text-ink">
                  {formatNumber(data._count.programs)}
                </div>
                {data.programs && data.programs.length > 0 && (
                  <ul className="mt-2.5 divide-y divide-line/60 text-xs text-ink-2">
                    {data.programs.map((prog) => (
                      <li key={prog.id} className="py-1 flex items-center justify-between">
                        <span className="font-medium truncate">{prog.name}</span>
                        <Badge tone="cobalt" className="shrink-0 text-[10px]">
                          {prog.mode === "POINTS" ? t("structure.points") : t("structure.stamps", { count: prog.stampsTarget })}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          {/* Volumétrie agrégée & Notice de confidentialité RGPD */}
          <div className="rounded-xl border border-line bg-surface p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-ink-3">{t("volume.title")}</span>
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="size-3.5" />
                {t("volume.privacy")}
              </span>
            </div>

            <dl className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-surface-2 p-2.5">
                <dt className="text-[11px] text-ink-3">{t("volume.customers")}</dt>
                <dd className="mt-0.5 font-display text-xl font-bold tabular text-ink">
                  {formatNumber(data._count.customers)}
                </dd>
              </div>
              <div className="rounded-lg bg-surface-2 p-2.5">
                <dt className="text-[11px] text-ink-3">{t("volume.accounts")}</dt>
                <dd className="mt-0.5 font-display text-xl font-bold tabular text-ink">
                  {formatNumber(data._count.accounts)}
                </dd>
              </div>
              <div className="rounded-lg bg-surface-2 p-2.5">
                <dt className="text-[11px] text-ink-3">{t("volume.transactions")}</dt>
                <dd className="mt-0.5 font-display text-xl font-bold tabular text-ink">
                  {formatNumber(data._count.transactions)}
                </dd>
              </div>
            </dl>

            <p className="text-[11px] leading-relaxed text-ink-3 border-t border-line/60 pt-2.5">
              {t.rich("volume.notice", { name: data.name, strong: (c) => <strong>{c}</strong> })}
            </p>
          </div>
        </Panel>

        <Panel className="p-5">
          <h2 className="mb-3 font-display text-lg font-semibold">{t("audit.title")}</h2>
          {data.audit.length === 0 ? (
            <p className="text-sm text-ink-3">{t("audit.empty")}</p>
          ) : (
            <ul className="grid max-h-80 gap-1.5 overflow-y-auto text-sm">
              {data.audit.map((a) => (
                <li key={a.id} className="flex justify-between gap-3"><code className="truncate">{a.action}</code><span className="shrink-0 text-ink-3">{formatDate(a.createdAt, true)}</span></li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <DialogRoot open={supportOpen} onOpenChange={setSupportOpen}>
        <DialogContent title={t("support.title")} description={t("support.description")}>
          <form
            className="grid gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setSupportError(null);
              try {
                await api.post(`/admin/tenants/${id}/support`, { reason: supportReason, minutes: 30 });
                window.location.assign("/app");
              } catch (err) {
                setSupportError(errMsg(err));
              }
            }}
          >
            {supportError && <ErrorNote>{supportError}</ErrorNote>}
            <Field label={t("support.reason")} hint={t("support.reasonHint")}>{(p) => <Input {...p} value={supportReason} onChange={(e) => setSupportReason(e.target.value)} />}</Field>
            <Button type="submit" disabled={supportReason.trim().length < 10}>{t("support.submit")}</Button>
          </form>
        </DialogContent>
      </DialogRoot>
    </>
  );
}

/**
 * Attribution manuelle : période offerte, essai ou contrat sur-mesure (quotas
 * négociés, fin de contrat, prix facturé hors Stripe). Chaque envoi redéfinit
 * tout le contrat.
 */
/** Monnaie de facturation du commerce : prix affichés, contrats et règlements hors ligne. */
function BillingCurrencyField({ tenantId, chosen, effective, subscriptionCurrency }: { tenantId: string; chosen: string | null; effective: BillingCurrency; subscriptionCurrency: string | null }) {
  const t = useTranslations("admin.tenant.billingCurrency");
  const errMsg = useErrorMessage();
  const qc = useQueryClient();
  const save = async (value: string) => {
    try {
      await api.post(`/admin/tenants/${tenantId}/billing-currency`, { currency: value === "" ? null : value });
      await qc.invalidateQueries({ queryKey: ["admin-tenant", tenantId] });
      toast.success(t("saved"));
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  return (
    <div className="grid gap-1">
      <Field label={t("label")} hint={subscriptionCurrency && subscriptionCurrency !== effective ? t("pending", { current: subscriptionCurrency, next: effective }) : t("hint")}>
        {(f) => (
          <Select {...f} value={chosen ?? ""} onChange={(e) => void save(e.target.value)}>
            <option value="">{chosen ? t("country") : t("countryWith", { currency: effective })}</option>
            {BILLING_CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        )}
      </Field>
    </div>
  );
}

function SubscriptionForm({ tenantId, current, defaultCurrency }: { tenantId: string; current: Detail["subscription"]; defaultCurrency: BillingCurrency }) {
  const t = useTranslations("admin.tenant.form");
  const errMsg = useErrorMessage();
  const unlimited = t("unlimited");
  const qc = useQueryClient();
  const { data: plans = [] } = useQuery({ queryKey: ["admin-plans"], queryFn: () => api.get<{ code: string; name: string; kind: string }[]>("/admin/plans") });
  const [plan, setPlan] = useState(current?.plan.code ?? "free");
  const [status, setStatus] = useState<"ACTIVE" | "TRIALING" | "CANCELED">("ACTIVE");
  const [end, setEnd] = useState(current?.currentPeriodEnd?.slice(0, 10) ?? "");
  const [price, setPrice] = useState(current?.contractPriceYearlyCents ? String(current.contractPriceYearlyCents / 100) : "");
  const [currency, setCurrency] = useState<string>(current?.provider === "MANUAL" && current.status !== "CANCELED" ? current.currency : defaultCurrency);
  const [limits, setLimits] = useState<Record<QuotaKey, string>>(() => {
    const o = current?.limitsOverride ?? {};
    const show = (k: QuotaKey) => (k in o ? (o[k] === null ? unlimited : String(o[k])) : "");
    return { customers: show("customers"), establishments: show("establishments"), staff: show("staff"), programs: show("programs") };
  });
  const custom = plans.find((p) => p.code === plan)?.kind === "CUSTOM";
  // Abonnement Stripe en cours : il est arrêté au moment où le contrat manuel le remplace.
  const stripeRunning = current?.provider === "STRIPE" && current.status !== "CANCELED";

  const submit = async () => {
    const limitsOverride: Partial<Record<QuotaKey, number | null>> = {};
    for (const [k, v] of Object.entries(limits) as [QuotaKey, string][]) {
      const raw = v.trim().toLowerCase();
      if (raw === "") continue;
      limitsOverride[k] = [unlimited.toLowerCase(), "illimité", "illimite", "unlimited"].includes(raw) ? null : Number(raw);
    }
    const yearly = Number(price.replace(",", "."));
    try {
    await api.post(`/admin/tenants/${tenantId}/subscription`, {
      planCode: plan,
      status,
      currentPeriodEnd: end ? new Date(`${end}T23:59:59`).toISOString() : null,
      limitsOverride: Object.keys(limitsOverride).length ? limitsOverride : null,
      contractPriceYearlyCents: price.trim() && Number.isFinite(yearly) ? Math.round(yearly * 100) : null,
      currency,
    });
    qc.invalidateQueries({ queryKey: ["admin-tenant", tenantId] });
    toast.success(t("saved"));
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const activatePro = async () => {
    try {
    await api.post(`/admin/tenants/${tenantId}/subscription`, {
      planCode: "business",
      status: "ACTIVE",
      currentPeriodEnd: null,
      limitsOverride: null,
      contractPriceYearlyCents: null,
    });
    await qc.invalidateQueries({ queryKey: ["admin-tenant", tenantId] });
    toast.success(t("proActivated"));
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  return (
    <div className="grid gap-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Select aria-label={t("plan")} value={plan} onChange={(e) => setPlan(e.target.value)}>
          {plans.map((p) => (
            <option key={p.code} value={p.code}>{p.name}</option>
          ))}
        </Select>
        <Select aria-label={t("status")} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="ACTIVE">{t("statuses.ACTIVE")}</option>
          <option value="TRIALING">{t("statuses.TRIALING")}</option>
          <option value="CANCELED">{t("statuses.CANCELED")}</option>
        </Select>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label={t("end")} hint={t("endHint")}>
          {(f) => <Input {...f} type="date" value={end} onChange={(e) => setEnd(e.target.value)} />}
        </Field>
        <div className="grid grid-cols-[1fr_6.5rem] gap-2">
          <Field label={t("price")} hint={t("priceHint")}>
            {(f) => <Input {...f} inputMode="decimal" placeholder="—" dir="ltr" value={price} onChange={(e) => setPrice(e.target.value)} />}
          </Field>
          <Field label={t("currency")}>
            {(f) => (
              <Select {...f} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {BILLING_CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </div>
      {custom && (
        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="mb-1 text-sm font-medium">{t("quotas", { unlimited })}</legend>
          {QUOTAS.map((k) => (
            <Field key={k} label={t(`quota.${k}`)}>
              {(f) => <Input {...f} value={limits[k]} placeholder={unlimited} onChange={(e) => setLimits({ ...limits, [k]: e.target.value })} />}
            </Field>
          ))}
        </fieldset>
      )}
      <div className="flex flex-wrap gap-2">
        <ConfirmDialog
          trigger={<Button className="justify-self-start">{t("pro.button")}</Button>}
          title={t("pro.title")}
          consequence={t("pro.consequence")}
          confirmLabel={t("pro.confirm")}
          onConfirm={activatePro}
        />
        <ConfirmDialog
          trigger={<Button variant="secondary" className="justify-self-start">{t("advanced.button")}</Button>}
          title={t("advanced.title")}
          consequence={stripeRunning ? `${t("advanced.consequence")} ${t("advanced.stripeWarning")}` : t("advanced.consequence")}
          confirmLabel={t("advanced.confirm")}
          onConfirm={submit}
        />
      </div>
    </div>
  );
}
