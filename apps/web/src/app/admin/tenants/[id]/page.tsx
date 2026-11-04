"use client";

import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, DialogContent, DialogRoot } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { ArrowLeft, ExternalLink, Globe, Palette, Smartphone, Users } from "lucide-react";
import Link from "next/link";
import { Badge, ErrorNote, Panel, Skeleton } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { formatDate, formatNumber, formatPrice } from "@/lib/utils";

type QuotaKey = "customers" | "establishments" | "staff" | "programs";
const QUOTAS: Record<QuotaKey, string> = { customers: "Clients", establishments: "Établissements", staff: "Collaborateurs", programs: "Programmes" };

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
    plan: { code: string; name: string };
  } | null;
  memberships: { id: string; user: { email: string; name: string }; role: { key: string } }[];
  integrations: { id: string; name: string; provider: string; lastSyncAt: string | null; lastError: string | null }[];
  _count: { customers: number; accounts: number; transactions: number; programs: number; establishments: number };
  audit: { id: string; action: string; createdAt: string; metadata: unknown }[];
  customers?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    tags: string[];
    notes: string | null;
    totalVisits: number;
    totalSpend: string | number;
    lastVisitAt: string | null;
    createdAt: string;
    segment?: { segment: string; label: string; color: string };
    accounts: {
      id: string;
      cardNumber: string;
      balance: number;
      status: string;
      accessToken: string | null;
      program: { name: string; mode: "POINTS" | "STAMPS"; stampsTarget: number };
    }[];
  }[];
}

const SUB_STATUS: Record<string, string> = { TRIALING: "essai", ACTIVE: "actif", PAST_DUE: "paiement en échec", CANCELED: "résilié", INCOMPLETE: "en attente" };
const PROVIDER: Record<string, string> = { STRIPE: "Stripe", MOCK: "simulé", MANUAL: "manuel" };
const ROLE: Record<string, string> = { OWNER: "Propriétaire", MANAGER: "Manager", CASHIER: "Caissier", VIEWER: "Lecteur" };

export default function AdminTenant() {
  const { id } = useParams<{ id: string }>();
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
        <ArrowLeft className="size-4" aria-hidden /> Entreprises
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
              <span className="font-mono text-xs text-ink-3">{data.slug}</span>
              <span>·</span>
              <span>créée le {formatDate(data.createdAt)}</span>
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
                Page publique <ExternalLink className="size-3" aria-hidden />
              </Link>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => setSupportOpen(true)}>Accès support</Button>
          <ConfirmDialog
            trigger={<Button variant={suspended ? "primary" : "danger"}>{suspended ? "Réactiver" : "Suspendre"}</Button>}
            title={suspended ? "Réactiver cette entreprise ?" : "Suspendre cette entreprise ?"}
            consequence={suspended ? "Son équipe retrouve l’accès immédiatement." : "Son équipe, ses clés API et ses pages publiques sont bloquées. Aucune donnée n’est supprimée."}
            confirmLabel={suspended ? "Réactiver" : "Suspendre"}
            destructive={!suspended}
            onConfirm={async () => {
              try {
                await api.post(`/admin/tenants/${id}/status`, { status: suspended ? "ACTIVE" : "SUSPENDED", reason: reason || (suspended ? "Réactivation" : "Suspension administrative") });
                qc.invalidateQueries({ queryKey: ["admin-tenant", id] });
              } catch (e) {
                toast.error(errorMessage(e));
              }
            }}
          >
            <Field label="Motif (journalisé)">{(p) => <Input {...p} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
          </ConfirmDialog>
        </div>
      </div>
      {suspended && <p className="mb-4"><Badge tone="danger">Suspendue : {data.suspendedReason}</Badge></p>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel className="p-5">
          <h2 className="mb-3 font-display text-lg font-semibold">Activité</h2>
          <dl className="grid grid-cols-3 gap-4 text-sm">
            {Object.entries({ Clients: data._count.customers, Cartes: data._count.accounts, Opérations: data._count.transactions, Programmes: data._count.programs, Établissements: data._count.establishments }).map(([k, v]) => (
              <div key={k}><dt className="text-ink-2">{k}</dt><dd className="font-display text-xl font-semibold tabular">{formatNumber(v)}</dd></div>
            ))}
          </dl>
        </Panel>
        <Panel className="grid gap-3 p-5">
          <h2 className="font-display text-lg font-semibold">Abonnement</h2>
          <p className="text-sm text-ink-2">
            {data.subscription
              ? `${data.subscription.plan.name} · ${SUB_STATUS[data.subscription.status] ?? data.subscription.status} · ${PROVIDER[data.subscription.provider] ?? data.subscription.provider}`
              : "Aucun abonnement"}
            {data.subscription?.trialEndsAt && `, essai jusqu’au ${formatDate(data.subscription.trialEndsAt)}`}
            {data.subscription?.currentPeriodEnd && `, jusqu’au ${formatDate(data.subscription.currentPeriodEnd)}`}
            {data.subscription?.contractPriceYearlyCents ? `, contrat ${formatPrice(data.subscription.contractPriceYearlyCents, "USD")}/an` : ""}
          </p>
          <SubscriptionForm tenantId={id} current={data.subscription} />
        </Panel>
        <Panel className="p-5">
          <h2 className="mb-3 font-display text-lg font-semibold">Équipe</h2>
          {data.memberships.length === 0 ? (
            <p className="text-sm text-ink-3">Aucun collaborateur pour l’instant.</p>
          ) : (
            <ul className="grid gap-2.5 text-sm">
              {data.memberships.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{m.user.name}</span>
                    <span className="block truncate text-ink-3">{m.user.email}</span>
                  </span>
                  <Badge>{ROLE[m.role.key] ?? m.role.key}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel className="p-5">
          <h2 className="mb-3 font-display text-lg font-semibold flex items-center gap-2">
            <Palette className="size-4 text-cobalt" />
            Identité et Marque
          </h2>
          <div className="grid gap-3 text-sm">
            <div className="flex items-center justify-between gap-3 border-b border-line pb-2.5">
              <span className="text-ink-2">Logo officiel</span>
              {data.settings?.logoUrl ? (
                <div className="flex items-center gap-2">
                  <img src={data.settings.logoUrl} alt="Logo" className="size-8 rounded-lg border border-line bg-surface object-cover" />
                  <a href={data.settings.logoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-cobalt hover:underline">
                    Ouvrir <ExternalLink className="size-3" />
                  </a>
                </div>
              ) : (
                <span className="text-xs text-ink-3">Aucun logo téléversé</span>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-line pb-2.5">
              <span className="text-ink-2">Couleur principale</span>
              <span className="inline-flex items-center gap-1.5 font-mono text-xs">
                <span className="size-3.5 rounded-full border border-black/10" style={{ background: data.settings?.primaryColor ?? "#1F4FFF" }} />
                {data.settings?.primaryColor ?? "#1F4FFF"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-line pb-2.5">
              <span className="text-ink-2">Pays et Devise</span>
              <span className="font-medium">{data.settings?.country ?? "CD"} · {data.settings?.currency ?? "CDF"}</span>
            </div>
            {data.settings?.contactEmail && (
              <div className="flex items-center justify-between gap-3 border-b border-line pb-2.5">
                <span className="text-ink-2">Email contact</span>
                <span className="truncate text-xs font-mono">{data.settings.contactEmail}</span>
              </div>
            )}
            {data.settings?.instagramHandle && (
              <div className="flex items-center justify-between gap-3 border-b border-line pb-2.5">
                <span className="text-ink-2">Instagram</span>
                <span className="text-xs font-medium">@{data.settings.instagramHandle.replace(/^@/, "")}</span>
              </div>
            )}
            {data.settings?.walletBannerUrl && (
              <div>
                <span className="block mb-1.5 text-xs text-ink-2">Bannière Wallet personnalisée</span>
                <img src={data.settings.walletBannerUrl} alt="Bannière Wallet" className="aspect-[375/144] w-full rounded-lg border border-line object-cover" />
              </div>
            )}
          </div>
        </Panel>
        <Panel className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-semibold flex items-center gap-2">
              <Users className="size-4 text-cobalt" />
              Clients et cartes ({data.customers?.length ?? 0})
            </h2>
          </div>

          {!data.customers || data.customers.length === 0 ? (
            <p className="text-sm text-ink-3 py-4 text-center">Aucun client inscrit pour le moment.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line text-ink-3">
                  <tr>
                    <th scope="col" className="pb-2 font-medium">Client</th>
                    <th scope="col" className="pb-2 font-medium">Segment</th>
                    <th scope="col" className="pb-2 font-medium">Carte et solde</th>
                    <th scope="col" className="pb-2 font-medium">Passages</th>
                    <th scope="col" className="pb-2 font-medium">Dernière visite</th>
                    <th scope="col" className="pb-2 font-medium text-right"><span className="sr-only">Carte du client</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.customers.map((c) => {
                    const acc = c.accounts[0];
                    const cardUrl = acc?.accessToken ? `/card/${acc.accessToken}` : null;
                    return (
                      <tr key={c.id} className="hover:bg-surface-2 transition-colors">
                        <td className="py-3">
                          <span className="font-semibold text-ink block">{c.firstName} {c.lastName}</span>
                          <span className="text-xs text-ink-3">{c.phone ?? c.email ?? "—"}</span>
                          {c.tags.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {c.tags.map((t) => (
                                <span key={t} className="rounded bg-surface-3 px-1.5 py-0.5 text-[0.68rem] text-ink-2">#{t}</span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="py-3">
                          {c.segment ? <Badge tone={c.segment.segment === "VIP" ? "mint" : c.segment.segment === "AT_RISK" ? "stamp" : "cobalt"}>{c.segment.label}</Badge> : <Badge tone="neutral">Standard</Badge>}
                        </td>
                        <td className="py-3">
                          {acc ? (
                            <div>
                              <span className="whitespace-nowrap text-sm font-medium tabular tracking-wide text-ink">{acc.cardNumber}</span>
                              <span className="block text-xs font-semibold text-cobalt">{acc.balance} {acc.program.mode === "POINTS" ? "points" : "tampons"}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-ink-3">—</span>
                          )}
                        </td>
                        <td className="py-3 text-xs text-ink">{c.totalVisits} passage{c.totalVisits > 1 ? "s" : ""}</td>
                        <td className="py-3 text-xs text-ink-3">{c.lastVisitAt ? formatDate(c.lastVisitAt) : "N/A"}</td>
                        <td className="py-3 text-right">
                          {cardUrl ? (
                            <a
                              href={cardUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink shadow-xs transition-colors hover:border-cobalt hover:text-cobalt"
                            >
                              <Smartphone className="size-3.5 text-cobalt" aria-hidden />
                              <span>Voir la carte</span>
                            </a>
                          ) : (
                            <span className="text-xs text-ink-3">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel className="p-5">
          <h2 className="mb-3 font-display text-lg font-semibold">Journal d’audit</h2>
          {data.audit.length === 0 ? (
            <p className="text-sm text-ink-3">Aucune action enregistrée.</p>
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
        <DialogContent title="Ouvrir un accès support" description="Lecture seule, 30 minutes, motif obligatoire. L’accès est inscrit dans le journal de l’entreprise.">
          <form
            className="grid gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setSupportError(null);
              try {
                await api.post(`/admin/tenants/${id}/support`, { reason: supportReason, minutes: 30 });
                window.location.assign("/app");
              } catch (err) {
                setSupportError(errorMessage(err));
              }
            }}
          >
            {supportError && <ErrorNote>{supportError}</ErrorNote>}
            <Field label="Motif" hint="Ex. ticket n°, demande du commerçant.">{(p) => <Input {...p} value={supportReason} onChange={(e) => setSupportReason(e.target.value)} />}</Field>
            <Button type="submit" disabled={supportReason.trim().length < 10}>Ouvrir l’accès en lecture seule</Button>
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
function SubscriptionForm({ tenantId, current }: { tenantId: string; current: Detail["subscription"] }) {
  const qc = useQueryClient();
  const { data: plans = [] } = useQuery({ queryKey: ["admin-plans"], queryFn: () => api.get<{ code: string; name: string; kind: string }[]>("/admin/plans") });
  const [plan, setPlan] = useState(current?.plan.code ?? "free");
  const [status, setStatus] = useState<"ACTIVE" | "TRIALING" | "CANCELED">("ACTIVE");
  const [end, setEnd] = useState(current?.currentPeriodEnd?.slice(0, 10) ?? "");
  const [price, setPrice] = useState(current?.contractPriceYearlyCents ? String(current.contractPriceYearlyCents / 100) : "");
  const [limits, setLimits] = useState<Record<QuotaKey, string>>(() => {
    const o = current?.limitsOverride ?? {};
    const show = (k: QuotaKey) => (k in o ? (o[k] === null ? "illimité" : String(o[k])) : "");
    return { customers: show("customers"), establishments: show("establishments"), staff: show("staff"), programs: show("programs") };
  });
  const custom = plans.find((p) => p.code === plan)?.kind === "CUSTOM";
  // Abonnement Stripe en cours : il est arrêté au moment où le contrat manuel le remplace.
  const stripeRunning = current?.provider === "STRIPE" && current.status !== "CANCELED";

  const submit = async () => {
    const limitsOverride: Partial<Record<QuotaKey, number | null>> = {};
    for (const [k, v] of Object.entries(limits) as [QuotaKey, string][]) {
      const t = v.trim().toLowerCase();
      if (t === "") continue;
      limitsOverride[k] = t === "illimité" || t === "illimite" ? null : Number(t);
    }
    const yearly = Number(price.replace(",", "."));
    await api.post(`/admin/tenants/${tenantId}/subscription`, {
      planCode: plan,
      status,
      currentPeriodEnd: end ? new Date(`${end}T23:59:59`).toISOString() : null,
      limitsOverride: Object.keys(limitsOverride).length ? limitsOverride : null,
      contractPriceYearlyCents: price.trim() && Number.isFinite(yearly) ? Math.round(yearly * 100) : null,
    });
    qc.invalidateQueries({ queryKey: ["admin-tenant", tenantId] });
    toast.success("Abonnement mis à jour");
  };

  return (
    <div className="grid gap-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Select aria-label="Offre" value={plan} onChange={(e) => setPlan(e.target.value)}>
          {plans.map((p) => (
            <option key={p.code} value={p.code}>{p.name}</option>
          ))}
        </Select>
        <Select aria-label="Statut" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="ACTIVE">Actif (manuel)</option>
          <option value="TRIALING">Essai</option>
          <option value="CANCELED">Résilié</option>
        </Select>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Fin du contrat" hint="Vide = sans échéance. À cette date, l’entreprise repasse sur le Gratuit.">
          {(f) => <Input {...f} type="date" value={end} onChange={(e) => setEnd(e.target.value)} />}
        </Field>
        <Field label="Prix annuel du contrat (USD)" hint="Facturé hors Stripe, compté dans le revenu.">
          {(f) => <Input {...f} inputMode="decimal" placeholder="—" value={price} onChange={(e) => setPrice(e.target.value)} />}
        </Field>
      </div>
      {custom && (
        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="mb-1 text-sm font-medium">Quotas négociés (vide = ceux de l’offre, « illimité » accepté)</legend>
          {(Object.keys(QUOTAS) as QuotaKey[]).map((k) => (
            <Field key={k} label={QUOTAS[k]}>
              {(f) => <Input {...f} value={limits[k]} placeholder="illimité" onChange={(e) => setLimits({ ...limits, [k]: e.target.value })} />}
            </Field>
          ))}
        </fieldset>
      )}
      <ConfirmDialog
        trigger={<Button variant="secondary" className="justify-self-start">Appliquer</Button>}
        title="Modifier l’abonnement manuellement ?"
        consequence={[
          "L’abonnement est remplacé sans passer par Stripe : période offerte, essai ou contrat sur-mesure. Les quotas et le prix non renseignés sont retirés.",
          stripeRunning ? " L’abonnement Stripe en cours sera résilié immédiatement, sans remboursement automatique : remboursez la période restante depuis Stripe si besoin." : "",
        ].join("")}

        confirmLabel="Appliquer"
        onConfirm={submit}
      />
    </div>
  );
}
