"use client";

import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { useCan, useMe } from "@/components/app/me-context";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Badge, PageHeader, Panel, Skeleton } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { cn, formatDate, formatNumber, formatPrice } from "@/lib/utils";

interface Plan {
  id: string;
  code: string;
  name: string;
  description: string;
  currency: string;
  priceMonthlyCents: number;
  priceYearlyCents: number;
}
interface Billing {
  mode: "stripe" | "mock" | "unavailable";
  subscription: { status: string; interval: "MONTH" | "YEAR"; trialEndsAt: string | null; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean; provider: string; plan: Plan } | null;
  plans: Plan[];
  usage: Record<string, number>;
  limits: Record<string, number | null>;
}

const STATUS: Record<string, { label: string; tone: "mint" | "stamp" | "danger" | "neutral" }> = {
  TRIALING: { label: "Essai gratuit", tone: "stamp" },
  ACTIVE: { label: "Actif", tone: "mint" },
  PAST_DUE: { label: "Paiement en échec", tone: "danger" },
  CANCELED: { label: "Résilié", tone: "neutral" },
  INCOMPLETE: { label: "En attente de paiement", tone: "neutral" },
};
const USAGE_LABEL: Record<string, string> = { customers: "Clients", establishments: "Établissements", staff: "Collaborateurs", programs: "Programmes" };

function BillingView() {
  const params = useSearchParams();
  const me = useMe();
  const canWrite = useCan("billing.write");
  const qc = useQueryClient();
  const interval = "YEAR" as const;
  const [pending, setPending] = useState<string | null>(null);
  const { data } = useQuery({ queryKey: ["billing"], queryFn: () => api.get<Billing>("/app/billing") });

  useEffect(() => {
    const c = params.get("checkout");
    if (c === "success" || c === "mock" || c === "updated") toast.success("Abonnement mis à jour");
    if (c === "cancelled") toast.message("Paiement annulé, rien n’a été facturé");
  }, [params]);

  if (!data) return <Skeleton className="h-96" />;
  const sub = data.subscription;
  const status = sub ? STATUS[sub.status] : null;

  const choose = async (code: string) => {
    setPending(code);
    try {
      const res = await api.post<{ url: string }>("/app/billing/checkout", { planCode: code, interval });
      if (data.mode === "stripe") window.location.assign(res.url);
      else qc.invalidateQueries({ queryKey: ["billing"] }).then(() => toast.success("Offre changée (mode simulé, aucun paiement)"));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPending(null);
    }
  };

  return (
    <>
      <PageHeader title="Abonnement" description="Changer d’offre ne supprime jamais vos cartes ni l’historique de vos clients." />
      {data.mode === "mock" && (
        <p className="mb-6 rounded-md bg-stamp-soft px-4 py-3 text-sm text-stamp-ink dark:text-stamp">
          Mode de facturation simulé : aucun paiement réel n’est effectué sur cet environnement.
        </p>
      )}
      {data.mode === "unavailable" && <p className="mb-6 rounded-md bg-surface-2 px-4 py-3 text-sm">Le paiement en ligne sera disponible prochainement. Votre essai reste accessible.</p>}
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Panel className="p-5 sm:p-6">
          {sub ? (
            <div className="grid gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-2xl font-semibold">{sub.plan.name}</h2>
                {status && <Badge tone={status.tone}>{status.label}</Badge>}
              </div>
              <p className="text-ink-2">
                {sub.status === "TRIALING" && sub.trialEndsAt && `Essai jusqu’au ${formatDate(sub.trialEndsAt)}. `}
                {sub.currentPeriodEnd && (sub.cancelAtPeriodEnd ? `Se termine le ${formatDate(sub.currentPeriodEnd)}.` : `Prochain renouvellement le ${formatDate(sub.currentPeriodEnd)}.`)}
                {sub.status === "PAST_DUE" && " Mettez à jour votre moyen de paiement pour éviter l’interruption des nouvelles inscriptions."}
              </p>
              {canWrite && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {data.mode === "stripe" && (
                    <Button
                      variant="secondary"
                      onClick={async () => {
                        try {
                          const { url } = await api.post<{ url: string }>("/app/billing/portal");
                          window.location.assign(url);
                        } catch (e) {
                          toast.error(errorMessage(e));
                        }
                      }}
                    >
                      Factures et moyen de paiement
                    </Button>
                  )}
                  {sub.status !== "CANCELED" && !sub.cancelAtPeriodEnd && sub.status !== "TRIALING" && (
                    <ConfirmDialog
                      trigger={<Button variant="ghost">Résilier</Button>}
                      title="Résilier l’abonnement ?"
                      consequence="Il reste actif jusqu’à la fin de la période payée, puis votre compte passe aux limites Essentiel. Aucune carte n’est supprimée."
                      confirmLabel="Résilier"
                      destructive
                      onConfirm={async () => {
                        await api.post("/app/billing/cancel");
                        qc.invalidateQueries({ queryKey: ["billing"] });
                        toast.success("Résiliation enregistrée");
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-ink-2">Aucun abonnement : votre compte utilise les limites Essentiel.</p>
          )}
        </Panel>
        <Panel className="p-5 sm:p-6">
          <h2 className="mb-4 font-display text-lg font-semibold">Utilisation</h2>
          <dl className="grid gap-3">
            {Object.entries(USAGE_LABEL).map(([k, label]) => {
              const used = data.usage[k] ?? 0;
              const limit = data.limits[k];
              return (
                <div key={k} className="grid gap-1">
                  <div className="flex justify-between text-sm">
                    <dt className="text-ink-2">{label}</dt>
                    <dd className="tabular">{formatNumber(used)} {limit === null ? "" : `/ ${formatNumber(limit ?? 0)}`}</dd>
                  </div>
                  {limit !== null && limit !== undefined && (
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <div className={cn("h-full rounded-full", used >= limit ? "bg-danger" : "bg-cobalt")} style={{ width: `${Math.min(100, (used / limit) * 100)}%` }} />
                    </div>
                  )}
                </div>
              );
            })}
          </dl>
        </Panel>
      </div>

      {canWrite && (
        <section className="mt-10" aria-labelledby="offres">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <h2 id="offres" className="font-display text-2xl font-semibold">Changer d’offre</h2>
            <p className="text-sm text-ink-2">Abonnement annuel, payé à l’avance en dollars US.</p>
          </div>
          {!me.user.emailVerifiedAt && <p className="mb-4 text-sm text-danger">Confirmez votre email avant de choisir une offre.</p>}
          <div className="grid gap-4 md:grid-cols-3">
            {data.plans.map((p) => {
              const current = sub?.plan.code === p.code && sub.status === "ACTIVE" && sub.interval === "YEAR";
              return (
                <Panel key={p.id} className={cn("grid gap-3 p-5", current && "ring-2 ring-cobalt")}>
                  <h3 className="font-display text-xl font-semibold">{p.name}</h3>
                  <p className="text-sm text-ink-2">{p.description}</p>
                  <p className="font-display text-3xl font-semibold tabular">
                    {formatPrice(p.priceYearlyCents, p.currency)}
                    <span className="text-base font-normal text-ink-3"> /an</span>
                  </p>
                  <Button variant={current ? "secondary" : "primary"} disabled={current || !me.user.emailVerifiedAt || data.mode === "unavailable"} loading={pending === p.code} onClick={() => choose(p.code)}>
                    {current ? "Offre actuelle" : `Passer à ${p.name}`}
                  </Button>
                </Panel>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}

export default function BillingPage() {
  return (
    <Suspense>
      <BillingView />
    </Suspense>
  );
}
