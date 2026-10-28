"use client";

import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, DialogContent, DialogRoot } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { Badge, ErrorNote, PageHeader, Panel, Skeleton } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { formatDate, formatNumber } from "@/lib/utils";

interface Detail {
  id: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "SUSPENDED";
  suspendedReason: string | null;
  createdAt: string;
  subscription: { status: string; provider: string; trialEndsAt: string | null; plan: { code: string; name: string } } | null;
  memberships: { id: string; user: { email: string; name: string }; role: { key: string } }[];
  integrations: { id: string; name: string; provider: string; lastSyncAt: string | null; lastError: string | null }[];
  _count: { customers: number; accounts: number; transactions: number; programs: number; establishments: number };
  audit: { id: string; action: string; createdAt: string; metadata: unknown }[];
}

export default function AdminTenant() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin-tenant", id], queryFn: () => api.get<Detail>(`/admin/tenants/${id}`) });
  const [reason, setReason] = useState("");
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportReason, setSupportReason] = useState("");
  const [supportError, setSupportError] = useState<string | null>(null);
  const [plan, setPlan] = useState("business");
  const [planStatus, setPlanStatus] = useState<"ACTIVE" | "TRIALING" | "CANCELED">("ACTIVE");
  if (!data) return <Skeleton className="h-96" />;
  const suspended = data.status === "SUSPENDED";

  return (
    <>
      <PageHeader
        title={data.name}
        description={`${data.slug} · créée le ${formatDate(data.createdAt)}`}
        actions={
          <>
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
          </>
        }
      />
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
            {data.subscription ? `${data.subscription.plan.name}, ${data.subscription.status.toLowerCase()} (${data.subscription.provider.toLowerCase()})` : "Aucun"}
            {data.subscription?.trialEndsAt && `, essai jusqu’au ${formatDate(data.subscription.trialEndsAt)}`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Select aria-label="Offre" className="w-auto" value={plan} onChange={(e) => setPlan(e.target.value)}>
              <option value="starter">Starter</option>
              <option value="business">Business</option>
              <option value="premium">Premium</option>
            </Select>
            <Select aria-label="Statut" className="w-auto" value={planStatus} onChange={(e) => setPlanStatus(e.target.value as typeof planStatus)}>
              <option value="ACTIVE">Actif (manuel)</option>
              <option value="TRIALING">Essai</option>
              <option value="CANCELED">Résilié</option>
            </Select>
            <ConfirmDialog
              trigger={<Button variant="secondary">Appliquer</Button>}
              title="Modifier l’abonnement manuellement ?"
              consequence="L’abonnement est remplacé sans passer par Stripe. Utile pour un partenaire ou une période offerte."
              confirmLabel="Appliquer"
              onConfirm={async () => {
                await api.post(`/admin/tenants/${id}/subscription`, { planCode: plan, status: planStatus });
                qc.invalidateQueries({ queryKey: ["admin-tenant", id] });
              }}
            />
          </div>
        </Panel>
        <Panel className="p-5">
          <h2 className="mb-3 font-display text-lg font-semibold">Équipe</h2>
          <ul className="grid gap-2 text-sm">
            {data.memberships.map((m) => (
              <li key={m.id} className="flex justify-between gap-3"><span>{m.user.name} <span className="text-ink-3">{m.user.email}</span></span><Badge>{m.role.key}</Badge></li>
            ))}
          </ul>
        </Panel>
        <Panel className="p-5">
          <h2 className="mb-3 font-display text-lg font-semibold">Journal d’audit</h2>
          <ul className="grid max-h-80 gap-1.5 overflow-y-auto text-sm">
            {data.audit.map((a) => (
              <li key={a.id} className="flex justify-between gap-3"><code>{a.action}</code><span className="shrink-0 text-ink-3">{formatDate(a.createdAt, true)}</span></li>
            ))}
          </ul>
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
