"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/field";
import { Badge, PageHeader, Panel } from "@/components/ui/misc";
import { DataLoader } from "@/components/navigation/data-loader";
import { api, useErrorMessage } from "@/lib/api";
import { useActiveTenant, useCan } from "@/components/app/me-context";

type Kind = "NEAR_REWARD" | "REWARD_WAITING" | "AT_RISK" | "DORMANT" | "BIRTHDAY";

export interface Rule {
  kind: Kind;
  enabled: boolean;
  title: string | null;
  body: string | null;
  bonus: number | null;
  giftLabel: string | null;
  daysBefore: number;
  daysAfter: number;
  dayTitle: string | null;
  dayBody: string | null;
  defaults: { title: string; body: string; dayTitle?: string; dayBody?: string };
}

export interface Automations {
  available: boolean;
  rules: Rule[];
}

const RELAUNCH: Kind[] = ["NEAR_REWARD", "REWARD_WAITING", "AT_RISK", "DORMANT"];

/** Remplit les variables d'un texte avec des valeurs d'exemple (aperçu). */
export function useFillPreview() {
  const t = useTranslations("app.automations.sample");
  const tenant = useActiveTenant();
  const values: Record<string, string> = {
    prenom: t("firstName"),
    commerce: tenant?.name ?? "",
    solde: t("balance"),
    recompense: t("reward"),
    reste: t("remaining"),
    cadeau: t("gift"),
    date: t("date"),
  };
  return (text: string) => text.replace(/\{([^{}]{1,20})\}/g, (m, name: string) => values[name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()] ?? m);
}

/** Relances automatiques (docs/chantier-relances-anniversaire.md) : un réglage par scénario. */
export default function AutomationsPage() {
  const t = useTranslations("app.automations");
  const { data, isLoading } = useQuery({ queryKey: ["automations"], queryFn: () => api.get<Automations>("/app/automations") });
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      {isLoading || !data ? (
        <DataLoader />
      ) : (
        <div className="grid max-w-3xl gap-5">
          {!data.available && (
            <Panel className="grid gap-2 border-stamp/40 bg-stamp-soft p-5">
              <p className="font-medium text-ink">{t("paidOnly.title")}</p>
              <p className="text-sm text-ink-2">{t("paidOnly.body")}</p>
              <Button asChild className="justify-self-start">
                <Link href="/app/billing">{t("paidOnly.cta")}</Link>
              </Button>
            </Panel>
          )}
          <p className="text-sm text-ink-2">{t("rules")}</p>
          {RELAUNCH.map((kind) => {
            const rule = data.rules.find((r) => r.kind === kind)!;
            return <RuleEditor key={`${kind}-${rule.enabled}-${rule.title}-${rule.body}-${rule.bonus}`} rule={rule} available={data.available} />;
          })}
          <BirthdayEditor key={JSON.stringify(data.rules.find((r) => r.kind === "BIRTHDAY"))} rule={data.rules.find((r) => r.kind === "BIRTHDAY")!} available={data.available} />
        </div>
      )}
    </>
  );
}

function RuleEditor({ rule, available }: { rule: Rule; available: boolean }) {
  const t = useTranslations("app.automations");
  const errMsg = useErrorMessage();
  const qc = useQueryClient();
  const canWrite = useCan("programs.write");
  const fill = useFillPreview();
  const [enabled, setEnabled] = useState(rule.enabled);
  const [title, setTitle] = useState(rule.title ?? "");
  const [body, setBody] = useState(rule.body ?? "");
  const [withBonus, setWithBonus] = useState(Boolean(rule.bonus));
  const [bonus, setBonus] = useState(String(rule.bonus ?? 1));
  const [busy, setBusy] = useState(false);
  const locked = !available || !canWrite;

  const save = async () => {
    setBusy(true);
    try {
      await api.put(`/app/automations/${rule.kind}`, {
        enabled,
        title: title.trim() || null,
        body: body.trim() || null,
        ...(rule.kind === "DORMANT" ? { bonus: withBonus ? Math.max(1, Number(bonus) || 1) : null } : {}),
      });
      await qc.invalidateQueries({ queryKey: ["automations"] });
      toast.success(t("saved"));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel className="grid gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2 className="flex flex-wrap items-center gap-2 font-display text-lg font-semibold">
            {t(`kinds.${rule.kind}.title`)}
            <Badge tone={rule.enabled ? "mint" : "neutral"}>{rule.enabled ? t("on") : t("off")}</Badge>
          </h2>
          <p className="text-sm text-ink-2">{t(`kinds.${rule.kind}.when`)}</p>
        </div>
      </div>
      <Checkbox label={t("enable")} checked={enabled} disabled={locked} onChange={(e) => setEnabled(e.target.checked)} />
      <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
        <Field label={t("messageTitle")}>{(f) => <Input {...f} maxLength={60} disabled={locked} placeholder={rule.defaults.title} value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
        <Field label={t("messageBody")} hint={t("variables")}>{(f) => <Textarea {...f} rows={2} maxLength={180} disabled={locked} placeholder={rule.defaults.body} value={body} onChange={(e) => setBody(e.target.value)} />}</Field>
      </div>
      {rule.kind === "DORMANT" && (
        <div className="flex flex-wrap items-end gap-3">
          <Checkbox label={t("bonus")} checked={withBonus} disabled={locked} onChange={(e) => setWithBonus(e.target.checked)} />
          {withBonus && <Field label={t("bonusAmount")} className="w-32">{(f) => <Input {...f} type="number" min={1} max={1000} disabled={locked} value={bonus} onChange={(e) => setBonus(e.target.value)} />}</Field>}
        </div>
      )}
      <div className="grid gap-1 rounded-md bg-surface-2 p-3 text-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-3">{t("preview")}</p>
        <p className="font-semibold text-ink">{fill(title.trim() || rule.defaults.title)}</p>
        <p className="text-ink-2">{fill(body.trim() || rule.defaults.body)}</p>
      </div>
      {!locked && <Button className="justify-self-start" loading={busy} onClick={save}>{t("save")}</Button>}
    </Panel>
  );
}

/** Anniversaire : cadeau valable sur une période, annonce avant le jour J, message le jour J. */
function BirthdayEditor({ rule, available }: { rule: Rule; available: boolean }) {
  const t = useTranslations("app.automations.birthday");
  const ta = useTranslations("app.automations");
  const errMsg = useErrorMessage();
  const qc = useQueryClient();
  const canWrite = useCan("programs.write");
  const fill = useFillPreview();
  const [f, setF] = useState({
    enabled: rule.enabled,
    giftLabel: rule.giftLabel ?? "",
    daysBefore: String(rule.daysBefore),
    daysAfter: String(rule.daysAfter),
    title: rule.title ?? "",
    body: rule.body ?? "",
    dayTitle: rule.dayTitle ?? "",
    dayBody: rule.dayBody ?? "",
  });
  const [busy, setBusy] = useState(false);
  const locked = !available || !canWrite;
  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch });
  const num = (v: string, max: number) => Math.min(max, Math.max(0, Math.round(Number(v) || 0)));

  const save = async () => {
    if (f.enabled && !f.giftLabel.trim()) {
      toast.error(t("giftRequired"));
      return;
    }
    setBusy(true);
    try {
      await api.put("/app/automations/BIRTHDAY", {
        enabled: f.enabled,
        giftLabel: f.giftLabel.trim() || null,
        daysBefore: num(f.daysBefore, 14),
        daysAfter: num(f.daysAfter, 30),
        title: f.title.trim() || null,
        body: f.body.trim() || null,
        dayTitle: f.dayTitle.trim() || null,
        dayBody: f.dayBody.trim() || null,
      });
      await qc.invalidateQueries({ queryKey: ["automations"] });
      toast.success(ta("saved"));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const preview = (title: string, body: string, fallbackTitle: string, fallbackBody: string) => (
    <div className="grid gap-1 rounded-md bg-surface-2 p-3 text-sm">
      <p className="font-semibold text-ink">{fill(title.trim() || fallbackTitle)}</p>
      <p className="text-ink-2">{fill(body.trim() || fallbackBody)}</p>
    </div>
  );

  return (
    <Panel className="grid gap-4 p-5">
      <div className="grid gap-1">
        <h2 className="flex flex-wrap items-center gap-2 font-display text-lg font-semibold">
          {t("title")}
          <Badge tone={rule.enabled ? "mint" : "neutral"}>{rule.enabled ? ta("on") : ta("off")}</Badge>
        </h2>
        <p className="text-sm text-ink-2">{t("help")}</p>
      </div>
      <Checkbox label={t("enable")} checked={f.enabled} disabled={locked} onChange={(e) => set({ enabled: e.target.checked })} />
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
        <Field label={t("gift")} hint={t("giftHint")}>{(p) => <Input {...p} maxLength={60} disabled={locked} placeholder={t("giftPlaceholder")} value={f.giftLabel} onChange={(e) => set({ giftLabel: e.target.value })} />}</Field>
        <Field label={t("daysBefore")}>{(p) => <Input {...p} type="number" min={0} max={14} disabled={locked} value={f.daysBefore} onChange={(e) => set({ daysBefore: e.target.value })} />}</Field>
        <Field label={t("daysAfter")}>{(p) => <Input {...p} type="number" min={0} max={30} disabled={locked} value={f.daysAfter} onChange={(e) => set({ daysAfter: e.target.value })} />}</Field>
      </div>
      <div className="grid gap-3">
        <p className="text-sm font-medium text-ink">{t("soon")}</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
          <Field label={ta("messageTitle")}>{(p) => <Input {...p} maxLength={60} disabled={locked} placeholder={rule.defaults.title} value={f.title} onChange={(e) => set({ title: e.target.value })} />}</Field>
          <Field label={ta("messageBody")} hint={t("variables")}>{(p) => <Textarea {...p} rows={2} maxLength={180} disabled={locked} placeholder={rule.defaults.body} value={f.body} onChange={(e) => set({ body: e.target.value })} />}</Field>
        </div>
        {preview(f.title, f.body, rule.defaults.title, rule.defaults.body)}
      </div>
      <div className="grid gap-3">
        <p className="text-sm font-medium text-ink">{t("day")}</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
          <Field label={ta("messageTitle")}>{(p) => <Input {...p} maxLength={60} disabled={locked} placeholder={rule.defaults.dayTitle} value={f.dayTitle} onChange={(e) => set({ dayTitle: e.target.value })} />}</Field>
          <Field label={ta("messageBody")} hint={t("variables")}>{(p) => <Textarea {...p} rows={2} maxLength={180} disabled={locked} placeholder={rule.defaults.dayBody} value={f.dayBody} onChange={(e) => set({ dayBody: e.target.value })} />}</Field>
        </div>
        {preview(f.dayTitle, f.dayBody, rule.defaults.dayTitle ?? "", rule.defaults.dayBody ?? "")}
      </div>
      {!locked && <Button className="justify-self-start" loading={busy} onClick={save}>{ta("save")}</Button>}
    </Panel>
  );
}
