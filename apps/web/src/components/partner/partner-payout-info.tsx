"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Panel } from "@/components/ui/misc";
import { api, useErrorMessage } from "@/lib/api";

const MOBILE_PROVIDERS = ["AIRTEL_MONEY", "ORANGE_MONEY", "M_PESA", "MTN_MOMO", "OTHER"] as const;

interface PayoutInfo {
  method?: "BANK_TRANSFER" | "MOBILE_MONEY";
  accountHolder?: string;
  mobileHolder?: string;
  iban?: string;
  bic?: string;
  bankName?: string;
  mobileProvider?: string;
  mobileNumber?: string;
}

/** Coordonnées où FOVE verse les commissions chaque mois (virement bancaire ou mobile money). */
export function PartnerPayoutInfo({ initial, onSaved }: { initial: PayoutInfo | null; onSaved: () => void }) {
  const t = useTranslations("partner.payoutModal");
  const tp = useTranslations("partner.dashboard.payouts");
  const errMsg = useErrorMessage();
  const [info, setInfo] = useState<PayoutInfo>(() => ({ method: "BANK_TRANSFER", ...initial, accountHolder: initial?.accountHolder ?? initial?.mobileHolder ?? "" }));
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<PayoutInfo>) => setInfo({ ...info, ...patch });
  const bank = info.method !== "MOBILE_MONEY";

  const save = async () => {
    if (!info.accountHolder?.trim() || (bank ? !info.iban?.trim() : !info.mobileNumber?.trim())) {
      toast.error(bank ? t("errors.bankRequired") : t("errors.mobileRequired"));
      return;
    }
    setBusy(true);
    try {
      const payoutInfo = bank
        ? { method: "BANK_TRANSFER", accountHolder: info.accountHolder, iban: info.iban, bic: info.bic || undefined, bankName: info.bankName || undefined }
        : { method: "MOBILE_MONEY", accountHolder: info.accountHolder, mobileProvider: info.mobileProvider ?? "OTHER", mobileNumber: info.mobileNumber };
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
      <Field label={t("method")}>
        {(f) => (
          <Select {...f} value={info.method} onChange={(e) => set({ method: e.target.value as PayoutInfo["method"] })}>
            <option value="BANK_TRANSFER">{t("bankTransfer")}</option>
            <option value="MOBILE_MONEY">{t("mobileMoney")}</option>
          </Select>
        )}
      </Field>
      <Field label={t("accountHolder")}>{(f) => <Input {...f} value={info.accountHolder ?? ""} onChange={(e) => set({ accountHolder: e.target.value })} />}</Field>
      {bank ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("iban")}>{(f) => <Input {...f} dir="ltr" value={info.iban ?? ""} onChange={(e) => set({ iban: e.target.value })} />}</Field>
          <Field label={t("bic")}>{(f) => <Input {...f} dir="ltr" value={info.bic ?? ""} onChange={(e) => set({ bic: e.target.value })} />}</Field>
          <Field label={t("bankName")}>{(f) => <Input {...f} value={info.bankName ?? ""} onChange={(e) => set({ bankName: e.target.value })} />}</Field>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("provider")}>
            {(f) => (
              <Select {...f} value={info.mobileProvider ?? "AIRTEL_MONEY"} onChange={(e) => set({ mobileProvider: e.target.value })}>
                {MOBILE_PROVIDERS.map((p) => <option key={p} value={p}>{t(`providers.${p}`)}</option>)}
              </Select>
            )}
          </Field>
          <Field label={t("mobileNumber")}>{(f) => <Input {...f} dir="ltr" inputMode="tel" value={info.mobileNumber ?? ""} onChange={(e) => set({ mobileNumber: e.target.value })} />}</Field>
        </div>
      )}
      <Button className="justify-self-start" loading={busy} onClick={save}>{tp("infoSave")}</Button>
    </Panel>
  );
}
