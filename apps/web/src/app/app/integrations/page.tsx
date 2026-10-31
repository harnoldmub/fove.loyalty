"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound, Plus, Webhook } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { API_SCOPES, WEBHOOK_EVENTS } from "@fove/shared";
import { useCan } from "@/components/app/me-context";
import type { Program } from "@/components/app/types";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, DialogContent, DialogRoot } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Badge, EmptyState, ErrorNote, PageHeader, Panel } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { useIsNativeApp } from "@/lib/native-app";
import { formatDate } from "@/lib/utils";

interface ApiKey { id: string; name: string; kind: "SECRET" | "PUBLISHABLE"; environment: "TEST" | "LIVE"; prefix: string; scopes: string[]; allowedOrigins: string[]; lastUsedAt: string | null; revokedAt: string | null; createdAt: string }
interface Endpoint { id: string; url: string; events: string[]; active: boolean }
interface Delivery { id: string; event: string; status: string; attempts: number; lastStatusCode: number | null; lastError: string | null; createdAt: string }
interface Connection { id: string; provider: string; name: string; status: string; lastSyncAt: string | null; lastError: string | null; syncLogs: { id: string; kind: string; externalId: string; status: string; error: string | null; createdAt: string }[] }

const SCOPE_LABEL: Record<string, string> = {
  "customers:read": "Lire les clients",
  "customers:write": "Créer des clients",
  "programs:read": "Lire les programmes",
  "loyalty:read": "Lire les cartes et l’historique",
  "loyalty:write": "Créditer des achats",
  "rewards:read": "Lire les récompenses",
  "redemptions:write": "Valider des récompenses",
  "integrations:write": "Synchroniser une boutique en ligne",
};

function SecretReveal({ value, label }: { value: string; label: string }) {
  return (
    <div className="grid gap-2 rounded-md bg-stamp-soft p-4">
      <p className="text-sm font-medium text-stamp-ink dark:text-stamp">{label} Copiez-la maintenant : elle ne sera plus affichée.</p>
      <div className="flex gap-2">
        <code className="min-w-0 flex-1 break-all rounded-sm bg-surface px-3 py-2 text-sm">{value}</code>
        <Button size="icon" variant="secondary" aria-label="Copier" onClick={() => navigator.clipboard.writeText(value).then(() => toast.success("Copié"))}>
          <Copy />
        </Button>
      </div>
    </div>
  );
}

function KeyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<"SECRET" | "PUBLISHABLE">("SECRET");
  const [name, setName] = useState("");
  const [env, setEnv] = useState<"TEST" | "LIVE">("TEST");
  const [scopes, setScopes] = useState<string[]>(["customers:read", "loyalty:read", "loyalty:write"]);
  const [origins, setOrigins] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const close = (o: boolean) => {
    onOpenChange(o);
    if (!o) {
      setCreated(null);
      setName("");
    }
  };
  return (
    <DialogRoot open={open} onOpenChange={close}>
      <DialogContent title="Nouvelle clé API">
        {created ? (
          <>
            <SecretReveal value={created} label={kind === "SECRET" ? "Clé secrète créée." : "Clé publique créée."} />
            <Button onClick={() => close(false)}>J’ai copié la clé</Button>
          </>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              try {
                const res = await api.post<{ key: string }>("/app/integrations/keys", {
                  name,
                  kind,
                  environment: env,
                  scopes: kind === "SECRET" ? scopes : [],
                  allowedOrigins: kind === "PUBLISHABLE" ? origins.split(/[\s,]+/).filter(Boolean) : [],
                });
                setCreated(res.key);
                qc.invalidateQueries({ queryKey: ["keys"] });
              } catch (err) {
                setError(errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            {error && <ErrorNote>{error}</ErrorNote>}
            <Field label="Usage" hint={kind === "SECRET" ? "Pour votre serveur ou votre caisse. Ne jamais la mettre dans un site web." : "Pour le widget sur votre site. Elle ne peut que lire votre configuration publique."}>
              {(p) => (
                <Select {...p} value={kind} onChange={(e) => setKind(e.target.value as "SECRET" | "PUBLISHABLE")}>
                  <option value="SECRET">Clé secrète (serveur)</option>
                  <option value="PUBLISHABLE">Clé publique (widget)</option>
                </Select>
              )}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nom">{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
              <Field label="Environnement">
                {(p) => (
                  <Select {...p} value={env} onChange={(e) => setEnv(e.target.value as "TEST" | "LIVE")}>
                    <option value="TEST">Test</option>
                    <option value="LIVE">Production</option>
                  </Select>
                )}
              </Field>
            </div>
            {kind === "SECRET" ? (
              <fieldset className="grid gap-2">
                <legend className="mb-1 text-sm font-medium">Droits</legend>
                {API_SCOPES.map((s) => (
                  <Checkbox key={s} label={SCOPE_LABEL[s] ?? s} checked={scopes.includes(s)} onChange={(e) => setScopes(e.target.checked ? [...scopes, s] : scopes.filter((x) => x !== s))} />
                ))}
              </fieldset>
            ) : (
              <Field label="Domaines autorisés" hint="Un par ligne, ex. https://maboutique.com">
                {(p) => <Textarea {...p} value={origins} onChange={(e) => setOrigins(e.target.value)} />}
              </Field>
            )}
            <Button type="submit" loading={busy} disabled={name.trim().length < 2}>Créer la clé</Button>
          </form>
        )}
      </DialogContent>
    </DialogRoot>
  );
}

function WebhookDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["loyalty_transaction.created"]);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <DialogRoot open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setSecret(null); }}>
      <DialogContent title="Nouveau webhook" description="FOVE envoie une requête signée à cette adresse à chaque événement choisi.">
        {secret ? (
          <>
            <SecretReveal value={secret} label="Secret de signature créé." />
            <Button onClick={() => onOpenChange(false)}>J’ai copié le secret</Button>
          </>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              try {
                const res = await api.post<{ secret: string }>("/app/integrations/webhooks", { url, events });
                setSecret(res.secret);
                qc.invalidateQueries({ queryKey: ["webhooks"] });
              } catch (err) {
                setError(errorMessage(err));
              }
            }}
          >
            {error && <ErrorNote>{error}</ErrorNote>}
            <Field label="URL (HTTPS)">{(p) => <Input {...p} type="url" value={url} onChange={(e) => setUrl(e.target.value)} />}</Field>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Événements</legend>
              {WEBHOOK_EVENTS.map((ev) => (
                <Checkbox key={ev} label={<code>{ev}</code>} checked={events.includes(ev)} onChange={(e) => setEvents(e.target.checked ? [...events, ev] : events.filter((x) => x !== ev))} />
              ))}
            </fieldset>
            <Button type="submit" disabled={!url || events.length === 0}>Créer le webhook</Button>
          </form>
        )}
      </DialogContent>
    </DialogRoot>
  );
}

export default function IntegrationsPage() {
  const native = useIsNativeApp();
  const canWrite = useCan("integrations.write");
  const qc = useQueryClient();
  const [keyOpen, setKeyOpen] = useState(false);
  const [hookOpen, setHookOpen] = useState(false);
  const [connProgram, setConnProgram] = useState("");
  const { data: keys = [] } = useQuery({ queryKey: ["keys"], queryFn: () => api.get<ApiKey[]>("/app/integrations/keys") });
  const { data: hooks = [] } = useQuery({ queryKey: ["webhooks"], queryFn: () => api.get<Endpoint[]>("/app/integrations/webhooks") });
  const { data: deliveries = [] } = useQuery({ queryKey: ["deliveries"], queryFn: () => api.get<Delivery[]>("/app/integrations/deliveries") });
  const { data: connections = [] } = useQuery({ queryKey: ["connections"], queryFn: () => api.get<Connection[]>("/app/integrations/connections") });
  const { data: programs = [] } = useQuery({ queryKey: ["programs"], queryFn: () => api.get<Program[]>("/app/programs") });

  return (
    <>
      <PageHeader title="Intégrations" description={native ? "Reliez votre caisse ou votre boutique en ligne." : <>Reliez votre caisse ou votre boutique en ligne. Guide complet dans la <a className="text-cobalt underline" href="/developpeurs">documentation</a>.</>} />

      <section className="grid gap-3" aria-labelledby="boutique">
        <h2 id="boutique" className="font-display text-xl font-semibold">Boutique en ligne</h2>
        {connections.length === 0 ? (
          <Panel className="grid gap-3 p-5">
            <p className="text-ink-2">Une commande payée sur votre site crédite la carte du client ; un remboursement retire les points. Votre boutique appelle FOVE avec une clé secrète « Synchroniser une boutique en ligne ».</p>
            {canWrite && programs.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <Select aria-label="Programme crédité" value={connProgram} onChange={(e) => setConnProgram(e.target.value)} className="w-auto">
                  <option value="">Programme crédité</option>
                  {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
                <Button
                  variant="secondary"
                  disabled={!connProgram}
                  onClick={async () => {
                    try {
                      await api.post("/app/integrations/connections", { provider: "CUSTOM", name: "Boutique en ligne", programId: connProgram });
                      qc.invalidateQueries({ queryKey: ["connections"] });
                    } catch (e) {
                      toast.error(errorMessage(e));
                    }
                  }}
                >
                  Connecter une boutique
                </Button>
              </div>
            )}
          </Panel>
        ) : (
          connections.map((c) => (
            <Panel key={c.id} className="overflow-hidden">
              <div className="flex flex-wrap items-center gap-2 p-5">
                <h3 className="font-display text-lg font-semibold">{c.name}</h3>
                <Badge tone={c.lastError ? "danger" : c.lastSyncAt ? "mint" : "neutral"}>{c.lastError ? "Erreur" : c.lastSyncAt ? "Synchronisée" : "En attente du premier envoi"}</Badge>
                <p className="w-full text-sm text-ink-3">{c.lastSyncAt ? `Dernière synchronisation le ${formatDate(c.lastSyncAt, true)}` : "Aucune commande reçue pour l’instant."}</p>
                {c.lastError && <p className="w-full text-sm text-danger">{c.lastError}</p>}
              </div>
              {c.syncLogs.length > 0 && (
                <ul className="divide-y divide-line border-t border-line text-sm">
                  {c.syncLogs.map((l) => (
                    <li key={l.id} className="flex gap-3 px-5 py-2.5">
                      <span className="flex-1 truncate">{l.kind === "order.paid" ? "Commande payée" : "Remboursement"} {l.externalId}</span>
                      <span className={l.status === "ok" ? "text-mint" : "text-danger"}>{l.status === "ok" ? "OK" : l.error ?? "Erreur"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          ))
        )}
      </section>

      <section className="mt-10 grid gap-3" aria-labelledby="cles">
        <div className="flex items-end justify-between gap-3">
          <h2 id="cles" className="font-display text-xl font-semibold">Clés API</h2>
          {canWrite && <Button size="sm" onClick={() => setKeyOpen(true)}><Plus /> Nouvelle clé</Button>}
        </div>
        {keys.length === 0 ? (
          <EmptyState icon={<KeyRound />} title="Aucune clé">Créez une clé secrète pour votre serveur, ou une clé publique pour le widget.</EmptyState>
        ) : (
          <Panel className="overflow-hidden">
            <ul className="divide-y divide-line">
              {keys.map((k) => (
                <li key={k.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {k.name}
                      <Badge tone={k.kind === "SECRET" ? "cobalt" : "neutral"}>{k.kind === "SECRET" ? "Secrète" : "Publique"}</Badge>
                      <Badge tone={k.environment === "LIVE" ? "mint" : "stamp"}>{k.environment === "LIVE" ? "Production" : "Test"}</Badge>
                      {k.revokedAt && <Badge tone="danger">Révoquée</Badge>}
                    </p>
                    <p className="truncate text-sm text-ink-3">
                      <code>{k.prefix}…</code> · {k.lastUsedAt ? `utilisée le ${formatDate(k.lastUsedAt, true)}` : "jamais utilisée"}
                    </p>
                  </div>
                  {canWrite && !k.revokedAt && (
                    <ConfirmDialog
                      trigger={<Button size="sm" variant="ghost" className="text-danger">Révoquer</Button>}
                      title={`Révoquer « ${k.name} » ?`}
                      consequence="Toute intégration qui l’utilise cessera immédiatement de fonctionner."
                      confirmLabel="Révoquer la clé"
                      destructive
                      onConfirm={async () => {
                        await api.delete(`/app/integrations/keys/${k.id}`);
                        qc.invalidateQueries({ queryKey: ["keys"] });
                      }}
                    />
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </section>

      <section className="mt-10 grid gap-3" aria-labelledby="webhooks">
        <div className="flex items-end justify-between gap-3">
          <h2 id="webhooks" className="font-display text-xl font-semibold">Webhooks</h2>
          {canWrite && <Button size="sm" onClick={() => setHookOpen(true)}><Plus /> Nouveau webhook</Button>}
        </div>
        {hooks.filter((h) => h.active).length === 0 ? (
          <EmptyState icon={<Webhook />} title="Aucun webhook">Recevez les opérations de fidélité en temps réel dans votre système.</EmptyState>
        ) : (
          <Panel className="overflow-hidden">
            <ul className="divide-y divide-line">
              {hooks.filter((h) => h.active).map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{h.url}</p>
                    <p className="truncate text-sm text-ink-3">{h.events.join(", ")}</p>
                  </div>
                  {canWrite && (
                    <ConfirmDialog
                      trigger={<Button size="sm" variant="ghost">Désactiver</Button>}
                      title="Désactiver ce webhook ?"
                      consequence="Plus aucun événement ne sera envoyé à cette adresse."
                      confirmLabel="Désactiver"
                      destructive
                      onConfirm={async () => {
                        await api.delete(`/app/integrations/webhooks/${h.id}`);
                        qc.invalidateQueries({ queryKey: ["webhooks"] });
                      }}
                    />
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        )}
        {deliveries.length > 0 && (
          <details className="rounded-md bg-surface p-4 shadow-1">
            <summary className="cursor-pointer text-sm font-medium">Dernières livraisons ({deliveries.length})</summary>
            <ul className="mt-3 grid gap-1.5 text-sm">
              {deliveries.map((d) => (
                <li key={d.id} className="flex gap-3">
                  <span className="flex-1 truncate"><code>{d.event}</code> · {formatDate(d.createdAt, true)}</span>
                  <span className={d.status === "SUCCEEDED" ? "text-mint" : d.status === "FAILED" ? "text-danger" : "text-ink-3"}>
                    {d.status === "SUCCEEDED" ? "Livré" : d.status === "FAILED" ? `Échec (${d.attempts} essais)` : `En attente (${d.attempts})`}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <KeyDialog open={keyOpen} onOpenChange={setKeyOpen} />
      <WebhookDialog open={hookOpen} onOpenChange={setHookOpen} />
    </>
  );
}
