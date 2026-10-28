"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useCan } from "@/components/app/me-context";
import type { Establishment } from "@/components/app/types";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, DialogContent, DialogRoot } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { Badge, EmptyState, ErrorNote, PageHeader, Panel } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";

function EstablishmentForm({ value, onDone }: { value?: Establishment; onDone: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: value?.name ?? "", address: value?.address ?? "", city: value?.city ?? "", phone: value?.phone ?? "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const body = { name: f.name, address: f.address || null, city: f.city || null, phone: f.phone || null };
        try {
          if (value) await api.patch(`/app/establishments/${value.id}`, body);
          else await api.post("/app/establishments", body);
          qc.invalidateQueries({ queryKey: ["establishments"] });
          toast.success(value ? "Établissement mis à jour" : "Établissement ajouté");
          onDone();
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      {error && <ErrorNote>{error}</ErrorNote>}
      <Field label="Nom">{(p) => <Input {...p} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field>
      <Field label="Adresse">{(p) => <Input {...p} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />}</Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Ville">{(p) => <Input {...p} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />}</Field>
        <Field label="Téléphone">{(p) => <Input {...p} type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />}</Field>
      </div>
      <Button type="submit" loading={busy} disabled={f.name.trim().length < 2}>{value ? "Enregistrer" : "Ajouter l’établissement"}</Button>
    </form>
  );
}

export default function EstablishmentsPage() {
  const canWrite = useCan("establishments.write");
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Establishment | "new" | null>(null);
  const { data = [] } = useQuery({ queryKey: ["establishments"], queryFn: () => api.get<Establishment[]>("/app/establishments") });
  return (
    <>
      <PageHeader title="Établissements" description="Vos points de vente. Chaque opération indique où elle a eu lieu." actions={canWrite && <Button onClick={() => setEditing("new")}><Plus /> Ajouter</Button>} />
      {data.length === 0 ? (
        <EmptyState icon={<Building2 />} title="Aucun établissement" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((e) => (
            <Panel key={e.id} className="grid gap-2 p-5">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-display text-lg font-semibold">{e.name}</h2>
                {!e.active && <Badge>Fermé</Badge>}
              </div>
              <p className="text-sm text-ink-2">{[e.address, e.city, e.phone].filter(Boolean).join(" · ") || "Aucune coordonnée"}</p>
              {canWrite && (
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setEditing(e)}>Modifier</Button>
                  <ConfirmDialog
                    trigger={<Button size="sm" variant="ghost">{e.active ? "Fermer" : "Rouvrir"}</Button>}
                    title={e.active ? `Fermer ${e.name} ?` : `Rouvrir ${e.name} ?`}
                    consequence={e.active ? "Il n’apparaîtra plus au scanner. Son historique est conservé." : "Il sera de nouveau proposé au scanner."}
                    confirmLabel={e.active ? "Fermer l’établissement" : "Rouvrir"}
                    destructive={e.active}
                    onConfirm={async () => {
                      try {
                        await api.patch(`/app/establishments/${e.id}`, { active: !e.active });
                        qc.invalidateQueries({ queryKey: ["establishments"] });
                      } catch (err) {
                        toast.error(errorMessage(err));
                      }
                    }}
                  />
                </div>
              )}
            </Panel>
          ))}
        </div>
      )}
      <DialogRoot open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        {editing !== null && (
          <DialogContent title={editing === "new" ? "Nouvel établissement" : "Modifier l’établissement"}>
            <EstablishmentForm value={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />
          </DialogContent>
        )}
      </DialogRoot>
    </>
  );
}
