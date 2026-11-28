"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useCan, useMe } from "@/components/app/me-context";
import type { Establishment } from "@/components/app/types";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, DialogContent, DialogRoot } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Badge, ErrorNote, PageHeader, Panel } from "@/components/ui/misc";
import { api, useErrorMessage } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { useQuotaBlock } from "@/components/app/upgrade";
import { DataLoader } from "@/components/navigation/data-loader";
import { ActivateRegisterButton, CashierPinDialog } from "@/components/app/cashier-pin";

const ROLES = ["OWNER", "MANAGER", "CASHIER", "VIEWER"] as const;
type Role = (typeof ROLES)[number];

interface Team {
  members: { id: string; user: { id: string; name: string; email: string }; role: Role; status: "ACTIVE" | "DISABLED"; allEstablishments: boolean; establishmentIds: string[]; cashierPinSet: boolean }[];
  invitations: { id: string; email: string; role: Role; expiresAt: string }[];
}

function InviteDialog({ open, onOpenChange, establishments }: { open: boolean; onOpenChange: (o: boolean) => void; establishments: Establishment[] }) {
  const toErrorMessage = useErrorMessage();
  const t = useTranslations("app.team");
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("CASHIER");
  const [ests, setEsts] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const quota = useQuotaBlock("staff");
  const [busy, setBusy] = useState(false);
  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t("invite.title")} description={t("invite.description")}>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
    quota.clear();
            try {
              await api.post("/app/team/invitations", { email, role, establishmentIds: ests });
              toast.success(t("invite.sent", { email }));
              qc.invalidateQueries({ queryKey: ["team"] });
              onOpenChange(false);
              setEmail("");
            } catch (err) {
              setError(toErrorMessage(err));
      quota.track(err);
            } finally {
              setBusy(false);
            }
          }}
        >
          {error && <ErrorNote>{error}</ErrorNote>}
          {quota.hint}
          <Field label={t("invite.email")}>{(p) => <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
          <Field label={t("invite.role")} hint={t(`roles.${role}.text`)}>
            {(p) => (
              <Select {...p} value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {(["MANAGER", "CASHIER", "VIEWER"] as const).map((r) => <option key={r} value={r}>{t(`roles.${r}.label`)}</option>)}
              </Select>
            )}
          </Field>
          {establishments.length > 1 && (
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">{t("invite.establishments")}</legend>
              <p className="text-sm text-ink-3">{t("invite.allHint")}</p>
              {establishments.map((est) => (
                <Checkbox key={est.id} label={est.name} checked={ests.includes(est.id)} onChange={(e) => setEsts(e.target.checked ? [...ests, est.id] : ests.filter((x) => x !== est.id))} />
              ))}
            </fieldset>
          )}
          <Button type="submit" loading={busy} disabled={!email.includes("@")}>{t("invite.submit")}</Button>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}

export default function TeamPage() {
  const toErrorMessage = useErrorMessage();
  const t = useTranslations("app.team");
  const me = useMe();
  const canWrite = useCan("members.write");
  const qc = useQueryClient();
  const [inviting, setInviting] = useState(false);
  const { data } = useQuery({ queryKey: ["team"], queryFn: () => api.get<Team>("/app/team") });
  const { data: establishments = [] } = useQuery({ queryKey: ["establishments"], queryFn: () => api.get<Establishment[]>("/app/establishments") });
  const estName = (id: string) => establishments.find((e) => e.id === id)?.name ?? "";

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} actions={canWrite && <Button onClick={() => setInviting(true)}><UserPlus /> {t("inviteButton")}</Button>} />
      {!data ? <DataLoader /> : (
      <Panel className="overflow-hidden">
        <ul className="divide-y divide-line">
          {data.members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {m.user.name} {m.user.id === me.user.id && <span className="font-normal text-ink-3">{t("you")}</span>}
                </p>
                <p className="truncate text-sm text-ink-3">
                  {m.user.email}
                  {!m.allEstablishments && ` · ${m.establishmentIds.map(estName).join(", ")}`}
                </p>
              </div>
              {m.status === "DISABLED" && <Badge tone="danger">{t("disabled")}</Badge>}
              <CashierPinStatus member={m} self={m.user.id === me.user.id} />
              {canWrite && m.user.id !== me.user.id ? (
                <Select
                  aria-label={t("roleOf", { name: m.user.name })}
                  className="h-9 w-auto text-sm"
                  value={m.role}
                  onChange={async (e) => {
                    try {
                      await api.patch(`/app/team/members/${m.id}`, { role: e.target.value });
                      qc.invalidateQueries({ queryKey: ["team"] });
                      toast.success(t("roleChanged"));
                    } catch (err) {
                      toast.error(toErrorMessage(err));
                    }
                  }}
                >
                  {ROLES.map((r) => <option key={r} value={r}>{t(`roles.${r}.label`)}</option>)}
                </Select>
              ) : (
                <Badge tone="cobalt">{t(`roles.${m.role}.label`)}</Badge>
              )}
              {canWrite && m.user.id !== me.user.id && (
                <ConfirmDialog
                  trigger={<Button size="sm" variant="ghost">{m.status === "ACTIVE" ? t("deactivate") : t("reactivate")}</Button>}
                  title={m.status === "ACTIVE" ? t("deactivateTitle", { name: m.user.name }) : t("reactivateTitle", { name: m.user.name })}
                  consequence={m.status === "ACTIVE" ? t("deactivateConsequence") : t("reactivateConsequence")}
                  confirmLabel={m.status === "ACTIVE" ? t("deactivate") : t("reactivate")}
                  destructive={m.status === "ACTIVE"}
                  onConfirm={async () => {
                    try {
                      await api.post(`/app/team/members/${m.id}/status`, { status: m.status === "ACTIVE" ? "DISABLED" : "ACTIVE" });
                      qc.invalidateQueries({ queryKey: ["team"] });
                    } catch (err) {
                      toast.error(toErrorMessage(err));
                    }
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      </Panel>
      )}
      {data && data.invitations.length > 0 && (
        <section className="mt-8" aria-labelledby="invitations">
          <h2 id="invitations" className="mb-3 font-display text-xl font-semibold">{t("pending")}</h2>
          <Panel className="overflow-hidden">
            <ul className="divide-y divide-line">
              {data.invitations.map((i) => (
                <li key={i.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{i.email}</p>
                    <p className="text-sm text-ink-3">{t("invitationMeta", { role: t(`roles.${i.role}.label`), date: formatDate(i.expiresAt) })}</p>
                  </div>
                  {canWrite && (
                    <ConfirmDialog
                      trigger={<Button size="sm" variant="ghost">{t("revoke")}</Button>}
                      title={t("revokeTitle")}
                      consequence={t("revokeConsequence")}
                      confirmLabel={t("revoke")}
                      destructive
                      onConfirm={async () => {
                        await api.delete(`/app/team/invitations/${i.id}`);
                        qc.invalidateQueries({ queryKey: ["team"] });
                      }}
                    />
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        </section>
      )}
      <RegistersPanel />
      <InviteDialog open={inviting} onOpenChange={setInviting} establishments={establishments.filter((e) => e.active)} />
    </>
  );
}

/** Code caisse d'un collaborateur : choisi ou non ; réinitialisation par le propriétaire ou un gérant. */
function CashierPinStatus({ member, self }: { member: Team["members"][number]; self: boolean }) {
  const t = useTranslations("app.register.team");
  const me = useMe();
  const qc = useQueryClient();
  const toErrorMessage = useErrorMessage();
  const canReset = (me.role === "OWNER" || me.role === "MANAGER") && !self;
  if (!member.cashierPinSet) return <Badge tone="neutral">{t("noPin")}</Badge>;
  return (
    <span className="flex items-center gap-1">
      <Badge tone="mint">{t("pin")}</Badge>
      {canReset && (
        <ConfirmDialog
          trigger={<Button size="sm" variant="ghost">{t("reset")}</Button>}
          title={t("resetTitle", { name: member.user.name })}
          consequence={t("resetConsequence")}
          confirmLabel={t("reset")}
          onConfirm={async () => {
            try {
              await api.delete(`/app/team/members/${member.id}/cashier-pin`);
              qc.invalidateQueries({ queryKey: ["team"] });
            } catch (err) {
              toast.error(toErrorMessage(err));
            }
          }}
        />
      )}
    </span>
  );
}

/** Caisses du commerce (docs/chantier-code-caisse.md) : activation sur l'appareil, liste, retrait, délai de verrouillage. */
function RegistersPanel() {
  const t = useTranslations("app.register.team");
  const me = useMe();
  const qc = useQueryClient();
  const toErrorMessage = useErrorMessage();
  const manage = me.role === "OWNER" || me.role === "MANAGER";
  const [pinOpen, setPinOpen] = useState(false);
  const { data: registers = [], isLoading } = useQuery({
    queryKey: ["registers"],
    queryFn: () => api.get<{ id: string; name: string; establishment: string | null; lastSeenAt: string }[]>("/app/registers"),
    enabled: manage,
  });
  const { data: tenant } = useQuery({ queryKey: ["tenant"], queryFn: () => api.get<{ settings?: { registerLockMinutes?: number } }>("/app/tenant") });
  const [minutes, setMinutes] = useState<string | null>(null);
  const lockMinutes = minutes ?? String(tenant?.settings?.registerLockMinutes ?? 5);

  return (
    <section className="mt-8 grid gap-3" aria-labelledby="registers">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h2 id="registers" className="font-display text-xl font-semibold">{t("title")}</h2>
          <p className="max-w-2xl text-sm text-ink-2">{t("help")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setPinOpen(true)}>{me.cashierPinSet ? t("changeMyPin") : t("chooseMyPin")}</Button>
          {manage && <ActivateRegisterButton />}
        </div>
      </div>
      {manage && (
        <Panel className="overflow-hidden">
          {isLoading ? (
            <DataLoader className="min-h-32" />
          ) : registers.length === 0 ? (
            <p className="px-5 py-6 text-sm text-ink-3">{t("empty")}</p>
          ) : (
            <ul className="divide-y divide-line">
              {registers.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{r.name}</p>
                    <p className="text-sm text-ink-3">{[r.establishment, t("lastSeen", { date: formatDate(r.lastSeenAt, true) })].filter(Boolean).join(" · ")}</p>
                  </div>
                  <ConfirmDialog
                    trigger={<Button size="sm" variant="ghost">{t("revoke")}</Button>}
                    title={t("revokeTitle", { name: r.name })}
                    consequence={t("revokeConsequence")}
                    confirmLabel={t("revoke")}
                    destructive
                    onConfirm={async () => {
                      try {
                        await api.delete(`/app/registers/${r.id}`);
                        qc.invalidateQueries({ queryKey: ["registers"] });
                      } catch (err) {
                        toast.error(toErrorMessage(err));
                      }
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-end gap-3 border-t border-line px-5 py-4">
            <Field label={t("lockMinutes")} className="w-48">
              {(f) => <Input {...f} type="number" min={1} max={60} value={lockMinutes} onChange={(e) => setMinutes(e.target.value)} />}
            </Field>
            <Button
              variant="secondary"
              onClick={async () => {
                const value = Math.min(60, Math.max(1, Math.round(Number(lockMinutes) || 5)));
                try {
                  await api.put("/app/registers/settings", { lockMinutes: value });
                  setMinutes(null);
                  await qc.invalidateQueries({ queryKey: ["tenant"] });
                  toast.success(t("saved"));
                } catch (err) {
                  toast.error(toErrorMessage(err));
                }
              }}
            >
              {t("save")}
            </Button>
          </div>
        </Panel>
      )}
      <CashierPinDialog open={pinOpen} onOpenChange={setPinOpen} />
    </section>
  );
}
