"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge, PageHeader, Panel } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";

interface Conn { id: string; name: string; provider: string; lastSyncAt: string | null; lastError: string | null; tenant: { name: string }; syncLogs: { id: string; externalId: string; error: string | null; createdAt: string }[] }
interface ErrorRow { id: string; method: string | null; path: string | null; message: string; createdAt: string; requestId: string | null }

export default function AdminSystem() {
  const { data: conns = [] } = useQuery({ queryKey: ["admin-integrations"], queryFn: () => api.get<Conn[]>("/admin/integrations") });
  const { data: errors = [] } = useQuery({ queryKey: ["admin-errors"], queryFn: () => api.get<ErrorRow[]>("/admin/errors") });
  return (
    <>
      <PageHeader title="Intégrations et erreurs" />
      <h2 className="mb-3 font-display text-xl font-semibold">Intégrations</h2>
      <div className="mb-10 grid gap-3">
        {conns.length === 0 && <p className="text-ink-2">Aucune intégration configurée.</p>}
        {conns.map((c) => (
          <Panel key={c.id} className="p-4">
            <p className="flex flex-wrap items-center gap-2 font-medium">
              {c.tenant.name} · {c.name}
              <Badge tone={c.lastError ? "danger" : c.lastSyncAt ? "mint" : "neutral"}>{c.lastError ? "Erreur" : c.lastSyncAt ? "OK" : "Jamais synchronisée"}</Badge>
            </p>
            <p className="text-sm text-ink-3">{c.lastSyncAt ? `Dernière synchronisation le ${formatDate(c.lastSyncAt, true)}` : ""}</p>
            {c.syncLogs.map((l) => <p key={l.id} className="text-sm text-danger">{l.externalId} : {l.error}</p>)}
          </Panel>
        ))}
      </div>
      <h2 className="mb-3 font-display text-xl font-semibold">Erreurs serveur récentes</h2>
      <Panel className="overflow-hidden">
        {errors.length === 0 ? (
          <p className="p-5 text-ink-2">Aucune erreur enregistrée.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {errors.map((e) => (
              <li key={e.id} className="grid gap-0.5 px-5 py-3">
                <span className="font-medium">{e.method} {e.path}</span>
                <span className="text-ink-2">{e.message}</span>
                <span className="text-ink-3">{formatDate(e.createdAt, true)} · requête {e.requestId}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
