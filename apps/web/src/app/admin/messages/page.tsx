"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Mail, MessageSquare, Phone, Building, Calendar, CheckCircle2, Clock, Archive, Sparkles, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, PageHeader, Panel } from "@/components/ui/misc";
import { api, useErrorMessage } from "@/lib/api";
import { formatDate } from "@/lib/utils";

type ContactStatus = "NEW" | "IN_PROGRESS" | "CONTACTED" | "ARCHIVED";

interface ContactMessage {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  companyName: string | null;
  subject: string | null;
  message: string;
  source: string;
  status: ContactStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_TONES: Record<ContactStatus, "cobalt" | "stamp" | "mint" | "neutral"> = {
  NEW: "cobalt",
  IN_PROGRESS: "stamp",
  CONTACTED: "mint",
  ARCHIVED: "neutral",
};
const FILTERS = ["ALL", "NEW", "IN_PROGRESS", "CONTACTED", "ARCHIVED"] as const;

export default function AdminMessagesPage() {
  const t = useTranslations("admin.messages");
  const errMsg = useErrorMessage();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>("ALL");
  const [selectedMessage, setSelectedMessage] = useState<ContactMessage | null>(null);
  const [noteInput, setNoteInput] = useState("");

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["admin-messages", filter],
    queryFn: () => api.get<ContactMessage[]>(`/admin/messages${filter !== "ALL" ? `?status=${filter}` : ""}`),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status?: ContactStatus; notes?: string }) => {
      return api.patch(`/admin/messages/${id}`, { status, notes });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-messages"] });
      toast.success(t("updated"));
    },
    onError: (err) => {
      toast.error(errMsg(err));
    },
  });

  const newCount = messages.filter((m) => m.status === "NEW").length;

  return (
    <>
      <PageHeader
        title={t("title")}
        description={newCount > 0 ? t("descriptionPending", { count: newCount }) : t("description")}
      />

      {/* Onglets de filtre de statut */}
      <div role="group" aria-label={t("filterLabel")} className="mb-6 inline-flex flex-wrap gap-1 rounded-md bg-surface-2 p-1">
        {FILTERS.map((key) => ({ key, label: t(`filters.${key}`) })).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              setFilter(tab.key);
              setSelectedMessage(null);
            }}
            aria-pressed={filter === tab.key}
            className={`h-9 rounded-sm px-3.5 text-sm font-medium transition-colors ${
              filter === tab.key ? "bg-surface text-ink shadow-1" : "text-ink-2 hover:text-ink"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        {/* Liste des messages */}
        <Panel className="overflow-hidden p-0">
          {isLoading && <p className="p-6 text-sm text-ink-3">{t("loading")}</p>}
          {!isLoading && messages.length === 0 && (
            <div className="p-8 text-center text-sm text-ink-3">
              {t("empty")}
            </div>
          )}

          <ul className="divide-y divide-line">
            {messages.map((msg) => {
              const status = STATUS_TONES[msg.status] ? msg.status : "NEW";
              const isSelected = selectedMessage?.id === msg.id;
              return (
                <li
                  key={msg.id}
                  onClick={() => {
                    setSelectedMessage(msg);
                    setNoteInput(msg.notes ?? "");
                  }}
                  className={`cursor-pointer p-4 transition-colors hover:bg-surface-2 ${
                    isSelected ? "bg-cobalt-soft/40 border-s-4 border-s-cobalt" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink truncate">{msg.name}</span>
                        {msg.companyName && (
                          <span className="truncate text-xs text-ink-3">
                            · {msg.companyName}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 font-medium text-sm text-ink truncate">
                        {msg.subject ?? t("defaultSubject")}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs text-ink-2">
                        {msg.message}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <Badge tone={STATUS_TONES[status]}>{t(`status.${status}`)}</Badge>
                      <span className="text-[0.7rem] text-ink-3">{formatDate(msg.createdAt)}</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>

        {/* Détail du message sélectionné */}
        <div>
          {selectedMessage ? (
            <Panel className="sticky top-20 p-5">
              <div className="flex items-start justify-between gap-3 border-b border-line pb-4">
                <div>
                  <h3 className="font-display text-xl font-semibold text-ink">{selectedMessage.name}</h3>
                  {selectedMessage.companyName && (
                    <p className="flex items-center gap-1.5 text-sm text-ink-2 mt-0.5">
                      <Building className="size-4 text-ink-3" />
                      {selectedMessage.companyName}
                    </p>
                  )}
                  <p className="text-xs text-ink-3 mt-1">{t("receivedOn", { date: formatDate(selectedMessage.createdAt, true) })}</p>
                </div>
                <Badge tone={STATUS_TONES[selectedMessage.status]}>
                  {t(`status.${selectedMessage.status}`)}
                </Badge>
              </div>

              {/* Coordonnées & Actions directes */}
              <div className="mt-4 grid gap-2 text-sm bg-surface-2 p-3.5 rounded-xl">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-ink-2">
                    <Mail className="size-4 text-ink-3" />
                    {selectedMessage.email}
                  </span>
                  <a
                    href={`mailto:${selectedMessage.email}?subject=${encodeURIComponent(t("mailSubject"))}`}
                    className="text-xs font-semibold text-cobalt hover:underline"
                  >
                    {t("sendEmail")}
                  </a>
                </div>

                {selectedMessage.phone && (
                  <div className="flex items-center justify-between border-t border-line/50 pt-2">
                    <span className="flex items-center gap-2 text-ink-2">
                      <Phone className="size-4 text-ink-3" />
                      {selectedMessage.phone}
                    </span>
                    <a
                      href={`https://wa.me/${selectedMessage.phone.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-mint hover:underline"
                    >
                      {t("whatsapp")}
                    </a>
                  </div>
                )}
              </div>

              {/* Contenu du message */}
              <div className="mt-5">
                <h4 className="text-sm font-medium text-ink-2">{t("message")}</h4>
                <p className="mt-2 rounded-xl border border-line bg-surface p-4 text-sm leading-relaxed text-ink whitespace-pre-wrap">
                  {selectedMessage.message}
                </p>
              </div>

              {/* Modification du statut */}
              <div className="mt-5 border-t border-line pt-4">
                <label className="block text-sm font-medium text-ink-2 mb-2">
                  {t("changeStatus")}
                </label>
                <div className="flex flex-wrap gap-2">
                  {(["NEW", "IN_PROGRESS", "CONTACTED", "ARCHIVED"] as ContactStatus[]).map((st) => (
                    <Button
                      key={st}
                      size="sm"
                      variant={selectedMessage.status === st ? "primary" : "secondary"}
                      onClick={async () => {
                        await updateStatusMutation.mutateAsync({ id: selectedMessage.id, status: st });
                        setSelectedMessage({ ...selectedMessage, status: st });
                      }}
                    >
                      {t(`status.${st}`)}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Notes internes */}
              <div className="mt-5 border-t border-line pt-4">
                <label className="block text-sm font-medium text-ink-2 mb-2">
                  {t("notes")}
                </label>
                <textarea
                  className="w-full rounded-lg border border-line bg-surface p-2.5 text-sm text-ink placeholder:text-ink-3 focus:border-cobalt focus:outline-none"
                  rows={3}
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-2"
                  onClick={async () => {
                    await updateStatusMutation.mutateAsync({ id: selectedMessage.id, notes: noteInput });
                    setSelectedMessage({ ...selectedMessage, notes: noteInput });
                  }}
                >
                  {t("saveNote")}
                </Button>
              </div>
            </Panel>
          ) : (
            <Panel className="p-8 text-center text-sm text-ink-3">
              {t("selectHint")}
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
