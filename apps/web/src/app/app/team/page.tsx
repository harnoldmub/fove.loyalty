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

const ROLES = ["OWNER", "MANAGER", "CASHIER", "VIEWER"] as const;
type Role = (typeof ROLES)[number];

interface Team {
  members: { id: string; user: { id: string; name: string; email: string }; role: Role; status: "ACTIVE" | "DISABLED"; allEstablishments: boolean; establishmentIds: string[] }[];
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
      <InviteDialog open={inviting} onOpenChange={setInviting} establishments={establishments.filter((e) => e.active)} />
    </>
  );
}
