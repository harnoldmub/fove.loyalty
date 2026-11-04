"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Suspense, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PAST_DUE_GRACE_DAYS } from "@fove/shared";
import { useCan } from "@/components/app/me-context";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Badge, PageHeader, Panel, Skeleton } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { clearPlanChoice } from "@/lib/plan-choice";
import { cn, formatDate, formatNumber, formatPrice } from "@/lib/utils";

interface Plan {
  id: string;
  code: string;
  kind: "FREE" | "PAID" | "CUSTOM";
  name: string;
  description: string;
  currency: string;
  priceMonthlyCents: number;
  priceYearlyCents: number;
  limits: Record<string, number | null>;
}
interface Billing {
  mode: "stripe" | "mock" | "unavailable";
  subscription: {
    status: string;
    interval: "MONTH" | "YEAR";
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    pastDueSince: string | null;
    provider: "STRIPE" | "MOCK" | "MANUAL";
    plan: Plan;
    /** Offre inférieure choisie, appliquée au renouvellement. */
    scheduledPlan: { code: string; name: string } | null;
  } | null;
  /** Offre dont l'entreprise a réellement les droits (Gratuit après une résiliation, un impayé prolongé…). */
  currentPlan: { code: string; name: string; kind: Plan["kind"] };
  plans: Plan[];
  usage: Record<string, number>;
  limits: Record<string, number | null>;
}

const STATUS: Record<string, { label: string; tone: "mint" | "stamp" | "danger" | "neutral" }> = {
  TRIALING: { label: "Essai", tone: "stamp" },
  ACTIVE: { label: "Actif", tone: "mint" },
  PAST_DUE: { label: "Paiement en échec", tone: "danger" },
  CANCELED: { label: "Résilié", tone: "neutral" },
  INCOMPLETE: { label: "En attente de paiement", tone: "neutral" },
};
const USAGE_LABEL: Record<string, string> = { customers: "Clients", establishments: "Établissements", staff: "Collaborateurs", programs: "Programmes" };

function BillingView() {
  const params = useSearchParams();
  const router = useRouter();
  const canWrite = useCan("billing.write");
  const qc = useQueryClient();
  const interval = "YEAR" as const;
  const [pending, setPending] = useState<string | null>(null);
  // Retour de Stripe : l'offre change à réception du webhook, quelques secondes plus tard.
  const awaitingStripe = params.get("checkout") === "success";
  const { data } = useQuery({
    queryKey: ["billing"],
    queryFn: () => api.get<Billing>("/app/billing"),
    refetchInterval: (q) => (awaitingStripe && q.state.data?.subscription?.provider !== "STRIPE" && q.state.dataUpdateCount < 10 ? 3000 : false),
  });

  // Offre choisie sur la page tarifs avant l'inscription : on lance son paiement, une seule fois.
  const wanted = params.get("offre");
  const [launching, setLaunching] = useState<string | null>(null);
  const launched = useRef(false);
  useEffect(() => {
    if (!wanted || !data || launched.current) return;
    launched.current = true;
    clearPlanChoice();
    const plan = data.plans.find((p) => p.code === wanted && p.kind === "PAID");
    const sub = data.subscription;
    const alreadyPaying = sub?.provider === "STRIPE" && sub.status !== "CANCELED" && sub.plan.code === data.currentPlan.code;
    // Déjà abonné : le changement d'offre facturé au prorata passe par la confirmation de la carte.
    if (!plan || !canWrite || data.mode === "unavailable" || alreadyPaying || data.currentPlan.code === plan.code) {
      router.replace("/app/billing");
      return;
    }
    void (async () => {
      setLaunching(plan.name);
      try {
        const res = await api.post<{ url: string }>("/app/billing/checkout", { planCode: plan.code, interval: "YEAR" });
        if (data.mode === "stripe") {
          window.location.assign(res.url);
          return;
        }
        await qc.invalidateQueries({ queryKey: ["billing"] });
        toast.success(`Offre ${plan.name} activée (mode simulé, aucun paiement)`);
      } catch (e) {
        toast.error(errorMessage(e));
      }
      setLaunching(null);
      router.replace("/app/billing");
    })();
  }, [wanted, data, canWrite, qc, router]);

  useEffect(() => {
    const c = params.get("checkout");
    if (c === "success") toast.success("Paiement reçu : votre offre s’active dans quelques instants");
    if (c === "mock" || c === "updated") toast.success("Abonnement mis à jour");
    if (c === "scheduled") toast.success("Changement d’offre programmé au renouvellement");
    if (c === "cancelled") toast.message("Paiement annulé, rien n’a été facturé");
  }, [params]);

  if (!data) return <Skeleton className="h-96" />;
  if (launching) {
    return (
      <Panel className="grid place-items-center gap-2 p-10 text-center">
        <p className="font-display text-xl font-semibold">Offre {launching}</p>
        <p className="text-ink-2">Ouverture du paiement sécurisé…</p>
      </Panel>
    );
  }
  const sub = data.subscription;
  const current = data.currentPlan;
  // Abonnement terminé (résilié, impayé prolongé) : on affiche l'offre réellement appliquée.
  const subApplies = sub !== null && sub.plan.code === current.code;
  const status = subApplies && sub ? STATUS[sub.status] : null;
  const managedByFove = sub !== null && (sub.plan.kind === "CUSTOM" || sub.provider === "MANUAL") && subApplies && current.kind !== "FREE";
  const stripeSubscriber = sub?.provider === "STRIPE" && subApplies && sub.status !== "CANCELED";
  const canCancel = subApplies && sub !== null && sub.plan.kind === "PAID" && !managedByFove && ["ACTIVE", "PAST_DUE"].includes(sub.status) && !sub.cancelAtPeriodEnd;
  const canResume = subApplies && sub !== null && sub.cancelAtPeriodEnd && sub.status !== "CANCELED";
  const graceEnd = sub?.status === "PAST_DUE" && sub.pastDueSince ? new Date(new Date(sub.pastDueSince).getTime() + PAST_DUE_GRACE_DAYS * 86_400_000) : null;
  // Abonnement payé en cours : choisir une autre offre la modifie (supérieure tout de suite, inférieure au renouvellement).
  const paidRunning = subApplies && sub !== null && sub.plan.kind === "PAID" && !managedByFove && sub.status !== "CANCELED" && sub.status !== "INCOMPLETE";
  const scheduled = paidRunning ? (sub?.scheduledPlan ?? null) : null;
  const renewal = sub?.currentPeriodEnd ? formatDate(sub.currentPeriodEnd) : "la fin de la période payée";

  const refresh = () => qc.invalidateQueries({ queryKey: ["billing"] });

  /** Ce qui dépasse les quotas de l'offre visée : rien n'est supprimé, mais plus rien ne peut être ajouté. */
  const overQuota = (p: Plan) =>
    Object.entries(USAGE_LABEL)
      .filter(([k]) => p.limits[k] != null && (data.usage[k] ?? 0) > p.limits[k]!)
      .map(([k, label]) => `${label.toLowerCase()} (${formatNumber(data.usage[k] ?? 0)} pour ${formatNumber(p.limits[k]!)} inclus)`);

  const cancelScheduled = async () => {
    try {
      await api.post("/app/billing/scheduled-change/cancel");
      await refresh();
      toast.success(`Changement annulé : vous restez sur l’offre ${current.name}`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const choose = async (code: string) => {
    setPending(code);
    try {
      const res = await api.post<{ url: string; mode: string; effective?: "now" | "renewal" }>("/app/billing/checkout", { planCode: code, interval });
      const name = data.plans.find((p) => p.code === code)?.name ?? code;
      if (data.mode === "stripe" && !paidRunning) window.location.assign(res.url);
      else if (res.effective === "renewal") await refresh().then(() => toast.success(`Passage à ${name} programmé le ${renewal}`));
      else await refresh().then(() => toast.success(data.mode === "stripe" ? "Offre changée" : "Offre changée (mode simulé, aucun paiement)"));
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
      {data.mode === "unavailable" && <p className="mb-6 rounded-md bg-surface-2 px-4 py-3 text-sm">Le paiement en ligne sera disponible prochainement. Votre offre actuelle reste accessible.</p>}
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Panel className="p-5 sm:p-6">
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-2xl font-semibold">{current.name}</h2>
              {status ? <Badge tone={status.tone}>{status.label}</Badge> : <Badge tone="mint">Actif</Badge>}
            </div>
            <p className="text-ink-2">
              {sub && !subApplies && `Votre abonnement ${sub.plan.name} est terminé : votre compte utilise l’offre Gratuite. `}
              {current.kind === "FREE" && subApplies && "Gratuit, sans limite de durée. Passez à une offre supérieure quand vous avez besoin de plus de clients ou de fonctions. "}
              {subApplies && sub?.status === "TRIALING" && sub.trialEndsAt && `Essai jusqu’au ${formatDate(sub.trialEndsAt)}, puis offre Gratuite. `}
              {subApplies && sub?.currentPeriodEnd && current.kind !== "FREE" &&
                (sub.cancelAtPeriodEnd
                  ? `Résiliation demandée : l’offre se termine le ${formatDate(sub.currentPeriodEnd)}, puis votre compte passe à l’offre Gratuite. `
                  : managedByFove
                    ? `Contrat jusqu’au ${formatDate(sub.currentPeriodEnd)}. `
                    : scheduled
                      ? `Passage à l’offre ${scheduled.name} le ${formatDate(sub.currentPeriodEnd)} ; votre offre ${current.name} reste active jusque-là. `
                      : `Prochain renouvellement le ${formatDate(sub.currentPeriodEnd)}. `)}
              {graceEnd && subApplies && `Mettez à jour votre moyen de paiement avant le ${formatDate(graceEnd)} pour garder votre offre ; ensuite, votre compte passe à l’offre Gratuite.`}
              {managedByFove && "Votre abonnement est géré par l’équipe FOVE : contactez-nous pour le modifier."}
            </p>
            {canWrite && (
              <div className="mt-3 flex flex-wrap gap-2">
                {data.mode === "stripe" && sub?.provider === "STRIPE" && (
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
                {scheduled && (
                  <Button variant="secondary" onClick={cancelScheduled}>
                    Rester sur {current.name}
                  </Button>
                )}
                {canResume && (
                  <Button
                    onClick={async () => {
                      try {
                        await api.post("/app/billing/resume");
                        await refresh();
                        toast.success("Résiliation annulée : votre abonnement continue");
                      } catch (e) {
                        toast.error(errorMessage(e));
                      }
                    }}
                  >
                    Reprendre l’abonnement
                  </Button>
                )}
                {canCancel && (
                  <ConfirmDialog
                    trigger={<Button variant="ghost">Résilier</Button>}
                    title="Résilier l’abonnement ?"
                    consequence="Il reste actif jusqu’à la fin de la période payée, et vous pouvez revenir sur votre décision jusque-là. Ensuite, votre compte passe à l’offre Gratuite. Aucune carte n’est supprimée."
                    confirmLabel="Résilier"
                    destructive
                    onConfirm={async () => {
                      await api.post("/app/billing/cancel");
                      await refresh();
                      toast.success("Résiliation enregistrée");
                    }}
                  />
                )}
              </div>
            )}
          </div>
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

      {canWrite && !managedByFove && (
        <section className="mt-10" aria-labelledby="offres">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <h2 id="offres" className="font-display text-2xl font-semibold">Changer d’offre</h2>
            <p className="text-sm text-ink-2">Abonnement annuel, payé à l’avance en dollars US.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {data.plans.filter((p) => p.kind === "PAID").map((p) => {
              const isCurrent = current.code === p.code && subApplies && sub?.status !== "CANCELED";
              const isScheduled = scheduled?.code === p.code;
              const disabled = isCurrent || isScheduled || data.mode === "unavailable";
              const downgrade = paidRunning && sub !== null && p.priceYearlyCents < sub.plan.priceYearlyCents;
              const label = isCurrent ? "Offre actuelle" : isScheduled ? `Prévue le ${renewal}` : downgrade ? `Passer à ${p.name} au renouvellement` : `Passer à ${p.name}`;
              const over = downgrade ? overQuota(p) : [];
              return (
                <Panel key={p.id} className={cn("grid gap-3 p-5", isCurrent && "ring-2 ring-cobalt")}>
                  <h3 className="font-display text-xl font-semibold">{p.name}</h3>
                  <p className="text-sm text-ink-2">{p.description}</p>
                  <p className="font-display text-3xl font-semibold tabular">
                    {formatPrice(p.priceYearlyCents, p.currency)}
                    <span className="text-base font-normal text-ink-3"> /an</span>
                  </p>
                  {downgrade && !disabled ? (
                    // Offre inférieure : rien ne change avant le renouvellement, et rien n'est remboursé.
                    <ConfirmDialog
                      trigger={<Button variant="secondary" loading={pending === p.code}>{label}</Button>}
                      title={`Passer à ${p.name} au renouvellement ?`}
                      consequence={[
                        `Vous gardez l’offre ${current.name} jusqu’au ${renewal}. Ensuite, votre abonnement continue sur ${p.name} à ${formatPrice(p.priceYearlyCents, p.currency)} par an. La période en cours n’est ni remboursée ni créditée.`,
                        over.length ? ` Vous dépassez les quotas de ${p.name} : ${over.join(", ")}. Rien ne sera supprimé, mais vous ne pourrez plus en ajouter.` : "",
                        " Vous pouvez annuler ce changement jusqu’au renouvellement.",
                      ].join("")}
                      confirmLabel={`Programmer le passage à ${p.name}`}
                      onConfirm={() => choose(p.code)}
                    />
                  ) : stripeSubscriber && !disabled ? (
                    // Abonné Stripe, offre supérieure : effet immédiat et facturé au prorata, on confirme avant.
                    <ConfirmDialog
                      trigger={<Button loading={pending === p.code}>{label}</Button>}
                      title={`Passer à ${p.name} ?`}
                      consequence={`Votre offre change tout de suite. La différence au prorata jusqu’au ${renewal}, sur la base de ${formatPrice(p.priceYearlyCents, p.currency)} par an, est facturée immédiatement sur votre moyen de paiement. Si le paiement échoue, votre offre actuelle est conservée.`}
                      confirmLabel={`Passer à ${p.name}`}
                      onConfirm={() => choose(p.code)}
                    />
                  ) : (

                    <Button variant={isCurrent || isScheduled ? "secondary" : "primary"} disabled={disabled}
 loading={pending === p.code} onClick={() => choose(p.code)}>
                      {label}
                    </Button>
                  )}
                </Panel>
              );
            })}
          </div>
          <p className="mt-4 text-sm text-ink-2">
            Besoin de plus d’établissements, de clients ou d’un accompagnement ?{" "}
            <Link href="/contact?offre=sur-mesure" className="font-medium text-cobalt underline-offset-4 hover:underline">
              Découvrez l’offre Sur-mesure
            </Link>
            .
          </p>
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
