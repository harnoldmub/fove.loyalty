"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound, Plus, Webhook } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { API_SCOPES, WEBHOOK_EVENTS } from "@fove/shared";
import { useCan } from "@/components/app/me-context";
import type { Program } from "@/components/app/types";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, DialogContent, DialogRoot } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Badge, EmptyState, ErrorNote, PageHeader, Panel } from "@/components/ui/misc";
import { api, useErrorMessage } from "@/lib/api";
import { useIsNativeApp } from "@/lib/native-app";
import { formatDate } from "@/lib/utils";
import { DataLoader } from "@/components/navigation/data-loader";

interface ApiKey { id: string; name: string; kind: "SECRET" | "PUBLISHABLE"; environment: "TEST" | "LIVE"; prefix: string; scopes: string[]; allowedOrigins: string[]; lastUsedAt: string | null; revokedAt: string | null; createdAt: string }
interface Endpoint { id: string; url: string; events: string[]; active: boolean }
interface Delivery { id: string; event: string; status: string; attempts: number; lastStatusCode: number | null; lastError: string | null; createdAt: string }
interface Connection { id: string; provider: string; name: string; status: string; lastSyncAt: string | null; lastError: string | null; syncLogs: { id: string; kind: string; externalId: string; status: string; error: string | null; createdAt: string }[] }

/** Clés de traduction des droits d’API (`app.integrations.scopes.*`). */
const SCOPE_KEY: Record<string, string> = {
  "customers:read": "customersRead",
  "customers:write": "customersWrite",
  "programs:read": "programsRead",
  "loyalty:read": "loyaltyRead",
  "loyalty:write": "loyaltyWrite",
  "rewards:read": "rewardsRead",
  "redemptions:write": "redemptionsWrite",
  "integrations:write": "integrationsWrite",
};

function SecretReveal({ value, label }: { value: string; label: string }) {
  const t = useTranslations("app.integrations");
  return (
    <div className="grid gap-2 rounded-md bg-stamp-soft p-4">
      <p className="text-sm font-medium text-stamp-ink dark:text-stamp">{label} {t("copyNow")}</p>
      <div className="flex gap-2">
        <code dir="ltr" className="min-w-0 flex-1 break-all rounded-sm bg-surface px-3 py-2 text-sm">{value}</code>
        <Button size="icon" variant="secondary" aria-label={t("copy")} onClick={() => navigator.clipboard.writeText(value).then(() => toast.success(t("copied")))}>
          <Copy />
        </Button>
      </div>
    </div>
  );
}

function KeyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const toErrorMessage = useErrorMessage();
  const t = useTranslations("app.integrations");
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
      <DialogContent title={t("key.title")}>
        {created ? (
          <>
            <SecretReveal value={created} label={kind === "SECRET" ? t("key.secretCreated") : t("key.publicCreated")} />
            <Button onClick={() => close(false)}>{t("key.copied")}</Button>
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
                setError(toErrorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            {error && <ErrorNote>{error}</ErrorNote>}
            <Field label={t("key.usage")} hint={kind === "SECRET" ? t("key.secretHint") : t("key.publicHint")}>
              {(p) => (
                <Select {...p} value={kind} onChange={(e) => setKind(e.target.value as "SECRET" | "PUBLISHABLE")}>
                  <option value="SECRET">{t("key.secretOption")}</option>
                  <option value="PUBLISHABLE">{t("key.publicOption")}</option>
                </Select>
              )}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("key.name")}>{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
              <Field label={t("key.environment")}>
                {(p) => (
                  <Select {...p} value={env} onChange={(e) => setEnv(e.target.value as "TEST" | "LIVE")}>
                    <option value="TEST">{t("env.TEST")}</option>
                    <option value="LIVE">{t("env.LIVE")}</option>
                  </Select>
                )}
              </Field>
            </div>
            {kind === "SECRET" ? (
              <fieldset className="grid gap-2">
                <legend className="mb-1 text-sm font-medium">{t("key.scopes")}</legend>
                {API_SCOPES.map((s) => (
                  <Checkbox key={s} label={SCOPE_KEY[s] ? t(`scopes.${SCOPE_KEY[s]}`) : s} checked={scopes.includes(s)} onChange={(e) => setScopes(e.target.checked ? [...scopes, s] : scopes.filter((x) => x !== s))} />
                ))}
              </fieldset>
            ) : (
              <Field label={t("key.origins")} hint={t("key.originsHint")}>
                {(p) => <Textarea {...p} value={origins} onChange={(e) => setOrigins(e.target.value)} />}
              </Field>
            )}
            <Button type="submit" loading={busy} disabled={name.trim().length < 2}>{t("key.submit")}</Button>
          </form>
        )}
      </DialogContent>
    </DialogRoot>
  );
}

function WebhookDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const toErrorMessage = useErrorMessage();
  const t = useTranslations("app.integrations");
  const qc = useQueryClient();
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["loyalty_transaction.created"]);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <DialogRoot open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setSecret(null); }}>
      <DialogContent title={t("webhook.title")} description={t("webhook.description")}>
        {secret ? (
          <>
            <SecretReveal value={secret} label={t("webhook.secretCreated")} />
            <Button onClick={() => onOpenChange(false)}>{t("webhook.copied")}</Button>
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
                setError(toErrorMessage(err));
              }
            }}
          >
            {error && <ErrorNote>{error}</ErrorNote>}
            <Field label={t("webhook.url")}>{(p) => <Input {...p} type="url" value={url} onChange={(e) => setUrl(e.target.value)} />}</Field>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">{t("webhook.events")}</legend>
              {WEBHOOK_EVENTS.map((ev) => (
                <Checkbox key={ev} label={<code>{ev}</code>} checked={events.includes(ev)} onChange={(e) => setEvents(e.target.checked ? [...events, ev] : events.filter((x) => x !== ev))} />
              ))}
            </fieldset>
            <Button type="submit" disabled={!url || events.length === 0}>{t("webhook.submit")}</Button>
          </form>
        )}
      </DialogContent>
    </DialogRoot>
  );
}

export default function IntegrationsPage() {
  const toErrorMessage = useErrorMessage();
  const t = useTranslations("app.integrations");
  const native = useIsNativeApp();
  const canWrite = useCan("integrations.write");
  const qc = useQueryClient();
  const [keyOpen, setKeyOpen] = useState(false);
  const [hookOpen, setHookOpen] = useState(false);
  const [connProgram, setConnProgram] = useState("");
  const { data: keys = [] } = useQuery({ queryKey: ["keys"], queryFn: () => api.get<ApiKey[]>("/app/integrations/keys") });
  const { data: hooks = [] } = useQuery({ queryKey: ["webhooks"], queryFn: () => api.get<Endpoint[]>("/app/integrations/webhooks") });
  const { data: deliveries = [] } = useQuery({ queryKey: ["deliveries"], queryFn: () => api.get<Delivery[]>("/app/integrations/deliveries") });
  const { data: connections = [], isLoading } = useQuery({ queryKey: ["connections"], queryFn: () => api.get<Connection[]>("/app/integrations/connections") });
  const { data: programs = [] } = useQuery({ queryKey: ["programs"], queryFn: () => api.get<Program[]>("/app/programs") });

  return (
    <>
      <PageHeader title={t("title")} description={native ? t("description") : t.rich("descriptionDocs", { link: (c) => <Link className="text-cobalt underline" href="/developpeurs">{c}</Link> })} />

      {isLoading ? <DataLoader /> : (
      <>
      <section className="grid gap-3" aria-labelledby="boutique">
        <h2 id="boutique" className="font-display text-xl font-semibold">{t("shop.title")}</h2>
        {connections.length === 0 ? (
          <Panel className="grid gap-3 p-5">
            <p className="text-ink-2">{t("shop.description")}</p>
            {canWrite && programs.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <Select aria-label={t("shop.program")} value={connProgram} onChange={(e) => setConnProgram(e.target.value)} className="w-auto">
                  <option value="">{t("shop.program")}</option>
                  {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
                <Button
                  variant="secondary"
                  disabled={!connProgram}
                  onClick={async () => {
                    try {
                      await api.post("/app/integrations/connections", { provider: "CUSTOM", name: t("shop.defaultName"), programId: connProgram });
                      qc.invalidateQueries({ queryKey: ["connections"] });
                    } catch (e) {
                      toast.error(toErrorMessage(e));
                    }
                  }}
                >
                  {t("shop.connect")}
                </Button>
              </div>
            )}
          </Panel>
        ) : (
          connections.map((c) => (
            <Panel key={c.id} className="overflow-hidden">
              <div className="flex flex-wrap items-center gap-2 p-5">
                <h3 className="font-display text-lg font-semibold">{c.name}</h3>
                <Badge tone={c.lastError ? "danger" : c.lastSyncAt ? "mint" : "neutral"}>{c.lastError ? t("shop.error") : c.lastSyncAt ? t("shop.synced") : t("shop.waiting")}</Badge>
                <p className="w-full text-sm text-ink-3">{c.lastSyncAt ? t("shop.lastSync", { date: formatDate(c.lastSyncAt, true) }) : t("shop.noOrders")}</p>
                {c.lastError && <p className="w-full text-sm text-danger">{c.lastError}</p>}
              </div>
              {c.syncLogs.length > 0 && (
                <ul className="divide-y divide-line border-t border-line text-sm">
                  {c.syncLogs.map((l) => (
                    <li key={l.id} className="flex gap-3 px-5 py-2.5">
                      <span className="flex-1 truncate">{l.kind === "order.paid" ? t("shop.orderPaid") : t("shop.refund")} {l.externalId}</span>
                      <span className={l.status === "ok" ? "text-mint" : "text-danger"}>{l.status === "ok" ? t("shop.ok") : l.error ?? t("shop.error")}</span>
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
          <h2 id="cles" className="font-display text-xl font-semibold">{t("keys.title")}</h2>
          {canWrite && <Button size="sm" onClick={() => setKeyOpen(true)}><Plus /> {t("keys.new")}</Button>}
        </div>
        {keys.length === 0 ? (
          <EmptyState icon={<KeyRound />} title={t("keys.empty")}>{t("keys.emptyBody")}</EmptyState>
        ) : (
          <Panel className="overflow-hidden">
            <ul className="divide-y divide-line">
              {keys.map((k) => (
                <li key={k.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {k.name}
                      <Badge tone={k.kind === "SECRET" ? "cobalt" : "neutral"}>{k.kind === "SECRET" ? t("keys.secret") : t("keys.public")}</Badge>
                      <Badge tone={k.environment === "LIVE" ? "mint" : "stamp"}>{t(`env.${k.environment}`)}</Badge>
                      {k.revokedAt && <Badge tone="danger">{t("keys.revoked")}</Badge>}
                    </p>
                    <p className="truncate text-sm text-ink-3">
                      <code dir="ltr">{k.prefix}…</code> · {k.lastUsedAt ? t("keys.usedOn", { date: formatDate(k.lastUsedAt, true) }) : t("keys.neverUsed")}
                    </p>
                  </div>
                  {canWrite && !k.revokedAt && (
                    <ConfirmDialog
                      trigger={<Button size="sm" variant="ghost" className="text-danger">{t("keys.revoke")}</Button>}
                      title={t("keys.revokeTitle", { name: k.name })}
                      consequence={t("keys.revokeConsequence")}
                      confirmLabel={t("keys.revokeConfirm")}
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
          <h2 id="webhooks" className="font-display text-xl font-semibold">{t("webhooks.title")}</h2>
          {canWrite && <Button size="sm" onClick={() => setHookOpen(true)}><Plus /> {t("webhooks.new")}</Button>}
        </div>
        {hooks.filter((h) => h.active).length === 0 ? (
          <EmptyState icon={<Webhook />} title={t("webhooks.empty")}>{t("webhooks.emptyBody")}</EmptyState>
        ) : (
          <Panel className="overflow-hidden">
            <ul className="divide-y divide-line">
              {hooks.filter((h) => h.active).map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium" dir="ltr">{h.url}</p>
                    <p className="truncate text-sm text-ink-3">{h.events.join(", ")}</p>
                  </div>
                  {canWrite && (
                    <ConfirmDialog
                      trigger={<Button size="sm" variant="ghost">{t("webhooks.deactivate")}</Button>}
                      title={t("webhooks.deactivateTitle")}
                      consequence={t("webhooks.deactivateConsequence")}
                      confirmLabel={t("webhooks.deactivate")}
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
            <summary className="cursor-pointer text-sm font-medium">{t("webhooks.deliveries", { count: deliveries.length })}</summary>
            <ul className="mt-3 grid gap-1.5 text-sm">
              {deliveries.map((d) => (
                <li key={d.id} className="flex gap-3">
                  <span className="flex-1 truncate"><code>{d.event}</code> · {formatDate(d.createdAt, true)}</span>
                  <span className={d.status === "SUCCEEDED" ? "text-mint" : d.status === "FAILED" ? "text-danger" : "text-ink-3"}>
                    {d.status === "SUCCEEDED" ? t("webhooks.delivered") : d.status === "FAILED" ? t("webhooks.failed", { count: d.attempts }) : t("webhooks.pending", { count: d.attempts })}
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
      )}
    </>
  );
}
