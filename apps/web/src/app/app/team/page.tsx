"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useCan, useMe } from "@/components/app/me-context";
import type { Establishment } from "@/components/app/types";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, DialogContent, DialogRoot } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Badge, ErrorNote, PageHeader, Panel } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/utils";

const ROLES = {
  OWNER: { label: "Propriétaire", text: "Tous les droits, abonnement compris." },
  MANAGER: { label: "Manager", text: "Configure programmes et récompenses, annule des opérations." },
  CASHIER: { label: "Caissier", text: "Scanne les cartes, crédite et valide les récompenses." },
  VIEWER: { label: "Lecteur", text: "Consulte sans rien modifier." },
} as const;
type Role = keyof typeof ROLES;

interface Team {
  members: { id: string; user: { id: string; name: string; email: string }; role: Role; status: "ACTIVE" | "DISABLED"; allEstablishments: boolean; establishmentIds: string[] }[];
  invitations: { id: string; email: string; role: Role; expiresAt: string }[];
}

function InviteDialog({ open, onOpenChange, establishments }: { open: boolean; onOpenChange: (o: boolean) => void; establishments: Establishment[] }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("CASHIER");
  const [ests, setEsts] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Inviter un collaborateur" description="Il reçoit un lien valable 7 jours pour créer son accès.">
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await api.post("/app/team/invitations", { email, role, establishmentIds: ests });
              toast.success(`Invitation envoyée à ${email}`);
              qc.invalidateQueries({ queryKey: ["team"] });
              onOpenChange(false);
              setEmail("");
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {error && <ErrorNote>{error}</ErrorNote>}
          <Field label="Email">{(p) => <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
          <Field label="Rôle" hint={ROLES[role].text}>
            {(p) => (
              <Select {...p} value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {(["MANAGER", "CASHIER", "VIEWER"] as const).map((r) => <option key={r} value={r}>{ROLES[r].label}</option>)}
              </Select>
            )}
          </Field>
          {establishments.length > 1 && (
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Établissements autorisés</legend>
              <p className="text-sm text-ink-3">Aucune case cochée : accès à tous.</p>
              {establishments.map((est) => (
                <Checkbox key={est.id} label={est.name} checked={ests.includes(est.id)} onChange={(e) => setEsts(e.target.checked ? [...ests, est.id] : ests.filter((x) => x !== est.id))} />
              ))}
            </fieldset>
          )}
          <Button type="submit" loading={busy} disabled={!email.includes("@")}>Envoyer l’invitation</Button>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}

export default function TeamPage() {
  const me = useMe();
  const canWrite = useCan("members.write");
  const qc = useQueryClient();
  const [inviting, setInviting] = useState(false);
  const { data } = useQuery({ queryKey: ["team"], queryFn: () => api.get<Team>("/app/team") });
  const { data: establishments = [] } = useQuery({ queryKey: ["establishments"], queryFn: () => api.get<Establishment[]>("/app/establishments") });
  const estName = (id: string) => establishments.find((e) => e.id === id)?.name ?? "";

  return (
    <>
      <PageHeader title="Collaborateurs" description="Chaque personne a son propre accès : les opérations portent son nom." actions={canWrite && <Button onClick={() => setInviting(true)}><UserPlus /> Inviter</Button>} />
      <Panel className="overflow-hidden">
        <ul className="divide-y divide-line">
          {data?.members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {m.user.name} {m.user.id === me.user.id && <span className="font-normal text-ink-3">(vous)</span>}
                </p>
                <p className="truncate text-sm text-ink-3">
                  {m.user.email}
                  {!m.allEstablishments && ` · ${m.establishmentIds.map(estName).join(", ")}`}
                </p>
              </div>
              {m.status === "DISABLED" && <Badge tone="danger">Désactivé</Badge>}
              {canWrite && m.user.id !== me.user.id ? (
                <Select
                  aria-label={`Rôle de ${m.user.name}`}
                  className="h-9 w-auto text-sm"
                  value={m.role}
                  onChange={async (e) => {
                    try {
                      await api.patch(`/app/team/members/${m.id}`, { role: e.target.value });
                      qc.invalidateQueries({ queryKey: ["team"] });
                      toast.success("Rôle modifié");
                    } catch (err) {
                      toast.error(errorMessage(err));
                    }
                  }}
                >
                  {(Object.keys(ROLES) as Role[]).map((r) => <option key={r} value={r}>{ROLES[r].label}</option>)}
                </Select>
              ) : (
                <Badge tone="cobalt">{ROLES[m.role].label}</Badge>
              )}
              {canWrite && m.user.id !== me.user.id && (
                <ConfirmDialog
                  trigger={<Button size="sm" variant="ghost">{m.status === "ACTIVE" ? "Désactiver" : "Réactiver"}</Button>}
                  title={m.status === "ACTIVE" ? `Désactiver l’accès de ${m.user.name} ?` : `Réactiver ${m.user.name} ?`}
                  consequence={m.status === "ACTIVE" ? "Il perd immédiatement l’accès. Ses opérations passées restent dans l’historique." : "Il retrouve son accès avec son rôle actuel."}
                  confirmLabel={m.status === "ACTIVE" ? "Désactiver" : "Réactiver"}
                  destructive={m.status === "ACTIVE"}
                  onConfirm={async () => {
                    try {
                      await api.post(`/app/team/members/${m.id}/status`, { status: m.status === "ACTIVE" ? "DISABLED" : "ACTIVE" });
                      qc.invalidateQueries({ queryKey: ["team"] });
                    } catch (err) {
                      toast.error(errorMessage(err));
                    }
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      </Panel>
      {data && data.invitations.length > 0 && (
        <section className="mt-8" aria-labelledby="invitations">
          <h2 id="invitations" className="mb-3 font-display text-xl font-semibold">Invitations en attente</h2>
          <Panel className="overflow-hidden">
            <ul className="divide-y divide-line">
              {data.invitations.map((i) => (
                <li key={i.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{i.email}</p>
                    <p className="text-sm text-ink-3">{ROLES[i.role].label} · expire le {formatDate(i.expiresAt)}</p>
                  </div>
                  {canWrite && (
                    <ConfirmDialog
                      trigger={<Button size="sm" variant="ghost">Révoquer</Button>}
                      title="Révoquer cette invitation ?"
                      consequence="Le lien envoyé ne fonctionnera plus."
                      confirmLabel="Révoquer"
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
