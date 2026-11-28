"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, Panel } from "@/components/ui/misc";
import { api, useErrorMessage } from "@/lib/api";
import { RecoveryCodes } from "./admin-mfa-gate";

interface Status {
  required: boolean;
  enabled: boolean;
  recoveryCodesLeft: number;
}

/** Admin > Système : état de la double authentification du compte et nouveaux codes de secours. */
export function AdminSecurity() {
  const t = useTranslations("admin.mfa");
  const errMsg = useErrorMessage();
  const { data, refetch } = useQuery({ queryKey: ["admin-mfa"], queryFn: () => api.get<Status>("/auth/mfa") });
  const [codes, setCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!data) return null;

  const regenerate = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ recoveryCodes: string[] }>("/auth/mfa/recovery-codes");
      setCodes(res.recoveryCodes);
      setSaved(false);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel className="mb-10 grid max-w-2xl gap-4 p-5">
      <div className="grid gap-1">
        <h2 className="flex flex-wrap items-center gap-2 font-display text-xl font-semibold">
          {t("security.title")}
          <Badge tone={data.enabled ? "mint" : "neutral"}>{data.enabled ? t("security.on") : data.required ? t("security.pending") : t("security.off")}</Badge>
        </h2>
        <p className="text-sm text-ink-2">{t("security.help")}</p>
      </div>
      {codes ? (
        <RecoveryCodes
          codes={codes}
          saved={saved}
          onSaved={setSaved}
          doneLabel={t("security.done")}
          onDone={() => {
            setCodes(null);
            void refetch();
          }}
        />
      ) : data.enabled ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-ink-2">{t("security.codesLeft", { count: data.recoveryCodesLeft })}</p>
          <Button variant="secondary" loading={busy} onClick={regenerate}>{t("security.regenerate")}</Button>
        </div>
      ) : null}
    </Panel>
  );
}
