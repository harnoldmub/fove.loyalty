"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { HeartHandshake } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { Badge, Panel } from "@/components/ui/misc";
import { DataLoader } from "@/components/navigation/data-loader";
import { api, useErrorMessage } from "@/lib/api";
import { useCan } from "./me-context";

interface ReferralSettings {
  enabled: boolean;
  referrerStamps: number;
  referrerPoints: number;
  refereeStamps: number;
  refereePoints: number;
  monthlyCap: number;
  available: boolean;
}

interface ReferralOverview {
  settings: ReferralSettings;
  stats: { signedUp: number; came: number; rewarded: number; top: { customerId: string; name: string; rewarded: number }[] };
}

const FIELDS = ["referrerStamps", "referrerPoints", "refereeStamps", "refereePoints", "monthlyCap"] as const;
type NumField = (typeof FIELDS)[number];

/** Parrainage entre clients (docs/chantier-parrainage-clients.md) : réglages du commerce et résultats. */
export function CustomerReferralsPanel() {
  const t = useTranslations("app.customerReferral");
  const { data, isLoading } = useQuery({ queryKey: ["customer-referrals"], queryFn: () => api.get<ReferralOverview>("/app/customer-referrals") });
  if (isLoading || !data) return <DataLoader className="min-h-48" />;
  return (
    <div className="grid gap-5">
      {!data.settings.available && (
        <Panel className="grid gap-2 border-stamp/40 bg-stamp-soft p-5">
          <p className="font-medium text-ink">{t("paidOnly.title")}</p>
          <p className="text-sm text-ink-2">{t("paidOnly.body")}</p>
          <Button asChild className="justify-self-start">
            <Link href="/app/billing">{t("paidOnly.cta")}</Link>
          </Button>
        </Panel>
      )}
      <SettingsEditor key={JSON.stringify(data.settings)} settings={data.settings} />
      {data.settings.available && <Stats stats={data.stats} />}
    </div>
  );
}

function SettingsEditor({ settings }: { settings: ReferralSettings }) {
  const t = useTranslations("app.customerReferral");
  const errMsg = useErrorMessage();
  const qc = useQueryClient();
  const canWrite = useCan("programs.write");
  const locked = !settings.available || !canWrite;
  const [enabled, setEnabled] = useState(settings.enabled);
  const [values, setValues] = useState<Record<NumField, string>>(() => Object.fromEntries(FIELDS.map((k) => [k, String(settings[k])])) as Record<NumField, string>);
  const [busy, setBusy] = useState(false);

  const num = (k: NumField, min: number) => Math.max(min, Math.floor(Number(values[k]) || 0));
  const save = async () => {
    setBusy(true);
    try {
      await api.put("/app/customer-referrals/settings", {
        enabled,
        referrerStamps: num("referrerStamps", 0),
        referrerPoints: num("referrerPoints", 0),
        refereeStamps: num("refereeStamps", 0),
        refereePoints: num("refereePoints", 0),
        monthlyCap: Math.min(100, num("monthlyCap", 1)),
      });
      await qc.invalidateQueries({ queryKey: ["customer-referrals"] });
      toast.success(t("saved"));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const input = (k: NumField, max: number) => (
    <Field label={t(`fields.${k}`)}>
      {(f) => <Input {...f} type="number" min={k === "monthlyCap" ? 1 : 0} max={max} disabled={locked} value={values[k]} onChange={(e) => setValues({ ...values, [k]: e.target.value })} />}
    </Field>
  );

  return (
    <Panel className="grid gap-5 p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-mint-soft text-mint">
          <HeartHandshake className="size-5" aria-hidden />
        </span>
        <div className="grid gap-1">
          <h2 className="flex flex-wrap items-center gap-2 font-display text-lg font-semibold">
            {t("title")}
            <Badge tone={settings.enabled && settings.available ? "mint" : "neutral"}>{settings.enabled && settings.available ? t("on") : t("off")}</Badge>
          </h2>
          <p className="text-sm text-ink-2">{t("how")}</p>
        </div>
      </div>
      <Checkbox label={t("enable")} checked={enabled} disabled={locked} onChange={(e) => setEnabled(e.target.checked)} />
      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset className="grid gap-3 rounded-md border border-line p-4">
          <legend className="px-1 text-sm font-medium text-ink">{t("referrer")}</legend>
          <p className="text-xs text-ink-3">{t("referrerHelp")}</p>
          <div className="grid grid-cols-2 gap-3">
            {input("referrerStamps", 50)}
            {input("referrerPoints", 100000)}
          </div>
        </fieldset>
        <fieldset className="grid gap-3 rounded-md border border-line p-4">
          <legend className="px-1 text-sm font-medium text-ink">{t("referee")}</legend>
          <p className="text-xs text-ink-3">{t("refereeHelp")}</p>
          <div className="grid grid-cols-2 gap-3">
            {input("refereeStamps", 50)}
            {input("refereePoints", 100000)}
          </div>
        </fieldset>
      </div>
      <div className="grid gap-1 sm:max-w-xs">
        {input("monthlyCap", 100)}
        <p className="text-xs text-ink-3">{t("capHelp")}</p>
      </div>
      <p className="text-xs text-ink-3">{t("rules")}</p>
      {!locked && (
        <Button className="justify-self-start" loading={busy} onClick={save}>
          {t("save")}
        </Button>
      )}
    </Panel>
  );
}

function Stats({ stats }: { stats: ReferralOverview["stats"] }) {
  const t = useTranslations("app.customerReferral.stats");
  const tiles = [
    { key: "signedUp", value: stats.signedUp },
    { key: "came", value: stats.came },
    { key: "rewarded", value: stats.rewarded },
  ] as const;
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-3 gap-3">
        {tiles.map((tile) => (
          <Panel key={tile.key} className="grid gap-1 p-4">
            <p className="text-xs text-ink-3">{t(tile.key)}</p>
            <p className="font-display text-2xl font-semibold tabular">{tile.value}</p>
          </Panel>
        ))}
      </div>
      <Panel className="grid gap-2 p-5">
        <h3 className="font-display text-base font-semibold">{t("top")}</h3>
        {stats.top.length === 0 ? (
          <p className="text-sm text-ink-3">{t("empty")}</p>
        ) : (
          <ol className="divide-y divide-line text-sm">
            {stats.top.map((r, i) => (
              <li key={r.customerId} className="flex items-center justify-between gap-3 py-2">
                <Link href={`/app/customers/${r.customerId}`} className="truncate hover:underline">
                  <span className="me-2 text-ink-3 tabular">{i + 1}.</span>
                  {r.name}
                </Link>
                <span className="shrink-0 text-ink-2">{t("friends", { count: r.rewarded })}</span>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}
