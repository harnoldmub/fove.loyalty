"use client";

import Link from "next/link";
import { useAppRouter } from "@/lib/navigation-progress";
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
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { buildWhatsAppLink, type CustomerSegmentResult, type WhatsAppActionKind } from "@fove/shared";
import { TransactionList } from "@/components/app/history";
import { useWhatsAppMessage } from "@/components/app/use-whatsapp-message";
import { CardShareDialog, useWalletEnabled, WalletMessageDialog } from "@/components/app/card-share";
import { Stamps } from "@/components/stamps";
import { useActiveTenant, useCan } from "@/components/app/me-context";
import type { Account, CustomerNote, Program, Transaction } from "@/components/app/types";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, DialogContent, DialogRoot } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Badge, ErrorNote, Panel, Skeleton } from "@/components/ui/misc";
import { api, useErrorMessage } from "@/lib/api";
import { useUnitLabel } from "@/lib/labels";
import { formatDate, formatNumber, newIdempotencyKey } from "@/lib/utils";

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

const STATUS_TONE: Record<Account["status"], "mint" | "danger" | "stamp" | "neutral"> = {
  ACTIVE: "mint",
  BLOCKED: "danger",
  PENDING_VERIFICATION: "stamp",
  CLOSED: "neutral",
};

const WHATSAPP_KINDS: WhatsAppActionKind[] = ["REENGAGEMENT", "NEAR_REWARD", "CARD_SHARE", "VIP_THANK_YOU"];

function AdjustDialog({
  accountId,
  mode,
  currentBalance,
  target,
}: {
  accountId: string;
  mode: Program["mode"];
  currentBalance: number;
  target?: number;
}) {
  const toErrorMessage = useErrorMessage();
  const t = useTranslations("app.customer.adjust");
  const unitLabel = useUnitLabel();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isStamps = mode === "STAMPS";
  const stampsLimit = target ?? 10;
  const maxAddable = isStamps ? Math.max(0, stampsLimit - currentBalance) : Infinity;
  const isFull = isStamps && currentBalance >= stampsLimit;

  return (
    <DialogRoot open={open} onOpenChange={setOpen}>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <SlidersHorizontal /> {t("button")}
      </Button>
      <DialogContent
        title={t("title")}
        description={
          isStamps
            ? t("stampsDescription", { current: Math.min(currentBalance, stampsLimit), target: stampsLimit })
            : t("pointsDescription")
        }
      >
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              let numDelta = Number(delta);
              if (isStamps && numDelta > 0) {
                numDelta = Math.min(numDelta, maxAddable);
              }
              await api.post("/app/transactions/adjust", {
                accountId,
                delta: numDelta,
                reason,
                idempotencyKey: newIdempotencyKey("adj"),
              });
              toast.success(
                isStamps && Number(delta) > maxAddable
                  ? t("cappedToast", { target: stampsLimit })
                  : t("toast"),
              );
              qc.invalidateQueries();
              setOpen(false);
              setDelta("");
              setReason("");
            } catch (err) {
              setError(toErrorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {error && <ErrorNote>{error}</ErrorNote>}
          {isStamps && isFull && (
            <div className="rounded-md bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
              {t("full", { target: stampsLimit })}
            </div>
          )}
          <Field
            label={t("amountLabel", { unit: unitLabel(mode) })}
            hint={
              isStamps
                ? !isFull
                  ? t("maxHint", { count: maxAddable })
                  : t("removeOnly")
                : undefined
            }
          >
            {(p) => (
              <Input
                {...p}
                inputMode="numeric"
                value={delta}
                onChange={(e) => setDelta(e.target.value.replace(/[^\d-]/g, ""))}
              />
            )}
          </Field>
          <Field label={t("reason")}>
            {(p) => <Input {...p} value={reason} onChange={(e) => setReason(e.target.value)} />}
          </Field>
          <Button
            type="submit"
            loading={busy}
            disabled={
              !delta ||
              delta === "-" ||
              Number(delta) === 0 ||
              (isStamps && isFull && Number(delta) > 0) ||
              reason.trim().length < 3
            }
          >
            {t("submit")}
          </Button>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}

function EditDialog({ customer }: { customer: Customer }) {
  const toErrorMessage = useErrorMessage();
  const t = useTranslations("app.customer.edit");
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
        <Pencil /> {t("button")}
      </Button>
      <DialogContent title={t("title")}>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await api.patch(`/app/customers/${customer.id}`, { ...form, phone: form.phone || null, email: form.email || null });
              toast.success(t("toast"));
              qc.invalidateQueries({ queryKey: ["customer", customer.id] });
              setOpen(false);
            } catch (err) {
              setError(toErrorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {error && <ErrorNote>{error}</ErrorNote>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("firstName")}>{(p) => <Input {...p} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />}</Field>
            <Field label={t("lastName")}>{(p) => <Input {...p} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />}</Field>
          </div>
          <Field label={t("phone")}>{(p) => <Input {...p} type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />}</Field>
          <Field label={t("email")}>{(p) => <Input {...p} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}</Field>
          <Checkbox checked={form.marketingSmsConsent} onChange={(e) => setForm({ ...form, marketingSmsConsent: e.target.checked })} label={t("smsConsent")} />
          <Checkbox checked={form.marketingEmailConsent} onChange={(e) => setForm({ ...form, marketingEmailConsent: e.target.checked })} label={t("emailConsent")} />
          <Button type="submit" loading={busy}>{t("submit")}</Button>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}

function AccountPanel({ accountId }: { accountId: string }) {
  const toErrorMessage = useErrorMessage();
  const t = useTranslations("app.customer.account");
  const unitLabel = useUnitLabel();
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
  const tone = STATUS_TONE[account.status];
  const unit = unitLabel(account.program.mode, account.balance);

  return (
    <Panel className="overflow-hidden">
      <div className="grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:p-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl font-semibold">{account.program.name}</h2>
            <Badge tone={tone}>{t(`status.${account.status}`)}</Badge>
          </div>
          <p className="mt-1 text-sm text-ink-3 tabular">{t.rich("meta", { number: account.cardNumber, date: formatDate(account.createdAt), card: (c) => <span dir="ltr">{c}</span> })}</p>
        </div>
        <p className="font-display text-4xl font-semibold tabular sm:text-end">
          {formatNumber(account.program.mode === "STAMPS" ? Math.min(account.balance, account.program.stampsTarget) : account.balance)} <span className="text-lg font-normal text-ink-3">{unit}</span>
        </p>
        {account.program.mode === "STAMPS" && (
          <div className="max-w-sm sm:col-span-2">
            <Stamps count={Math.min(account.balance, account.program.stampsTarget)} target={account.program.stampsTarget} reward={account.rewards[0]?.name} size="sm" />
          </div>
        )}
      </div>
      {canWrite && account.status !== "CLOSED" && (
        <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3 sm:px-6">
          <CardShareDialog accountId={account.id} />
          {wallet && canMessage && account.status === "ACTIVE" && <WalletMessageDialog accountId={account.id} />}
          {canAdjust && (
            <AdjustDialog
              accountId={account.id}
              mode={account.program.mode}
              currentBalance={account.balance}
              target={account.program.stampsTarget}
            />
          )}
          {account.status === "BLOCKED" || account.status === "PENDING_VERIFICATION" ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                await api.post(`/app/accounts/${account.id}/status`, { status: "ACTIVE" }).catch((e) => toast.error(toErrorMessage(e)));
                qc.invalidateQueries({ queryKey: ["account", accountId] });
              }}
            >
              {t("activate")}
            </Button>
          ) : (
            <ConfirmDialog
              trigger={
                <Button variant="ghost" size="sm">
                  <Ban /> {t("block")}
                </Button>
              }
              title={t("blockTitle")}
              consequence={t("blockConsequence")}
              confirmLabel={t("blockConfirm")}
              destructive
              onConfirm={async () => {
                await api.post(`/app/accounts/${account.id}/status`, { status: "BLOCKED" });
                qc.invalidateQueries({ queryKey: ["account", accountId] });
                toast.success(t("blocked"));
              }}
            />
          )}
        </div>
      )}
      <div className="border-t border-line">
        <h3 className="px-5 pt-4 text-sm font-medium text-ink-2 sm:px-6">{t("history")}</h3>
        {history?.data.length ? <TransactionList items={history.data} /> : <p className="px-5 py-4 text-sm text-ink-3 sm:px-6">{t("noHistory")}</p>}
      </div>
    </Panel>
  );
}

/** Composant d'action WhatsApp proactif Sidely + Matchkwata */
function WhatsAppActionsPanel({ customer, tenantName }: { customer: Customer; tenantName: string }) {
  const t = useTranslations("app.customer.whatsapp");
  const unitLabel = useUnitLabel();
  const buildMessage = useWhatsAppMessage();
  const [actionKind, setActionKind] = useState<WhatsAppActionKind>("REENGAGEMENT");
  const firstAccount = customer.accounts[0];
  const balance = firstAccount?.balance ?? 0;
  const mode = firstAccount?.program.mode ?? "POINTS";
  const unit = unitLabel(mode, balance);
  const target = firstAccount?.program.stampsTarget ?? 10;

  const cardUrl = firstAccount?.cardUrl ?? "";

  const message = useMemo(
    () => buildMessage(actionKind, { firstName: customer.firstName, store: tenantName, balance, unit, mode, target, cardUrl }),
    [buildMessage, actionKind, customer.firstName, tenantName, balance, unit, mode, target, cardUrl],
  );

  const waLink = buildWhatsAppLink(customer.phone, message);

  return (
    <Panel className="p-5">
      <h2 className="mb-2 font-display text-base font-semibold flex items-center gap-1.5 text-mint">
        <MessageCircle className="size-4" /> {t("title")}
      </h2>
      <p className="text-xs text-ink-3 mb-3">
        {t("description")}
      </p>

      <div className="grid gap-3">
        <Field label={t("template")}>
          {(p) => (
            <Select {...p} value={actionKind} onChange={(e) => setActionKind(e.target.value as WhatsAppActionKind)} className="text-xs">
              {WHATSAPP_KINDS.map((kind) => (
                <option key={kind} value={kind}>{t(`templates.${kind}`)}</option>
              ))}
            </Select>
          )}
        </Field>

        <div className="rounded-md bg-subtle p-2.5 text-xs text-ink-2 whitespace-pre-line border border-line">
          {message}
        </div>

        {waLink ? (
          <Button asChild size="sm" className="w-full bg-[#25D366] hover:bg-[#1EBE5D] text-white">
            <a href={waLink} target="_blank" rel="noopener noreferrer">
              <Send className="size-3.5" /> {t("open")}
            </a>
          </Button>
        ) : (
          <p className="text-xs text-stamp-ink dark:text-stamp">
            {t("noPhone")}
          </p>
        )}
      </div>
    </Panel>
  );
}

/** Gestion des tags et notes vendeurs Sidely */
function NotesAndTagsPanel({ customer }: { customer: Customer }) {
  const toErrorMessage = useErrorMessage();
  const t = useTranslations("app.customer.notes");
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
      toast.success(t("tagAdded", { tag: clean }));
    } catch (err) {
      toast.error(toErrorMessage(err));
    }
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    const updated = tags.filter((tag) => tag !== tagToRemove);
    try {
      await api.patch(`/app/customers/${customer.id}/tags`, { tags: updated });
      qc.invalidateQueries({ queryKey: ["customer", customer.id] });
    } catch (err) {
      toast.error(toErrorMessage(err));
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteContent.trim()) return;
    setSavingNote(true);
    try {
      await api.post(`/app/customers/${customer.id}/notes`, { content: noteContent.trim() });
      toast.success(t("noteAdded"));
      setNoteContent("");
      qc.invalidateQueries({ queryKey: ["customer", customer.id] });
    } catch (err) {
      toast.error(toErrorMessage(err));
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <Panel className="p-5">
      {/* Tags */}
      <h2 className="mb-2 font-display text-base font-semibold flex items-center gap-1.5 text-ink">
        <Tag className="size-4 text-cobalt" /> {t("tagsTitle")}
      </h2>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {tags.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-sm bg-surface px-2 py-0.5 text-xs font-medium text-ink shadow-sm">
            #{tag}
            <button
              type="button"
              onClick={() => handleRemoveTag(tag)}
              className="text-ink-3 hover:text-danger ms-0.5"
              aria-label={t("removeTag", { tag })}
            >
              ×
            </button>
          </span>
        ))}
        {tags.length === 0 && <span className="text-xs text-ink-3">{t("noTags")}</span>}
      </div>
      <div className="flex gap-1.5 mb-5">
        <Input
          aria-label={t("newTag")}
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
        <Button aria-label={t("addTag")} size="sm" variant="secondary" onClick={() => handleAddTag(newTag)} className="h-8 text-xs">
          <Plus className="size-3" />
        </Button>
      </div>

      {/* Mémos vendeurs Sidely */}
      <h2 className="mb-2 font-display text-base font-semibold flex items-center gap-1.5 text-ink">
        <StickyNote className="size-4 text-stamp" /> {t("notesTitle")}
      </h2>
      <form onSubmit={handleAddNote} className="grid gap-2 mb-4">
        <Input
          aria-label={t("newNote")}
          value={noteContent}
          onChange={(e) => setNoteContent(e.target.value)}
          className="text-xs"
        />
        <Button type="submit" size="sm" loading={savingNote} className="h-7 text-xs justify-self-end">
          {t("saveNote")}
        </Button>
      </form>

      {notes.length > 0 ? (
        <div className="grid gap-2 max-h-52 overflow-y-auto pe-1">
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
        <p className="text-xs text-ink-3">{t("noNotes")}</p>
      )}
    </Panel>
  );
}

export function CustomerDetail({ id }: { id: string }) {
  const toErrorMessage = useErrorMessage();
  const t = useTranslations("app.customer");
  const ts = useTranslations("app.segment");
  const router = useAppRouter();
  const qc = useQueryClient();
  const tenant = useActiveTenant();
  const canWrite = useCan("customers.write");
  const canDelete = useCan("customers.delete");
  const canExport = useCan("customers.export");
  const { data: customer, error } = useQuery({ queryKey: ["customer", id], queryFn: () => api.get<Customer>(`/app/customers/${id}`) });
  const { data: programs = [] } = useQuery({ queryKey: ["programs"], queryFn: () => api.get<Program[]>("/app/programs") });
  const [enrollProgram, setEnrollProgram] = useState("");

  if (error) return <ErrorNote>{toErrorMessage(error)}</ErrorNote>;
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
      toast.error(toErrorMessage(e));
    }
  };

  return (
    <>
      <Link href="/app/customers" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft className="size-4 rtl-flip" aria-hidden /> {t("back")}
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
                title={ts(`${segment.segment}.description`)}
              >
                {segment.segment === "VIP" && <Sparkles className="size-3" />}
                {ts(`${segment.segment}.label`)}
              </span>
            )}
          </div>
          <p className="mt-1 text-ink-2">
            {[customer.phone, customer.email, customer.externalRef && t("ref", { ref: customer.externalRef })].filter(Boolean).join(" · ") || t("noContact")}
          </p>
          {customer.anonymizedAt && <Badge className="mt-2">{t("anonymized", { date: formatDate(customer.anonymizedAt) })}</Badge>}
        </div>
        {!customer.anonymizedAt && (
          <div className="flex flex-wrap gap-2">
            {canWrite && <EditDialog key={customer.firstName + customer.phone} customer={customer} />}
            {canExport && (
              <Button variant="ghost" size="sm" onClick={exportData}>
                <Download /> {t("export")}
              </Button>
            )}
            {canDelete && (
              <ConfirmDialog
                trigger={
                  <Button variant="ghost" size="sm" className="text-danger">
                    <Trash2 /> {t("erase")}
                  </Button>
                }
                title={t("eraseTitle")}
                consequence={t("eraseConsequence")}
                confirmLabel={t("eraseConfirm")}
                destructive
                onConfirm={async () => {
                  try {
                    await api.post(`/app/customers/${id}/anonymize`);
                    toast.success(t("erased"));
                    qc.invalidateQueries({ queryKey: ["customers"] });
                    router.push("/app/customers");
                  } catch (e) {
                    toast.error(toErrorMessage(e));
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
          {customer.accounts.length === 0 && <p className="text-ink-2">{t("noCard")}</p>}
          {customer.accounts.map((a) => (
            <AccountPanel key={a.id} accountId={a.id} />
          ))}
          {canWrite && !customer.anonymizedAt && missing.length > 0 && (
            <div className="flex flex-wrap items-end gap-2">
              <Field label={t("addCard")} className="min-w-56 flex-1">
                {(p) => (
                  <Select {...p} value={enrollProgram} onChange={(e) => setEnrollProgram(e.target.value)}>
                    <option value="">{t("chooseProgram")}</option>
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
                    toast.success(t("cardCreated"));
                    setEnrollProgram("");
                    qc.invalidateQueries({ queryKey: ["customer", id] });
                  } catch (e) {
                    toast.error(toErrorMessage(e));
                  }
                }}
              >
                <PlusCircle /> {t("createCard")}
              </Button>
            </div>
          )}
        </div>

        {/* Colonne droite : Intelligence RFM, Relances WhatsApp, Tags & Notes */}
        <div className="grid content-start gap-5">
          {/* Fiche RFM Sidely */}
          <Panel className="p-5 text-sm">
            <h2 className="mb-3 font-display text-base font-semibold flex items-center gap-1.5">
              <Clock className="size-4 text-cobalt" /> {t("rfm.title")}
            </h2>
            <dl className="grid gap-2.5">
              <div className="flex justify-between gap-2">
                <dt className="text-ink-2">{t("rfm.status")}</dt>
                <dd className="font-semibold text-ink">{segment ? ts(`${segment.segment}.label`) : t("rfm.active")}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-2">{t("rfm.visits")}</dt>
                <dd className="tabular font-medium">{customer.totalVisits || customer.accounts.reduce((sum, a) => sum + a.balance, 0)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-2">{t("rfm.lastVisit")}</dt>
                <dd>{customer.lastVisitAt ? formatDate(customer.lastVisitAt) : t("rfm.never")}</dd>
              </div>
              {segment?.daysSinceLastVisit !== null && segment?.daysSinceLastVisit !== undefined && (
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-2">{t("rfm.inactivity")}</dt>
                  <dd className="tabular text-ink-3">{t("rfm.days", { count: segment.daysSinceLastVisit })}</dd>
                </div>
              )}
            </dl>
            {segment && (
              <div className="mt-3 rounded-md bg-subtle p-2.5 text-xs text-ink-2 border border-line">
                <span className="font-semibold text-ink">{t("rfm.suggested")}</span> {ts(`${segment.segment}.action`)}
              </div>
            )}
          </Panel>

          {/* Action WhatsApp prompte */}
          <WhatsAppActionsPanel customer={customer} tenantName={tenant?.name || t("defaultStore")} />

          {/* Tags et Notes vendeurs */}
          <NotesAndTagsPanel customer={customer} />

          {/* Consentements RGPD */}
          <Panel className="p-5 text-sm">
            <h2 className="mb-3 font-display text-base font-semibold">{t("consents.title")}</h2>
            <dl className="grid gap-2.5">
              <div className="flex justify-between gap-2"><dt className="text-ink-2">{t("consents.terms")}</dt><dd>{customer.termsAcceptedAt ? formatDate(customer.termsAcceptedAt) : t("consents.notCollected")}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-ink-2">{t("consents.sms")}</dt><dd>{customer.marketingSmsConsent ? t("consents.yes") : t("consents.no")}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-ink-2">{t("consents.email")}</dt><dd>{customer.marketingEmailConsent ? t("consents.yes") : t("consents.no")}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-ink-2">{t("consents.since")}</dt><dd>{formatDate(customer.createdAt)}</dd></div>
            </dl>
          </Panel>
        </div>
      </div>
    </>
  );
}
