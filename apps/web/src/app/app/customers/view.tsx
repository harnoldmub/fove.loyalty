"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAppRouter } from "@/lib/navigation-progress";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileUp, Search, UserPlus, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useActiveTenant, useCan } from "@/components/app/me-context";
import type { CustomerRow, Page, Program } from "@/components/app/types";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogRoot } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { PhoneInput } from "@/components/ui/phone-input";
import { EmptyState, ErrorNote, PageHeader, Panel, Skeleton } from "@/components/ui/misc";
import { api, useErrorMessage } from "@/lib/api";
import { formatDate, formatNumber } from "@/lib/utils";
import { QuotaUpgradeHint, useQuotaBlock } from "@/components/app/upgrade";

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function NewCustomerDialog({ open, onOpenChange, programs }: { open: boolean; onOpenChange: (o: boolean) => void; programs: Program[] }) {
  const toErrorMessage = useErrorMessage();
  const t = useTranslations("app.customers.new");
  const router = useAppRouter();
  const qc = useQueryClient();
  // « auto » : premier programme actif ; « none » : pas de carte.
  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "", email: "", programId: "auto", marketingSmsConsent: false });
  const [error, setError] = useState<string | null>(null);
  const quota = useQuotaBlock("customers");
  const [busy, setBusy] = useState(false);
  const programId = form.programId === "auto" ? (programs[0]?.id ?? "none") : form.programId;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    quota.clear();
    setBusy(true);
    try {
      const res = await api.post<{ customer: { id: string } }>("/app/customers", {
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone || null,
        email: form.email || null,
        programId: programId === "none" ? null : programId,
        marketingSmsConsent: form.marketingSmsConsent,
      });
      toast.success(t("created"));
      qc.invalidateQueries({ queryKey: ["customers"] });
      onOpenChange(false);
      router.push(`/app/customers/${res.customer.id}`);
    } catch (err) {
      setError(toErrorMessage(err));
      quota.track(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t("title")} description={t("description")}>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          {error && <ErrorNote>{error}</ErrorNote>}
          {quota.hint}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("firstName")}>{(p) => <Input {...p} required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />}</Field>
            <Field label={t("lastName")}>{(p) => <Input {...p} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />}</Field>
          </div>
          <Field label={t("phone")}>
            {(p) => (
              <PhoneInput
                {...p}
                value={form.phone}
                onChange={(phone) => setForm({ ...form, phone })}
              />
            )}
          </Field>
          <Field label={t("email")}>{(p) => <Input {...p} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}</Field>
          {programs.length > 0 && (
            <Field label={t("program")}>
              {(p) => (
                <Select {...p} value={programId} onChange={(e) => setForm({ ...form, programId: e.target.value })}>
                  {programs.map((pr) => (
                    <option key={pr.id} value={pr.id}>{pr.name}</option>
                  ))}
                  <option value="none">{t("noCard")}</option>
                </Select>
              )}
            </Field>
          )}
          <Checkbox checked={form.marketingSmsConsent} onChange={(e) => setForm({ ...form, marketingSmsConsent: e.target.checked })} label={t("consent")} />
          <Button type="submit" loading={busy} disabled={!form.firstName || (!form.phone && !form.email)}>{t("submit")}</Button>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const sep = lines[0]!.includes(";") ? ";" : ",";
  const headers = lines[0]!.split(sep).map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
    return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ""]));
  });
}

function ImportDialog({ open, onOpenChange, programs }: { open: boolean; onOpenChange: (o: boolean) => void; programs: Program[] }) {
  const toErrorMessage = useErrorMessage();
  const t = useTranslations("app.customers.import");
  const qc = useQueryClient();
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [programId, setProgramId] = useState("");
  const [result, setResult] = useState<{ created: number; duplicates: number; invalid: number; overQuota: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const quota = useQuotaBlock("customers");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    quota.clear();
    try {
      const res = await api.post<{ summary: { created: number; duplicates: number; invalid: number; overQuota: number } }>("/app/customers/import", { rows, programId: programId || null });
      setResult(res.summary);
      qc.invalidateQueries({ queryKey: ["customers"] });
    } catch (e) {
      setError(toErrorMessage(e));
      quota.track(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogRoot open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setRows([]); setResult(null); } }}>
      <DialogContent title={t("title")} description={t("description")}>
        {error && <ErrorNote>{error}</ErrorNote>}
          {quota.hint}
        {result ? (
          <div className="grid gap-2">
            <p>{t.rich("created", { count: result.created, strong: (c) => <strong>{c}</strong> })}</p>
            {result.duplicates > 0 && <p className="text-ink-2">{t("duplicates", { count: result.duplicates })}</p>}
            {result.invalid > 0 && <p className="text-ink-2">{t("invalid", { count: result.invalid })}</p>}
            {result.overQuota > 0 && <p className="text-danger">{t("overQuota", { count: result.overQuota })}</p>}
            {result.overQuota > 0 && <QuotaUpgradeHint quota="customers" />}
            <Button className="mt-2" onClick={() => onOpenChange(false)}>{t("close")}</Button>
          </div>
        ) : (
          <div className="grid gap-4">
            <label className="flex cursor-pointer items-center gap-3 rounded-md bg-surface-2 p-4 text-sm">
              <FileUp className="size-5 text-ink-3" aria-hidden />
              {rows.length ? t("ready", { count: rows.length, formatted: formatNumber(rows.length) }) : t("choose")}
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setRows(parseCsv(await f.text())); }} />
            </label>
            {programs.length > 0 && (
              <Field label={t("program")}>
                {(p) => (
                  <Select {...p} value={programId} onChange={(e) => setProgramId(e.target.value)}>
                    <option value="">{t("noCard")}</option>
                    {programs.map((pr) => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
                  </Select>
                )}
              </Field>
            )}
            <Button onClick={submit} loading={busy} disabled={rows.length === 0}>{rows.length ? t("submitCount", { count: rows.length, formatted: formatNumber(rows.length) }) : t("submit")}</Button>
          </div>
        )}
      </DialogContent>
    </DialogRoot>
  );
}

const SEGMENT_FILTERS = ["ALL", "VIP", "REGULAR", "AT_RISK", "DORMANT", "NEW"] as const;

export function CustomersView() {
  const t = useTranslations("app.customers");
  const ts = useTranslations("app.segment");
  const params = useSearchParams();
  const canWrite = useCan("customers.write");
  const canImport = useCan("customers.import");
  const [q, setQ] = useState("");
  const query = useDebounced(q);
  const [creating, setCreating] = useState(params.get("new") === "1");
  const [importing, setImporting] = useState(false);
  const { data: programs = [] } = useQuery({ queryKey: ["programs"], queryFn: () => api.get<Program[]>("/app/programs") });
  const list = useInfiniteQuery({
    queryKey: ["customers", query],
    queryFn: ({ pageParam }) => api.get<Page<CustomerRow>>(`/app/customers?limit=25${query ? `&q=${encodeURIComponent(query)}` : ""}${pageParam ? `&cursor=${pageParam}` : ""}`),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const [selectedSegment, setSelectedSegment] = useState<string>("ALL");
  const rows: CustomerRow[] = useMemo(() => {
    const listRows = list.data?.pages.flatMap((p) => p.data) ?? [];
    if (selectedSegment === "ALL") return listRows;
    return listRows.filter((r) => r.segment?.segment === selectedSegment);
  }, [list.data, selectedSegment]);
  const programName = (id: string) => programs.find((p) => p.id === id)?.name ?? "";

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <>
            {canImport && (
              <Button variant="secondary" onClick={() => setImporting(true)}>
                <FileUp /> {t("importButton")}
              </Button>
            )}
            {canWrite && (
              <Button onClick={() => setCreating(true)}>
                <UserPlus /> {t("newButton")}
              </Button>
            )}
          </>
        }
      />
      <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input type="search" aria-label={t("searchLabel")} placeholder={t("searchPlaceholder")} className="ps-10" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div role="group" aria-label={t("filterLabel")} className="flex flex-wrap gap-1 rounded-md bg-surface-2 p-1 text-sm">
          {SEGMENT_FILTERS.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={selectedSegment === id}
              onClick={() => setSelectedSegment(id)}
              className={`h-8 rounded-sm px-3 font-medium transition-colors ${
                selectedSegment === id ? "bg-surface text-ink shadow-1" : "text-ink-2 hover:text-ink"
              }`}
            >
              {t(`filters.${id}`)}
            </button>
          ))}
        </div>
      </div>

      {list.isLoading ? (
        <Skeleton className="h-64" />
      ) : rows.length === 0 ? (
        <EmptyState icon={<Users />} title={query || selectedSegment !== "ALL" ? t("emptyFiltered") : t("empty")} action={canWrite && !query ? <Button onClick={() => setCreating(true)}>{t("add")}</Button> : undefined}>
          {query || selectedSegment !== "ALL" ? t("emptyFilteredBody") : t("emptyBody")}
        </EmptyState>
      ) : (
        <Panel className="overflow-hidden">
          <ul className="divide-y divide-line">
            {rows.map((c) => (
              <li key={c.id}>
                <Link href={`/app/customers/${c.id}`} className="flex items-center gap-4 px-4 py-3.5 hover:bg-surface-2 sm:px-5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-cobalt-soft font-display font-semibold text-cobalt">{c.firstName.slice(0, 1).toUpperCase()}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ink">{c.firstName} {c.lastName}</span>
                      {c.segment && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            c.segment.segment === "VIP"
                              ? "bg-cobalt/15 text-cobalt"
                              : c.segment.segment === "AT_RISK"
                              ? "bg-stamp-soft text-stamp-ink dark:text-stamp"
                              : c.segment.segment === "NEW"
                              ? "bg-mint/15 text-mint"
                              : "bg-surface text-ink-3"
                          }`}
                        >
                          {ts(`${c.segment.segment}.label`)}
                        </span>
                      )}
                      {c.tags?.map((tag) => (
                        <span key={tag} className="rounded-sm bg-subtle px-1.5 py-0.2 text-[10px] text-ink-3">
                          #{tag}
                        </span>
                      ))}
                    </span>
                    <span className="block truncate text-sm text-ink-3">{t("rowMeta", { contact: c.phone ?? c.email ?? t("noContact"), date: formatDate(c.createdAt) })}</span>
                  </span>
                  <span className="hidden text-end text-sm sm:block">
                    {c.accounts.map((a) => (
                      <span key={a.id} className="block tabular">
                        <strong>{formatNumber(a.balance)}</strong> <span className="text-ink-3">{programName(a.programId)}</span>
                      </span>
                    ))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {list.hasNextPage && (
            <div className="border-t border-line p-3 text-center">
              <Button variant="ghost" onClick={() => list.fetchNextPage()} loading={list.isFetchingNextPage}>{t("more")}</Button>
            </div>
          )}
        </Panel>
      )}
      <NewCustomerDialog open={creating} onOpenChange={setCreating} programs={programs.filter((p) => p.active)} />
      <ImportDialog open={importing} onOpenChange={setImporting} programs={programs.filter((p) => p.active)} />
    </>
  );
}
