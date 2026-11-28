"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Search, FileJson } from "lucide-react";
import { Input } from "@/components/ui/field";
import { PageHeader, Panel } from "@/components/ui/misc";
import { DialogContent, DialogRoot } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { FinanceNav } from "@/components/admin/finance/finance-nav";
import { DataLoader } from "@/components/navigation/data-loader";

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
  const t = useTranslations("admin.finance.audit");
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
        title={t("title")}
        description={t("description")}
      />

      <FinanceNav />

      <div className="mb-6 relative max-w-md">
        <Search className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
        <Input
          type="search"
          aria-label={t("search")}
          placeholder={t("search")}
          className="ps-10"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {isLoading ? (
        <DataLoader />
      ) : filtered.length === 0 ? (
        <Panel className="p-12 text-center text-sm text-ink-3">{t("empty")}</Panel>
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-start text-sm">
            <thead className="border-b border-line bg-surface-2 text-xs text-ink-3">
              <tr>
                <th className="py-3 px-4 font-medium">{t("table.date")}</th>
                <th className="py-3 px-4 font-medium">{t("table.action")}</th>
                <th className="py-3 px-4 font-medium">{t("table.entity")}</th>
                <th className="py-3 px-4 font-medium">{t("table.author")}</th>
                <th className="py-3 px-4 font-medium text-end">{t("table.details")}</th>
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
                    <div className="font-medium text-ink">{log.userName ?? t("system")}</div>
                    {log.userEmail && <div className="text-ink-3">{log.userEmail}</div>}
                  </td>
                  <td className="py-3.5 px-4 text-end">
                    {log.metadata ? (
                      <button
                        type="button"
                        onClick={() => setSelectedLog(log)}
                        className="inline-flex items-center gap-1 text-xs text-cobalt hover:underline"
                      >
                        <FileJson className="size-3" />
                        {t("inspect")}
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
      <DialogRoot open={selectedLog !== null} onOpenChange={(o) => !o && setSelectedLog(null)}>
        {selectedLog && (
          <DialogContent title={t("detailTitle")} description={selectedLog.action}>
            <pre dir="ltr" className="max-h-80 overflow-auto rounded-lg bg-surface-2 p-3 font-mono text-xs text-ink">
              {JSON.stringify(selectedLog.metadata, null, 2)}
            </pre>
          </DialogContent>
        )}
      </DialogRoot>
    </>
  );
}

