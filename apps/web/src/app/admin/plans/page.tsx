"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { PageHeader, Panel } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";

interface Plan {
  id: string;
  code: string;
  name: string;
  description: string;
  priceMonthlyCents: number;
  currency: string;
  priceYearlyCents: number;
  stripePriceMonthlyId: string | null;
  stripePriceYearlyId: string | null;
  trialDays: number;
  features: { api: boolean; widget: boolean; integrations: boolean; exports: boolean };
  limits: { customers: number | null; establishments: number | null; staff: number | null; programs: number | null };
  active: boolean;
  _count: { subscriptions: number };
}

const LIMITS = { customers: "Clients", establishments: "Établissements", staff: "Collaborateurs", programs: "Programmes" } as const;
const FEATURES = { api: "API", widget: "Widget", integrations: "Boutique en ligne", exports: "Exports" } as const;

function PlanEditor({ plan }: { plan: Plan }) {
  const qc = useQueryClient();
  const [p, setP] = useState(plan);
  const [busy, setBusy] = useState(false);
  const num = (v: string) => (v === "" ? null : Number(v));
  return (
    <Panel className="grid gap-4 p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-xl font-semibold">{plan.name}</h2>
        <span className="text-sm text-ink-3">{plan._count.subscriptions} abonnements</span>
      </div>
      <Field label="Nom">{(f) => <Input {...f} value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />}</Field>
      <Field label="Description">{(f) => <Input {...f} value={p.description} onChange={(e) => setP({ ...p, description: e.target.value })} />}</Field>
      <p className="text-sm text-ink-2">Nouvelles souscriptions annuelles · {p.currency}. Les tarifs mensuels existants sont conservés pour l’historique.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Annuel (centimes)">{(f) => <Input {...f} type="number" value={p.priceYearlyCents} onChange={(e) => setP({ ...p, priceYearlyCents: Number(e.target.value) })} />}</Field>
        <Field label="Prix Stripe annuel">{(f) => <Input {...f} value={p.stripePriceYearlyId ?? ""} onChange={(e) => setP({ ...p, stripePriceYearlyId: e.target.value || null })} />}</Field>
      </div>
      <Field label="Jours d’essai">{(f) => <Input {...f} type="number" value={p.trialDays} onChange={(e) => setP({ ...p, trialDays: Number(e.target.value) })} />}</Field>
      <fieldset className="grid grid-cols-2 gap-3">
        <legend className="mb-2 text-sm font-medium">Quotas (vide = illimité)</legend>
        {(Object.keys(LIMITS) as (keyof typeof LIMITS)[]).map((k) => (
          <Field key={k} label={LIMITS[k]}>{(f) => <Input {...f} type="number" value={p.limits[k] ?? ""} onChange={(e) => setP({ ...p, limits: { ...p.limits, [k]: num(e.target.value) } })} />}</Field>
        ))}
      </fieldset>
      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="mb-2 text-sm font-medium">Fonctions incluses</legend>
        {(Object.keys(FEATURES) as (keyof typeof FEATURES)[]).map((k) => (
          <Checkbox key={k} label={FEATURES[k]} checked={p.features[k]} onChange={(e) => setP({ ...p, features: { ...p.features, [k]: e.target.checked } })} />
        ))}
      </fieldset>
      <Checkbox label="Offre proposée à la vente" checked={p.active} onChange={(e) => setP({ ...p, active: e.target.checked })} />
      <Button
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const { id: _id, code: _c, _count: _n, ...body } = p;
            await api.patch(`/admin/plans/${plan.id}`, body);
            qc.invalidateQueries({ queryKey: ["admin-plans"] });
            toast.success("Offre enregistrée");
          } catch (e) {
            toast.error(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        Enregistrer {plan.name}
      </Button>
    </Panel>
  );
}

export default function AdminPlans() {
  const { data = [] } = useQuery({ queryKey: ["admin-plans"], queryFn: () => api.get<Plan[]>("/admin/plans") });
  return (
    <>
      <PageHeader title="Offres" description="Prix, quotas et fonctions. Les changements s’appliquent immédiatement au site et aux droits des entreprises." />
      <div className="grid gap-5 lg:grid-cols-3">{data.map((p) => <PlanEditor key={p.id} plan={p} />)}</div>
    </>
  );
}
