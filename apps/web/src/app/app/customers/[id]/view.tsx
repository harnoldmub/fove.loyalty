"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Ban,
  Clock,
  Download,
  MessageCircle,
  Pencil,
  Plus,
  PlusCircle,
  Send,
  SlidersHorizontal,
  Sparkles,
  StickyNote,
  Tag,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  buildWhatsAppLink,
  buildWhatsAppMessage,
  type CustomerSegmentResult,
  type WhatsAppActionKind,
} from "@fove/shared";
import { TransactionList } from "@/components/app/history";
import { CardShareDialog, useWalletEnabled, WalletMessageDialog } from "@/components/app/card-share";
import { Stamps } from "@/components/stamps";
import { useActiveTenant, useCan } from "@/components/app/me-context";
import type { Account, CustomerNote, Program, Transaction } from "@/components/app/types";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, DialogContent, DialogRoot } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Badge, ErrorNote, Panel, Skeleton } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { formatDate, formatNumber, newIdempotencyKey, unitLabel } from "@/lib/utils";

interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  externalRef: string | null;
  source: string;
  tags: string[];
  notes: string | null;
  totalVisits: number;
  totalSpend: string | number;
  lastVisitAt: string | null;
  segment?: CustomerSegmentResult;
  customerNotes?: CustomerNote[];
  marketingEmailConsent: boolean;
  marketingSmsConsent: boolean;
  termsAcceptedAt: string | null;
  anonymizedAt: string | null;
  createdAt: string;
  accounts: {
    id: string;
    programId: string;
    balance: number;
    cardNumber: string;
    cardUrl?: string | null;
    status: Account["status"];
    program: { id: string; name: string; mode: Program["mode"]; stampsTarget: number };
  }[];
}

const STATUS: Record<Account["status"], { label: string; tone: "mint" | "danger" | "stamp" | "neutral" }> = {
  ACTIVE: { label: "Active", tone: "mint" },
  BLOCKED: { label: "Bloquée", tone: "danger" },
  PENDING_VERIFICATION: { label: "À valider", tone: "stamp" },
  CLOSED: { label: "Fermée", tone: "neutral" },
};

function AdjustDialog({ accountId, mode }: { accountId: string; mode: Program["mode"] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <DialogRoot open={open} onOpenChange={setOpen}>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <SlidersHorizontal /> Ajuster
      </Button>
      <DialogContent title="Ajuster le solde" description="Un nombre positif ajoute, un nombre négatif retire. Le motif est conservé dans l’historique.">
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await api.post("/app/transactions/adjust", { accountId, delta: Number(delta), reason, idempotencyKey: newIdempotencyKey("adj") });
              toast.success("Solde ajusté");
              qc.invalidateQueries();
              setOpen(false);
              setDelta("");
              setReason("");
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {error && <ErrorNote>{error}</ErrorNote>}
          <Field label={`Nombre de ${unitLabel(mode)}`}>
            {(p) => <Input {...p} inputMode="numeric" value={delta} onChange={(e) => setDelta(e.target.value.replace(/[^\d-]/g, ""))} />}
          </Field>
          <Field label="Motif">
            {(p) => <Input {...p} value={reason} onChange={(e) => setReason(e.target.value)} />}
          </Field>
          <Button type="submit" loading={busy} disabled={!delta || delta === "-" || Number(delta) === 0 || reason.trim().length < 3}>
            Enregistrer l’ajustement
          </Button>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}

function EditDialog({ customer }: { customer: Customer }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    firstName: customer.firstName,
    lastName: customer.lastName,
    phone: customer.phone ?? "",
    email: customer.email ?? "",
    marketingEmailConsent: customer.marketingEmailConsent,
    marketingSmsConsent: customer.marketingSmsConsent,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <DialogRoot open={open} onOpenChange={setOpen}>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Pencil /> Modifier
      </Button>
      <DialogContent title="Modifier le client">
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await api.patch(`/app/customers/${customer.id}`, { ...form, phone: form.phone || null, email: form.email || null });
              toast.success("Client mis à jour");
              qc.invalidateQueries({ queryKey: ["customer", customer.id] });
              setOpen(false);
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {error && <ErrorNote>{error}</ErrorNote>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Prénom">{(p) => <Input {...p} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />}</Field>
            <Field label="Nom">{(p) => <Input {...p} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />}</Field>
          </div>
          <Field label="Téléphone">{(p) => <Input {...p} type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />}</Field>
          <Field label="Email">{(p) => <Input {...p} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}</Field>
          <Checkbox checked={form.marketingSmsConsent} onChange={(e) => setForm({ ...form, marketingSmsConsent: e.target.checked })} label="Accepte les offres par SMS ou WhatsApp" />
          <Checkbox checked={form.marketingEmailConsent} onChange={(e) => setForm({ ...form, marketingEmailConsent: e.target.checked })} label="Accepte les offres par email" />
          <Button type="submit" loading={busy}>Enregistrer</Button>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}

function AccountPanel({ accountId }: { accountId: string }) {
  const qc = useQueryClient();
  const canWrite = useCan("customers.write");
  const canAdjust = useCan("transactions.reverse");
  const canMessage = useCan("programs.write");
  const wallet = useWalletEnabled();
  const { data: account } = useQuery({ queryKey: ["account", accountId], queryFn: () => api.get<Account>(`/app/accounts/${accountId}`) });
  const { data: history } = useQuery({
    queryKey: ["account-history", accountId],
    queryFn: () => api.get<{ data: Transaction[] }>(`/app/transactions?accountId=${accountId}&limit=50`),
  });
  if (!account) return <Skeleton className="h-48" />;
  const status = STATUS[account.status];
  const unit = unitLabel(account.program.mode, account.balance);

  return (
    <Panel className="overflow-hidden">
      <div className="grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:p-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl font-semibold">{account.program.name}</h2>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          <p className="mt-1 text-sm text-ink-3 tabular">Carte {account.cardNumber} · créée le {formatDate(account.createdAt)}</p>
        </div>
        <p className="font-display text-4xl font-semibold tabular sm:text-right">
          {formatNumber(account.balance)} <span className="text-lg font-normal text-ink-3">{unit}</span>
        </p>
        {account.program.mode === "STAMPS" && (
          <div className="max-w-sm sm:col-span-2">
            <Stamps count={account.balance} target={account.program.stampsTarget} reward={account.rewards[0]?.name} size="sm" />
          </div>
        )}
      </div>
      {canWrite && account.status !== "CLOSED" && (
        <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3 sm:px-6">
          <CardShareDialog accountId={account.id} />
          {wallet && canMessage && account.status === "ACTIVE" && <WalletMessageDialog accountId={account.id} />}
          {canAdjust && <AdjustDialog accountId={account.id} mode={account.program.mode} />}
          {account.status === "BLOCKED" || account.status === "PENDING_VERIFICATION" ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                await api.post(`/app/accounts/${account.id}/status`, { status: "ACTIVE" }).catch((e) => toast.error(errorMessage(e)));
                qc.invalidateQueries({ queryKey: ["account", accountId] });
              }}
            >
              Activer la carte
            </Button>
          ) : (
            <ConfirmDialog
              trigger={
                <Button variant="ghost" size="sm">
                  <Ban /> Bloquer
                </Button>
              }
              title="Bloquer cette carte ?"
              consequence="La carte ne pourra plus gagner de points ni utiliser de récompense tant qu’elle n’est pas réactivée. Le solde est conservé."
              confirmLabel="Bloquer la carte"
              destructive
              onConfirm={async () => {
                await api.post(`/app/accounts/${account.id}/status`, { status: "BLOCKED" });
                qc.invalidateQueries({ queryKey: ["account", accountId] });
                toast.success("Carte bloquée");
              }}
            />
          )}
        </div>
      )}
      <div className="border-t border-line">
        <h3 className="px-5 pt-4 text-sm font-medium text-ink-2 sm:px-6">Historique</h3>
        {history?.data.length ? <TransactionList items={history.data} /> : <p className="px-5 py-4 text-sm text-ink-3 sm:px-6">Aucune opération pour l’instant.</p>}
      </div>
    </Panel>
  );
}

/** Composant d'action WhatsApp proactif Sidely + Matchkwata */
function WhatsAppActionsPanel({ customer, tenantName }: { customer: Customer; tenantName: string }) {
  const [actionKind, setActionKind] = useState<WhatsAppActionKind>("REENGAGEMENT");
  const firstAccount = customer.accounts[0];
  const balance = firstAccount?.balance ?? 0;
  const unit = firstAccount ? unitLabel(firstAccount.program.mode, balance) : "points";
  const target = firstAccount?.program.stampsTarget ?? 10;

  const cardUrl = firstAccount?.cardUrl ?? "";

  const message = useMemo(() => {
    return buildWhatsAppMessage({
      kind: actionKind,
      customerFirstName: customer.firstName,
      businessName: tenantName,
      balance,
      unitLabel: unit,
      target,
      cardUrl,
    });
  }, [actionKind, customer.firstName, tenantName, balance, unit, target, cardUrl]);

  const waLink = buildWhatsAppLink(customer.phone, message);

  return (
    <Panel className="p-5">
      <h2 className="mb-2 font-display text-base font-semibold flex items-center gap-1.5 text-mint">
        <MessageCircle className="size-4" /> Relance & Action WhatsApp
      </h2>
      <p className="text-xs text-ink-3 mb-3">
        Actionnez directement la relation client avec des messages pré-rédigés et contextualisés.
      </p>

      <div className="grid gap-3">
        <Field label="Modèle de message">
          {(p) => (
            <Select {...p} value={actionKind} onChange={(e) => setActionKind(e.target.value as WhatsAppActionKind)} className="text-xs">
              <option value="REENGAGEMENT">💌 Relance client dormant / en risque</option>
              <option value="NEAR_REWARD">🎉 Proche d&apos;une récompense (palier)</option>
              <option value="CARD_SHARE">📱 Partage du lien de carte</option>
              <option value="VIP_THANK_YOU">🌟 Remerciement fidélité VIP</option>
            </Select>
          )}
        </Field>

        <div className="rounded-md bg-subtle p-2.5 text-xs text-ink-2 whitespace-pre-line border border-line">
          {message}
        </div>

        {waLink ? (
          <Button asChild size="sm" className="w-full bg-[#25D366] hover:bg-[#1EBE5D] text-white">
            <a href={waLink} target="_blank" rel="noopener noreferrer">
              <Send className="size-3.5" /> Ouvrir WhatsApp
            </a>
          </Button>
        ) : (
          <p className="text-xs text-stamp-ink dark:text-stamp">
            Renseignez un numéro de téléphone pour envoyer directement ce message.
          </p>
        )}
      </div>
    </Panel>
  );
}

/** Gestion des tags et notes vendeurs Sidely */
function NotesAndTagsPanel({ customer }: { customer: Customer }) {
  const qc = useQueryClient();
  const [newTag, setNewTag] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const tags = customer.tags || [];
  const notes = customer.customerNotes || [];

  const handleAddTag = async (tagToAdd: string) => {
    const clean = tagToAdd.trim().replace(/^#/, "");
    if (!clean || tags.includes(clean)) return;
    const updated = [...tags, clean];
    try {
      await api.patch(`/app/customers/${customer.id}/tags`, { tags: updated });
      qc.invalidateQueries({ queryKey: ["customer", customer.id] });
      setNewTag("");
      toast.success(`Tag #${clean} ajouté`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    const updated = tags.filter((t) => t !== tagToRemove);
    try {
      await api.patch(`/app/customers/${customer.id}/tags`, { tags: updated });
      qc.invalidateQueries({ queryKey: ["customer", customer.id] });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteContent.trim()) return;
    setSavingNote(true);
    try {
      await api.post(`/app/customers/${customer.id}/notes`, { content: noteContent.trim() });
      toast.success("Note ajoutée");
      setNoteContent("");
      qc.invalidateQueries({ queryKey: ["customer", customer.id] });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <Panel className="p-5">
      {/* Tags */}
      <h2 className="mb-2 font-display text-base font-semibold flex items-center gap-1.5 text-ink">
        <Tag className="size-4 text-cobalt" /> Tags & Segments
      </h2>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-sm bg-surface px-2 py-0.5 text-xs font-medium text-ink shadow-sm">
            #{t}
            <button
              type="button"
              onClick={() => handleRemoveTag(t)}
              className="text-ink-3 hover:text-danger ml-0.5"
              aria-label={`Supprimer ${t}`}
            >
              ×
            </button>
          </span>
        ))}
        {tags.length === 0 && <span className="text-xs text-ink-3">Aucun tag pour le moment.</span>}
      </div>
      <div className="flex gap-1.5 mb-5">
        <Input
          aria-label="Nouveau tag"
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAddTag(newTag);
            }
          }}
          className="text-xs h-8"
        />
        <Button aria-label="Ajouter le tag" size="sm" variant="secondary" onClick={() => handleAddTag(newTag)} className="h-8 text-xs">
          <Plus className="size-3" />
        </Button>
      </div>

      {/* Mémos vendeurs Sidely */}
      <h2 className="mb-2 font-display text-base font-semibold flex items-center gap-1.5 text-ink">
        <StickyNote className="size-4 text-stamp" /> Notes de l’équipe
      </h2>
      <form onSubmit={handleAddNote} className="grid gap-2 mb-4">
        <Input
          aria-label="Nouvelle note"
          value={noteContent}
          onChange={(e) => setNoteContent(e.target.value)}
          className="text-xs"
        />
        <Button type="submit" size="sm" loading={savingNote} className="h-7 text-xs justify-self-end">
          Enregistrer la note
        </Button>
      </form>

      {notes.length > 0 ? (
        <div className="grid gap-2 max-h-52 overflow-y-auto pr-1">
          {notes.map((n) => (
            <div key={n.id} className="rounded-sm bg-subtle p-2 text-xs border border-line">
              <div className="flex items-center justify-between text-ink-3 text-[11px] mb-1">
                <span className="font-medium text-ink">{n.authorName}</span>
                <span>{formatDate(n.createdAt)}</span>
              </div>
              <p className="text-ink-2">{n.content}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-ink-3">Aucun mémo saisi pour ce client.</p>
      )}
    </Panel>
  );
}

export function CustomerDetail({ id }: { id: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const tenant = useActiveTenant();
  const canWrite = useCan("customers.write");
  const canDelete = useCan("customers.delete");
  const canExport = useCan("customers.export");
  const { data: customer, error } = useQuery({ queryKey: ["customer", id], queryFn: () => api.get<Customer>(`/app/customers/${id}`) });
  const { data: programs = [] } = useQuery({ queryKey: ["programs"], queryFn: () => api.get<Program[]>("/app/programs") });
  const [enrollProgram, setEnrollProgram] = useState("");

  if (error) return <ErrorNote>{errorMessage(error)}</ErrorNote>;
  if (!customer) return <Skeleton className="h-96" />;
  const missing = programs.filter((p) => p.active && !customer.accounts.some((a) => a.programId === p.id));
  const segment = customer.segment;

  const exportData = async () => {
    try {
      const data = await api.get<unknown>(`/app/customers/${id}/export`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `client-${id}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <>
      <Link href="/app/customers" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Clients
      </Link>
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl font-semibold">
              {customer.firstName} {customer.lastName}
            </h1>
            {segment && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  segment.segment === "VIP"
                    ? "bg-cobalt/15 text-cobalt"
                    : segment.segment === "AT_RISK"
                    ? "bg-stamp-soft text-stamp-ink dark:text-stamp"
                    : segment.segment === "NEW"
                    ? "bg-mint/15 text-mint"
                    : "bg-surface text-ink-2 border border-line"
                }`}
                title={segment.description}
              >
                {segment.segment === "VIP" && <Sparkles className="size-3" />}
                {segment.label}
              </span>
            )}
          </div>
          <p className="mt-1 text-ink-2">
            {[customer.phone, customer.email, customer.externalRef && `Réf. ${customer.externalRef}`].filter(Boolean).join(" · ") || "Sans coordonnées"}
          </p>
          {customer.anonymizedAt && <Badge className="mt-2">Anonymisé le {formatDate(customer.anonymizedAt)}</Badge>}
        </div>
        {!customer.anonymizedAt && (
          <div className="flex flex-wrap gap-2">
            {canWrite && <EditDialog key={customer.firstName + customer.phone} customer={customer} />}
            {canExport && (
              <Button variant="ghost" size="sm" onClick={exportData}>
                <Download /> Exporter ses données
              </Button>
            )}
            {canDelete && (
              <ConfirmDialog
                trigger={
                  <Button variant="ghost" size="sm" className="text-danger">
                    <Trash2 /> Effacer
                  </Button>
                }
                title="Effacer les données de ce client ?"
                consequence="Nom, téléphone et email sont définitivement effacés et ses cartes fermées. L’historique des points reste, sans aucune donnée identifiante."
                confirmLabel="Effacer définitivement"
                destructive
                onConfirm={async () => {
                  try {
                    await api.post(`/app/customers/${id}/anonymize`);
                    toast.success("Données du client effacées");
                    qc.invalidateQueries({ queryKey: ["customers"] });
                    router.push("/app/customers");
                  } catch (e) {
                    toast.error(errorMessage(e));
                  }
                }}
              />
            )}
          </div>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        {/* Colonne gauche : cartes et historique */}
        <div className="grid content-start gap-5">
          {customer.accounts.length === 0 && <p className="text-ink-2">Ce client n’a pas encore de carte.</p>}
          {customer.accounts.map((a) => (
            <AccountPanel key={a.id} accountId={a.id} />
          ))}
          {canWrite && !customer.anonymizedAt && missing.length > 0 && (
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Ajouter une carte" className="min-w-56 flex-1">
                {(p) => (
                  <Select {...p} value={enrollProgram} onChange={(e) => setEnrollProgram(e.target.value)}>
                    <option value="">Choisir un programme</option>
                    {missing.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                )}
              </Field>
              <Button
                variant="secondary"
                disabled={!enrollProgram}
                onClick={async () => {
                  try {
                    await api.post("/app/accounts", { customerId: id, programId: enrollProgram });
                    toast.success("Carte créée");
                    setEnrollProgram("");
                    qc.invalidateQueries({ queryKey: ["customer", id] });
                  } catch (e) {
                    toast.error(errorMessage(e));
                  }
                }}
              >
                <PlusCircle /> Créer la carte
              </Button>
            </div>
          )}
        </div>

        {/* Colonne droite : Intelligence RFM, Relances WhatsApp, Tags & Notes */}
        <div className="grid content-start gap-5">
          {/* Fiche RFM Sidely */}
          <Panel className="p-5 text-sm">
            <h2 className="mb-3 font-display text-base font-semibold flex items-center gap-1.5">
              <Clock className="size-4 text-cobalt" /> Comportement & Récence
            </h2>
            <dl className="grid gap-2.5">
              <div className="flex justify-between gap-2">
                <dt className="text-ink-2">Statut fidélité</dt>
                <dd className="font-semibold text-ink">{segment?.label ?? "Actif"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-2">Visites totales</dt>
                <dd className="tabular font-medium">{customer.totalVisits || customer.accounts.reduce((sum, a) => sum + a.balance, 0)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-2">Dernier passage</dt>
                <dd>{customer.lastVisitAt ? formatDate(customer.lastVisitAt) : "Jamais"}</dd>
              </div>
              {segment?.daysSinceLastVisit !== null && segment?.daysSinceLastVisit !== undefined && (
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-2">Inactivité</dt>
                  <dd className="tabular text-ink-3">{segment.daysSinceLastVisit} jour(s)</dd>
                </div>
              )}
            </dl>
            {segment?.suggestedAction && (
              <div className="mt-3 rounded-md bg-subtle p-2.5 text-xs text-ink-2 border border-line">
                <span className="font-semibold text-ink">Action conseillée :</span> {segment.suggestedAction}
              </div>
            )}
          </Panel>

          {/* Action WhatsApp prompte */}
          <WhatsAppActionsPanel customer={customer} tenantName={tenant?.name || "notre boutique"} />

          {/* Tags et Notes vendeurs */}
          <NotesAndTagsPanel customer={customer} />

          {/* Consentements RGPD */}
          <Panel className="p-5 text-sm">
            <h2 className="mb-3 font-display text-base font-semibold">Consentements</h2>
            <dl className="grid gap-2.5">
              <div className="flex justify-between gap-2"><dt className="text-ink-2">Conditions du programme</dt><dd>{customer.termsAcceptedAt ? formatDate(customer.termsAcceptedAt) : "Non recueilli"}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-ink-2">Offres SMS / WhatsApp</dt><dd>{customer.marketingSmsConsent ? "Oui" : "Non"}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-ink-2">Offres par email</dt><dd>{customer.marketingEmailConsent ? "Oui" : "Non"}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-ink-2">Client depuis</dt><dd>{formatDate(customer.createdAt)}</dd></div>
            </dl>
          </Panel>
        </div>
      </div>
    </>
  );
}
