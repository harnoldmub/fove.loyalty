"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Textarea } from "@/components/ui/field";
import { Badge, Panel } from "@/components/ui/misc";
import { api, useErrorMessage } from "@/lib/api";
import { formatDate } from "@/lib/utils";

interface Settings {
  enabled: boolean;
  recipients: string[];
  partners: boolean;
  contact: boolean;
  digest: boolean;
  updatedByEmail: string | null;
  updatedAt: string;
  defaultRecipient: string;
  effectiveRecipients: string[];
}

type Form = Pick<Settings, "enabled" | "partners" | "contact" | "digest"> & { recipients: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Notifications internes à l'équipe FOVE (Admin > Système) : interrupteur, destinataires, types d'envoi, test. */
export function TeamNotifications() {
  const t = useTranslations("admin.system.team");
  const errMsg = useErrorMessage();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin-team-notifications"], queryFn: () => api.get<Settings>("/admin/team-notifications") });
  // Saisie en cours, par-dessus les réglages enregistrés.
  const [edit, setEdit] = useState<Partial<Form>>({});
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  if (!data) return null;
  const form: Form = { enabled: data.enabled, partners: data.partners, contact: data.contact, digest: data.digest, recipients: data.recipients.join("\n"), ...edit };
  const set = (patch: Partial<Form>) => setEdit({ ...edit, ...patch });

  const save = async () => {
    const recipients = form.recipients.split(/[\s,;]+/).map((r) => r.trim().toLowerCase()).filter(Boolean);
    const invalid = recipients.find((r) => !EMAIL.test(r));
    if (invalid) {
      toast.error(t("invalidEmail", { email: invalid }));
      return;
    }
    setBusy("save");
    try {
      await api.put("/admin/team-notifications", { enabled: form.enabled, partners: form.partners, contact: form.contact, digest: form.digest, recipients });
      await qc.invalidateQueries({ queryKey: ["admin-team-notifications"] });
      setEdit({});
      toast.success(t("saved"));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy("test");
    try {
      const res = await api.post<{ sentTo: string[] }>("/admin/team-notifications/test", {});
      toast.success(t("testSent", { to: res.sentTo.join(", ") }));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel className="mb-10 grid max-w-2xl gap-5 p-5">
      <div className="grid gap-1">
        <h2 className="flex flex-wrap items-center gap-2 font-display text-xl font-semibold">
          {t("title")}
          <Badge tone={data.enabled ? "mint" : "neutral"}>{data.enabled ? t("on") : t("off")}</Badge>
        </h2>
        <p className="text-sm text-ink-2">{t("description")}</p>
      </div>
      <Checkbox label={<><span className="font-medium text-ink">{t("enabled")}</span><span className="block text-ink-3">{t("enabledHint")}</span></>} checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
      <fieldset className="grid gap-2" disabled={!form.enabled}>
        <legend className="mb-1 text-sm font-medium text-ink">{t("types")}</legend>
        <Checkbox label={t("partners")} checked={form.partners} onChange={(e) => set({ partners: e.target.checked })} />
        <Checkbox label={t("contact")} checked={form.contact} onChange={(e) => set({ contact: e.target.checked })} />
        <Checkbox label={t("digest")} checked={form.digest} onChange={(e) => set({ digest: e.target.checked })} />
      </fieldset>
      <Field label={t("recipients")} hint={t("recipientsHint", { email: data.defaultRecipient })}>
        {(f) => <Textarea {...f} dir="ltr" rows={3} value={form.recipients} onChange={(e) => set({ recipients: e.target.value })} placeholder={data.defaultRecipient} />}
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button loading={busy === "save"} onClick={save}>{t("save")}</Button>
        <Button variant="secondary" loading={busy === "test"} onClick={test}>{t("test")}</Button>
      </div>
      {data.updatedByEmail && <p className="text-xs text-ink-3">{t("updated", { date: formatDate(data.updatedAt, true), by: data.updatedByEmail })}</p>}
    </Panel>
  );
}
