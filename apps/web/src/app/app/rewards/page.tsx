"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { rewardValueLabel, type RewardKind } from "@fove/shared";
import { Gift, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useCan } from "@/components/app/me-context";
import type { Program } from "@/components/app/types";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, DialogContent, DialogRoot } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Badge, EmptyState, ErrorNote, PageHeader, Panel, Skeleton } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { formatDate, formatNumber, unitLabel } from "@/lib/utils";

interface Reward {
  id: string;
  programId: string;
  name: string;
  description: string;
  conditions: string;
  kind: RewardKind;
  value: string | null;
  cost: number;
  stock: number | null;
  availableFrom: string | null;
  availableUntil: string | null;
  active: boolean;
  _count: { redemptions: number };
}

interface Redemption {
  id: string;
  rewardName: string;
  cost: number;
  status: "COMPLETED" | "CANCELLED";
  createdAt: string;
  account: { cardNumber: string; customer: { firstName: string; lastName: string } };
}

function RewardForm({ reward, programs, onDone }: { reward?: Reward; programs: Program[]; onDone: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    programId: reward?.programId ?? programs[0]?.id ?? "",
    name: reward?.name ?? "",
    description: reward?.description ?? "",
    conditions: reward?.conditions ?? "",
    kind: reward?.kind ?? "GIFT",
    value: reward?.value ?? "",
    cost: String(reward?.cost ?? ""),
    stock: reward?.stock === null || reward?.stock === undefined ? "" : String(reward.stock),
    availableFrom: reward?.availableFrom?.slice(0, 10) ?? "",
    availableUntil: reward?.availableUntil?.slice(0, 10) ?? "",
    active: reward?.active ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mode = programs.find((p) => p.id === f.programId)?.mode ?? "POINTS";

  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const body = {
          name: f.name,
          description: f.description,
          conditions: f.conditions,
          kind: f.kind,
          value: f.kind === "GIFT" ? null : f.value.replace(",", "."),
          cost: Number(f.cost),
          stock: f.stock === "" ? null : Number(f.stock),
          availableFrom: f.availableFrom ? new Date(f.availableFrom).toISOString() : null,
          availableUntil: f.availableUntil ? new Date(`${f.availableUntil}T23:59:59`).toISOString() : null,
          active: f.active,
        };
        try {
          if (reward) await api.patch(`/app/rewards/${reward.id}`, body);
          else await api.post("/app/rewards", { ...body, programId: f.programId });
          toast.success(reward ? "Récompense mise à jour" : "Récompense créée");
          qc.invalidateQueries({ queryKey: ["rewards"] });
          qc.invalidateQueries({ queryKey: ["account"] });
          onDone();
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      {error && <ErrorNote>{error}</ErrorNote>}
      {!reward && (
        <Field label="Programme">
          {(p) => (
            <Select {...p} value={f.programId} onChange={(e) => setF({ ...f, programId: e.target.value })}>
              {programs.map((pr) => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
            </Select>
          )}
        </Field>
      )}
      <Field label="Nom">{(p) => <Input {...p} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field>
      <Field label="Type de récompense">
        {(p) => <Select {...p} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as RewardKind, value: "" })}>
          <option value="GIFT">Cadeau ou service offert</option>
          <option value="PERCENTAGE">Réduction en pourcentage</option>
          <option value="FIXED">Réduction d’un montant fixe</option>
        </Select>}
      </Field>
      {f.kind !== "GIFT" && <Field label={f.kind === "PERCENTAGE" ? "Réduction (%)" : `Montant de la réduction (${programs.find((p) => p.id === f.programId)?.currency ?? ""})`} hint="Appliquée sur le montant de l’achat, sans dépasser son total. Les utilisations passées restent inchangées.">
        {(p) => <Input {...p} inputMode="decimal" required value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />}
      </Field>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`Coût (${unitLabel(mode)})`}>{(p) => <Input {...p} type="number" min={1} value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} />}</Field>
        <Field label="Stock (vide = illimité)">{(p) => <Input {...p} type="number" min={0} value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })} />}</Field>
      </div>
      <Field label="Description">{(p) => <Textarea {...p} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />}</Field>
      <Field label="Conditions">{(p) => <Input {...p} value={f.conditions} onChange={(e) => setF({ ...f, conditions: e.target.value })} />}</Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Disponible à partir du">{(p) => <Input {...p} type="date" value={f.availableFrom} onChange={(e) => setF({ ...f, availableFrom: e.target.value })} />}</Field>
        <Field label="Jusqu’au">{(p) => <Input {...p} type="date" value={f.availableUntil} onChange={(e) => setF({ ...f, availableUntil: e.target.value })} />}</Field>
      </div>
      <Checkbox checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} label="Récompense active" />
      <Button type="submit" loading={busy} disabled={f.name.trim().length < 2 || !f.cost}>{reward ? "Enregistrer" : "Créer la récompense"}</Button>
    </form>
  );
}

export default function RewardsPage() {
  const canWrite = useCan("rewards.write");
  const canCancel = useCan("redemptions.cancel");
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Reward | "new" | null>(null);
  const { data: programs = [] } = useQuery({ queryKey: ["programs"], queryFn: () => api.get<Program[]>("/app/programs") });
  const { data: rewards, isLoading } = useQuery({ queryKey: ["rewards"], queryFn: () => api.get<Reward[]>("/app/rewards") });
  const { data: redemptions } = useQuery({ queryKey: ["redemptions"], queryFn: () => api.get<{ data: Redemption[] }>("/app/redemptions?limit=20") });
  const programOf = (id: string) => programs.find((p) => p.id === id);

  return (
    <>
      <PageHeader title="Récompenses" description="Ce que vos clients obtiennent avec leurs points ou tampons." actions={canWrite && programs.length > 0 && <Button onClick={() => setEditing("new")}><Plus /> Nouvelle récompense</Button>} />
      {isLoading ? (
        <Skeleton className="h-40" />
      ) : !rewards?.length ? (
        <EmptyState icon={<Gift />} title="Aucune récompense" action={canWrite && programs.length > 0 ? <Button onClick={() => setEditing("new")}>Créer une récompense</Button> : undefined}>
          Sans récompense, vos clients accumulent sans objectif. Commencez par une seule, simple.
        </EmptyState>
      ) : (
        <Panel className="overflow-hidden">
          <ul className="divide-y divide-line">
            {rewards.map((r) => {
              const program = programOf(r.programId);
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {r.name}
                      {!r.active && <Badge>Inactive</Badge>}
                      {r.stock === 0 && <Badge tone="danger">Épuisée</Badge>}
                    </p>
                    <p className="text-sm text-ink-3">
                      {rewardValueLabel(r, program?.currency ?? "CDF")} · {program?.name} · {formatNumber(r._count.redemptions)} utilisations
                      {r.stock !== null && ` · ${r.stock} en stock`}
                      {r.availableUntil && ` · jusqu’au ${formatDate(r.availableUntil)}`}
                    </p>
                  </div>
                  <span className="rounded-full bg-stamp-soft px-3 py-1 font-display font-semibold tabular text-stamp-ink dark:text-stamp">
                    {formatNumber(r.cost)} {unitLabel(program?.mode ?? "POINTS", r.cost)}
                  </span>
                  {canWrite && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>Modifier</Button>
                      <ConfirmDialog
                        trigger={<Button size="sm" variant="ghost" className="text-danger">Retirer</Button>}
                        title={`Retirer « ${r.name} » du catalogue ?`}
                        consequence="Elle ne sera plus proposée aux clients. Son historique d’utilisation est conservé."
                        confirmLabel="Retirer la récompense"
                        destructive
                        onConfirm={async () => {
                          await api.post(`/app/rewards/${r.id}/archive`);
                          qc.invalidateQueries({ queryKey: ["rewards"] });
                          toast.success("Récompense retirée");
                        }}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      {redemptions && redemptions.data.length > 0 && (
        <section className="mt-10" aria-labelledby="usages">
          <h2 id="usages" className="mb-3 font-display text-xl font-semibold">Dernières utilisations</h2>
          <Panel className="overflow-hidden">
            <ul className="divide-y divide-line">
              {redemptions.data.map((u) => (
                <li key={u.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{u.rewardName} <span className="font-normal text-ink-2">· {u.account.customer.firstName} {u.account.customer.lastName}</span></p>
                    <p className="text-sm text-ink-3">{formatDate(u.createdAt, true)}</p>
                  </div>
                  {u.status === "CANCELLED" ? (
                    <Badge>Annulée</Badge>
                  ) : (
                    canCancel && (
                      <ConfirmDialog
                        trigger={<Button size="sm" variant="ghost">Annuler</Button>}
                        title="Annuler cette utilisation ?"
                        consequence={`${formatNumber(u.cost)} seront recrédités sur la carte du client et la récompense remise en stock.`}
                        confirmLabel="Annuler l’utilisation"
                        destructive
                        onConfirm={async () => {
                          try {
                            await api.post(`/app/redemptions/${u.id}/cancel`, { reason: "Annulation depuis le tableau de bord" });
                            qc.invalidateQueries();
                            toast.success("Utilisation annulée");
                          } catch (e) {
                            toast.error(errorMessage(e));
                          }
                        }}
                      />
                    )
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        </section>
      )}

      <DialogRoot open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        {editing !== null && (
          <DialogContent title={editing === "new" ? "Nouvelle récompense" : "Modifier la récompense"}>
            <RewardForm reward={editing === "new" ? undefined : editing} programs={programs} onDone={() => setEditing(null)} />
          </DialogContent>
        )}
      </DialogRoot>
    </>
  );
}
