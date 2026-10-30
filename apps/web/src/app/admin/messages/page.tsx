"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Mail, MessageSquare, Phone, Building, Calendar, CheckCircle2, Clock, Archive, Sparkles, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, PageHeader, Panel } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
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

const STATUS_LABELS: Record<ContactStatus, { label: string; tone: "cobalt" | "stamp" | "mint" | "neutral" }> = {
  NEW: { label: "Nouveau", tone: "cobalt" },
  IN_PROGRESS: { label: "En cours", tone: "stamp" },
  CONTACTED: { label: "Traité", tone: "mint" },
  ARCHIVED: { label: "Archivé", tone: "neutral" },
};

export default function AdminMessagesPage() {
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
      toast.success("Message mis à jour");
    },
    onError: (err) => {
      toast.error(errorMessage(err));
    },
  });

  const newCount = messages.filter((m) => m.status === "NEW").length;

  return (
    <>
      <PageHeader
        title="Messages & Demandes"
        description="Leads entrants, demandes de démonstrations et messages reçus depuis le site web."
        actions={
          newCount > 0 ? (
            <Badge tone="cobalt" className="px-3 py-1 text-sm font-semibold">
              {newCount} nouveau{newCount > 1 ? "x" : ""}
            </Badge>
          ) : null
        }
      />

      {/* Onglets de filtre de statut */}
      <div className="mb-6 flex flex-wrap gap-2">
        {[
          { key: "ALL", label: "Tous les messages" },
          { key: "NEW", label: "Nouveaux" },
          { key: "IN_PROGRESS", label: "En cours de traitement" },
          { key: "CONTACTED", label: "Contactés / Traités" },
          { key: "ARCHIVED", label: "Archivés" },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              setFilter(tab.key);
              setSelectedMessage(null);
            }}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
              filter === tab.key
                ? "bg-ink text-surface shadow-xs"
                : "bg-surface-2 text-ink-2 hover:bg-surface-3 hover:text-ink"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        {/* Liste des messages */}
        <Panel className="overflow-hidden p-0">
          {isLoading && <p className="p-6 text-sm text-ink-3">Chargement des messages...</p>}
          {!isLoading && messages.length === 0 && (
            <div className="p-8 text-center text-sm text-ink-3">
              Aucun message trouvé pour ce filtre.
            </div>
          )}

          <ul className="divide-y divide-line">
            {messages.map((msg) => {
              const statusCfg = STATUS_LABELS[msg.status] ?? STATUS_LABELS.NEW;
              const isSelected = selectedMessage?.id === msg.id;
              return (
                <li
                  key={msg.id}
                  onClick={() => {
                    setSelectedMessage(msg);
                    setNoteInput(msg.notes ?? "");
                  }}
                  className={`cursor-pointer p-4 transition-colors hover:bg-surface-2 ${
                    isSelected ? "bg-cobalt-soft/40 border-l-4 border-l-cobalt" : ""
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
                        {msg.subject ?? "Demande d’information"}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs text-ink-2">
                        {msg.message}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <Badge tone={statusCfg.tone}>{statusCfg.label}</Badge>
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
                  <p className="text-xs text-ink-3 mt-1">Reçu le {formatDate(selectedMessage.createdAt, true)}</p>
                </div>
                <Badge tone={STATUS_LABELS[selectedMessage.status]?.tone}>
                  {STATUS_LABELS[selectedMessage.status]?.label}
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
                    href={`mailto:${selectedMessage.email}?subject=Suite à votre demande FOVE`}
                    className="text-xs font-semibold text-cobalt hover:underline"
                  >
                    Envoyer un email ›
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
                      className="text-xs font-semibold text-emerald-600 hover:underline"
                    >
                      WhatsApp direct ›
                    </a>
                  </div>
                )}
              </div>

              {/* Contenu du message */}
              <div className="mt-5">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-3">Message</h4>
                <p className="mt-2 rounded-xl border border-line bg-surface p-4 text-sm leading-relaxed text-ink whitespace-pre-wrap">
                  {selectedMessage.message}
                </p>
              </div>

              {/* Modification du statut */}
              <div className="mt-5 border-t border-line pt-4">
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink-3 mb-2">
                  Changer le statut
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
                      {STATUS_LABELS[st].label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Notes internes */}
              <div className="mt-5 border-t border-line pt-4">
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink-3 mb-2">
                  Notes internes (équipe commerciale)
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
                  Enregistrer la note
                </Button>
              </div>
            </Panel>
          ) : (
            <Panel className="p-8 text-center text-sm text-ink-3">
              Sélectionnez un message dans la liste pour lire son détail et répondre.
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
