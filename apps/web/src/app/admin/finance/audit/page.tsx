"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, Search, FileJson } from "lucide-react";
import { Input } from "@/components/ui/field";
import { Badge, PageHeader, Panel } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { FinanceNav } from "@/components/admin/finance/finance-nav";

interface AuditLogRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  metadata: Record<string, any> | null;
  ip: string | null;
  createdAt: string;
}

export default function FinanceAuditPage() {
  const [q, setQ] = useState("");
  const [selectedLog, setSelectedLog] = useState<AuditLogRow | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["admin-finance-audit"],
    queryFn: () => api.get<AuditLogRow[]>("/admin/finance/audit?limit=150"),
  });

  const filtered = data.filter((log) => {
    if (!q) return true;
    const term = q.toLowerCase();
    return (
      log.action.toLowerCase().includes(term) ||
      log.entityType.toLowerCase().includes(term) ||
      (log.userEmail && log.userEmail.toLowerCase().includes(term)) ||
      (log.userName && log.userName.toLowerCase().includes(term))
    );
  });

  return (
    <>
      <PageHeader
        title="Journal d'audit financier (Inaltérable)"
        description="Traçabilité complète de chaque action financière : qui a saisi une dépense, validé une commission ou émis un remboursement."
      />

      <FinanceNav />

      <div className="mb-6 relative max-w-md">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
        <Input
          type="search"
          placeholder="Filtrer par action, administrateur, entité..."
          className="pl-10"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="py-20 text-center text-sm text-ink-3">Chargement du journal d&apos;audit...</div>
      ) : filtered.length === 0 ? (
        <Panel className="p-12 text-center text-sm text-ink-3">Aucune écriture d&apos;audit trouvée.</Panel>
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="border-b border-line bg-surface-2 text-xs text-ink-3">
              <tr>
                <th className="py-3 px-4 font-medium">Date & Heure</th>
                <th className="py-3 px-4 font-medium">Opération</th>
                <th className="py-3 px-4 font-medium">Entité ciblée</th>
                <th className="py-3 px-4 font-medium">Auteur de l&apos;acte</th>
                <th className="py-3 px-4 font-medium text-right">Détails</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((log) => (
                <tr key={log.id} className="hover:bg-surface-2 transition-colors">
                  <td className="py-3.5 px-4 font-mono text-xs text-ink-2">
                    {formatDate(log.createdAt, true)}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-xs font-semibold text-ink">
                    <span className="rounded bg-surface-2 px-2 py-0.5 text-xs text-ink">
                      {log.action}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-xs">
                    <span className="font-medium text-ink-2">{log.entityType}</span>
                    <div className="font-mono text-[11px] text-ink-3 truncate max-w-[120px]">
                      {log.entityId}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-xs">
                    <div className="font-medium text-ink">{log.userName ?? "Système automatique"}</div>
                    {log.userEmail && <div className="text-ink-3">{log.userEmail}</div>}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    {log.metadata ? (
                      <button
                        type="button"
                        onClick={() => setSelectedLog(log)}
                        className="inline-flex items-center gap-1 text-xs text-cobalt hover:underline"
                      >
                        <FileJson className="size-3" />
                        Examiner
                      </button>
                    ) : (
                      <span className="text-xs text-ink-3">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {/* Modal d'examen des métadonnées JSON */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={() => setSelectedLog(null)} />
          <div className="relative w-full max-w-lg rounded-xl border border-line bg-surface p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div>
                <h3 className="font-display text-base font-semibold text-ink">Détails de l&apos;opération</h3>
                <p className="font-mono text-xs text-ink-3">{selectedLog.action}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="text-xs text-ink-3 hover:text-ink"
              >
                Fermer
              </button>
            </div>
            <pre className="mt-4 max-h-80 overflow-auto rounded-lg bg-surface-2 p-3 font-mono text-xs text-ink">
              {JSON.stringify(selectedLog.metadata, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </>
  );
}

