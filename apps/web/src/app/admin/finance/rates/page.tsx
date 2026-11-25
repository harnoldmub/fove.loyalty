"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { BILLING_CURRENCIES, REFERENCE_CURRENCY } from "@fove/shared";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { PageHeader, Panel } from "@/components/ui/misc";
import { api, useErrorMessage } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { FinanceNav } from "@/components/admin/finance/finance-nav";

interface Rate {
  currency: string;
  unitsPerEur: number;
  updatedAt: string;
  updatedByEmail: string | null;
}

const CURRENCIES = BILLING_CURRENCIES.filter((c) => c !== REFERENCE_CURRENCY);

/**
 * Taux comptables (docs/chantier-multi-devises.md) : consolidation de la Finance en euros et
 * conversion des commissions des partenaires. Ils ne changent jamais le prix payé par un commerçant.
 */
export default function RatesPage() {
  const t = useTranslations("admin.finance.rates");
  const errMsg = useErrorMessage();
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["admin-fx-rates"], queryFn: () => api.get<Rate[]>("/admin/finance/exchange-rates") });
  // Saisies en cours, par-dessus les taux enregistrés.
  const [edits, setEdits] = useState<Record<string, string>>({});
  const values: Record<string, string> = { ...Object.fromEntries(data.map((r) => [r.currency, String(r.unitsPerEur)])), ...edits };
  const setValues = setEdits;
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const rates = CURRENCIES.flatMap((currency) => {
      const raw = (values[currency] ?? "").replace(/\s/g, "").replace(",", ".");
      return raw === "" ? [] : [{ currency, unitsPerEur: Number(raw) }];
    });
    if (rates.some((r) => !Number.isFinite(r.unitsPerEur) || r.unitsPerEur <= 0)) {
      toast.error(t("invalid"));
      return;
    }
    setBusy(true);
    try {
      await api.put("/admin/finance/exchange-rates", { rates });
      await qc.invalidateQueries({ queryKey: ["admin-fx-rates"] });
      setEdits({});
      toast.success(t("saved"));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <FinanceNav />
      <Panel className="grid max-w-2xl gap-4 p-5">
        <p className="text-sm text-ink-2">{t("help")}</p>
        {CURRENCIES.map((currency) => {
          const row = data.find((r) => r.currency === currency);
          return (
            <Field
              key={currency}
              label={t("label", { currency })}
              hint={row ? t("updated", { date: formatDate(row.updatedAt, true), by: row.updatedByEmail ?? t("system") }) : t("default")}
            >
              {(f) => (
                <Input
                  {...f}
                  inputMode="decimal"
                  dir="ltr"
                  value={values[currency] ?? ""}
                  onChange={(e) => setValues({ ...values, [currency]: e.target.value })}
                />
              )}
            </Field>
          );
        })}
        <Button className="justify-self-start" loading={busy} onClick={save}>
          {t("save")}
        </Button>
      </Panel>
    </>
  );
}
