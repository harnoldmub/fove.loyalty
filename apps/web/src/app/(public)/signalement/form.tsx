"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { ErrorNote, Panel } from "@/components/ui/misc";
import { api, useErrorMessage } from "@/lib/api";

export function ReportForm({ token }: { token: string }) {
  const t = useTranslations("public.collectionReport");
  const errMsg = useErrorMessage();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(token ? null : t("invalid"));

  if (done) {
    return (
      <Panel className="grid gap-2 p-6">
        <h1 className="font-display text-2xl font-semibold">{t("doneTitle")}</h1>
        <p className="text-ink-2">{t("doneText")}</p>
      </Panel>
    );
  }
  return (
    <Panel className="grid gap-4 p-6">
      <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
      <p className="text-ink-2">{t("intro")}</p>
      {error && <ErrorNote>{error}</ErrorNote>}
      <Field label={t("note")} hint={t("noteHint")}>
        {(f) => <Textarea {...f} rows={4} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />}
      </Field>
      <Button
        loading={busy}
        disabled={!token}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await api.post("/public/collection-report", { token, note: note.trim() || undefined });
            setDone(true);
          } catch (e) {
            setError(errMsg(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {t("submit")}
      </Button>
    </Panel>
  );
}
