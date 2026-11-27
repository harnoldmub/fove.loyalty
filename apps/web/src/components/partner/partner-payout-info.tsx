"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Panel } from "@/components/ui/misc";
import { api, useErrorMessage } from "@/lib/api";

interface PayoutInfo {
  accountHolder?: string;
  iban?: string;
  bic?: string;
  bankName?: string;
}

/** Coordonnées bancaires où FOVE verse les commissions chaque mois (virement uniquement). */
export function PartnerPayoutInfo({ initial, onSaved }: { initial: PayoutInfo | null; onSaved: () => void }) {
  const t = useTranslations("partner.payoutModal");
  const tp = useTranslations("partner.dashboard.payouts");
  const errMsg = useErrorMessage();
  const [info, setInfo] = useState<PayoutInfo>(() => ({
    accountHolder: initial?.accountHolder ?? "",
    iban: initial?.iban ?? "",
    bic: initial?.bic ?? "",
    bankName: initial?.bankName ?? "",
  }));
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<PayoutInfo>) => setInfo({ ...info, ...patch });

  const save = async () => {
    if (!info.accountHolder?.trim() || !info.iban?.trim()) {
      toast.error(t("errors.bankRequired"));
      return;
    }
    setBusy(true);
    try {
      const payoutInfo = { method: "BANK_TRANSFER", accountHolder: info.accountHolder, iban: info.iban, bic: info.bic || undefined, bankName: info.bankName || undefined };
      await api.patch("/partner/profile", { payoutInfo });
      toast.success(tp("infoSaved"));
      onSaved();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel className="grid gap-3 p-6">
      <div>
        <h3 className="font-display text-base font-bold text-ink">{tp("infoTitle")}</h3>
        <p className="text-xs text-ink-3">{tp("infoHelp")}</p>
      </div>
      <p className="text-sm text-ink-2">{t("bankTransfer")}</p>
      <Field label={t("accountHolder")}>{(f) => <Input {...f} value={info.accountHolder ?? ""} onChange={(e) => set({ accountHolder: e.target.value })} />}</Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("iban")}>{(f) => <Input {...f} dir="ltr" value={info.iban ?? ""} onChange={(e) => set({ iban: e.target.value })} />}</Field>
        <Field label={t("bic")}>{(f) => <Input {...f} dir="ltr" value={info.bic ?? ""} onChange={(e) => set({ bic: e.target.value })} />}</Field>
        <Field label={t("bankName")}>{(f) => <Input {...f} value={info.bankName ?? ""} onChange={(e) => set({ bankName: e.target.value })} />}</Field>
      </div>
      <Button className="justify-self-start" loading={busy} onClick={save}>{tp("infoSave")}</Button>
    </Panel>
  );
}
