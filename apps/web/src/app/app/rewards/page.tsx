"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { RewardKind } from "@fove/shared";
import { Gift, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useCan } from "@/components/app/me-context";
import { useRewardValueLabel } from "@/components/app/use-reward-value";
import type { Program } from "@/components/app/types";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, DialogContent, DialogRoot } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Badge, EmptyState, ErrorNote, PageHeader, Panel, Skeleton } from "@/components/ui/misc";
import { api, useErrorMessage } from "@/lib/api";
import { useUnitLabel } from "@/lib/labels";
import { formatDate, formatNumber } from "@/lib/utils";

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
  const toErrorMessage = useErrorMessage();
  const t = useTranslations("app.rewards.form");
  const unitLabel = useUnitLabel();
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
          toast.success(reward ? t("updated") : t("created"));
          qc.invalidateQueries({ queryKey: ["rewards"] });
          qc.invalidateQueries({ queryKey: ["account"] });
          onDone();
        } catch (err) {
          setError(toErrorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      {error && <ErrorNote>{error}</ErrorNote>}
      {!reward && (
        <Field label={t("program")}>
          {(p) => (
            <Select {...p} value={f.programId} onChange={(e) => setF({ ...f, programId: e.target.value })}>
              {programs.map((pr) => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
            </Select>
          )}
        </Field>
      )}
      <Field label={t("name")}>{(p) => <Input {...p} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field>
      <Field label={t("kind")}>
        {(p) => <Select {...p} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as RewardKind, value: "" })}>
          <option value="GIFT">{t("kinds.GIFT")}</option>
          <option value="PERCENTAGE">{t("kinds.PERCENTAGE")}</option>
          <option value="FIXED">{t("kinds.FIXED")}</option>
        </Select>}
      </Field>
      {f.kind !== "GIFT" && <Field label={f.kind === "PERCENTAGE" ? t("percentage") : t("fixed", { currency: programs.find((p) => p.id === f.programId)?.currency ?? "" })} hint={t("valueHint")}>
        {(p) => <Input {...p} inputMode="decimal" required value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />}
      </Field>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("cost", { unit: unitLabel(mode) })}>{(p) => <Input {...p} type="number" min={1} value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} />}</Field>
        <Field label={t("stock")}>{(p) => <Input {...p} type="number" min={0} value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })} />}</Field>
      </div>
      <Field label={t("description")}>{(p) => <Textarea {...p} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />}</Field>
      <Field label={t("conditions")}>{(p) => <Input {...p} value={f.conditions} onChange={(e) => setF({ ...f, conditions: e.target.value })} />}</Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("from")}>{(p) => <Input {...p} type="date" value={f.availableFrom} onChange={(e) => setF({ ...f, availableFrom: e.target.value })} />}</Field>
        <Field label={t("until")}>{(p) => <Input {...p} type="date" value={f.availableUntil} onChange={(e) => setF({ ...f, availableUntil: e.target.value })} />}</Field>
      </div>
      <Checkbox checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} label={t("active")} />
      <Button type="submit" loading={busy} disabled={f.name.trim().length < 2 || !f.cost}>{reward ? t("save") : t("submit")}</Button>
    </form>
  );
}

export default function RewardsPage() {
  const toErrorMessage = useErrorMessage();
  const t = useTranslations("app.rewards");
  const unitLabel = useUnitLabel();
  const rewardValueLabel = useRewardValueLabel();
  const canWrite = useCan("rewards.write");
  const canCancel = useCan("redemptions.cancel");
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Reward | "new" | null>(null);
  const { data: tenant } = useQuery({ queryKey: ["tenant"], queryFn: () => api.get<{ settings: { currency: string } }>("/app/tenant") });
  const { data: programs = [] } = useQuery({ queryKey: ["programs"], queryFn: () => api.get<Program[]>("/app/programs") });
  const { data: rewards, isLoading } = useQuery({ queryKey: ["rewards"], queryFn: () => api.get<Reward[]>("/app/rewards") });
  const { data: redemptions } = useQuery({ queryKey: ["redemptions"], queryFn: () => api.get<{ data: Redemption[] }>("/app/redemptions?limit=20") });
  const programOf = (id: string) => programs.find((p) => p.id === id);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} actions={canWrite && programs.length > 0 && <Button onClick={() => setEditing("new")}><Plus /> {t("new")}</Button>} />
      {isLoading ? (
        <Skeleton className="h-40" />
      ) : !rewards?.length ? (
        <EmptyState icon={<Gift />} title={t("empty")} action={canWrite && programs.length > 0 ? <Button onClick={() => setEditing("new")}>{t("create")}</Button> : undefined}>
          {t("emptyBody")}
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
                      {!r.active && <Badge>{t("inactive")}</Badge>}
                      {r.stock === 0 && <Badge tone="danger">{t("soldOut")}</Badge>}
                    </p>
                    <p className="text-sm text-ink-3">
                      {rewardValueLabel(r, program?.currency ?? tenant?.settings.currency ?? "EUR")} · {program?.name} · {t("uses", { count: r._count.redemptions, formatted: formatNumber(r._count.redemptions) })}
                      {r.stock !== null && ` · ${t("stock", { count: r.stock })}`}
                      {r.availableUntil && ` · ${t("until", { date: formatDate(r.availableUntil) })}`}
                    </p>
                  </div>
                  <span className="rounded-full bg-stamp-soft px-3 py-1 font-display font-semibold tabular text-stamp-ink dark:text-stamp">
                    {formatNumber(r.cost)} {unitLabel(program?.mode ?? "POINTS", r.cost)}
                  </span>
                  {canWrite && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>{t("edit")}</Button>
                      <ConfirmDialog
                        trigger={<Button size="sm" variant="ghost" className="text-danger">{t("archive")}</Button>}
                        title={t("archiveTitle", { name: r.name })}
                        consequence={t("archiveConsequence")}
                        confirmLabel={t("archiveConfirm")}
                        destructive
                        onConfirm={async () => {
                          await api.post(`/app/rewards/${r.id}/archive`);
                          qc.invalidateQueries({ queryKey: ["rewards"] });
                          toast.success(t("archived"));
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
          <h2 id="usages" className="mb-3 font-display text-xl font-semibold">{t("recent")}</h2>
          <Panel className="overflow-hidden">
            <ul className="divide-y divide-line">
              {redemptions.data.map((u) => (
                <li key={u.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{u.rewardName} <span className="font-normal text-ink-2">· {u.account.customer.firstName} {u.account.customer.lastName}</span></p>
                    <p className="text-sm text-ink-3">{formatDate(u.createdAt, true)}</p>
                  </div>
                  {u.status === "CANCELLED" ? (
                    <Badge>{t("cancelled")}</Badge>
                  ) : (
                    canCancel && (
                      <ConfirmDialog
                        trigger={<Button size="sm" variant="ghost">{t("cancel")}</Button>}
                        title={t("cancelTitle")}
                        consequence={t("cancelConsequence", { amount: formatNumber(u.cost) })}
                        confirmLabel={t("cancelConfirm")}
                        destructive
                        onConfirm={async () => {
                          try {
                            await api.post(`/app/redemptions/${u.id}/cancel`, { reason: t("cancelReason") });
                            qc.invalidateQueries();
                            toast.success(t("cancelledToast"));
                          } catch (e) {
                            toast.error(toErrorMessage(e));
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
          <DialogContent title={editing === "new" ? t("new") : t("editTitle")}>
            <RewardForm reward={editing === "new" ? undefined : editing} programs={programs} onDone={() => setEditing(null)} />
          </DialogContent>
        )}
      </DialogRoot>
    </>
  );
}
