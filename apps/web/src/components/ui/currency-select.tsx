"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import { SUPPORTED_CURRENCIES } from "@fove/shared";
import { Flag } from "./country-select";
import { SearchSelect } from "./search-select";

// Même logique que les pays fréquents : France, Belgique, Algérie, RD Congo, Maroc…
const FREQUENT = ["EUR", "USD", "DZD", "CDF", "MAD", "TND", "XOF", "XAF", "CHF", "CAD", "GBP"];

/**
 * La plupart des codes ISO 4217 commencent par le code ISO du territoire
 * (USD → US, CDF → CD…). Seules les devises supranationales demandent une
 * correspondance explicite.
 */
const CURRENCY_FLAG_OVERRIDES: Record<string, string> = {
  EUR: "EU",
  XAF: "CM",
  XOF: "SN",
  XCD: "AG",
  XPF: "PF",
  XDR: "UN",
  XAU: "UN",
  XAG: "UN",
  XPD: "UN",
  XPT: "UN",
  XSU: "UN",
  XUA: "UN",
  XXX: "UN",
};

export function currencyFlagCode(code: string): string {
  const upper = code.trim().toUpperCase();
  return CURRENCY_FLAG_OVERRIDES[upper] ?? upper.slice(0, 2);
}

function allCurrencies(): string[] {
  try {
    return Intl.supportedValuesOf("currency");
  } catch {
    return SUPPORTED_CURRENCIES.map((c) => c.code);
  }
}

function symbolOf(code: string, locale: string) {
  try {
    const part = new Intl.NumberFormat(locale, { style: "currency", currency: code, currencyDisplay: "narrowSymbol" })
      .formatToParts(0)
      .find((p) => p.type === "currency")?.value;
    return part && part !== code ? part : SUPPORTED_CURRENCIES.find((c) => c.code === code)?.symbol;
  } catch {
    return undefined;
  }
}

interface CurrencySelectProps {
  id?: string;
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

/** Sélecteur de devise ISO 4217 avec recherche (code, nom ou symbole). */
export function CurrencySelect(props: CurrencySelectProps) {
  const t = useTranslations("common.currency");
  const locale = useLocale();
  const options = useMemo(() => {
    const names = new Intl.DisplayNames([locale], { type: "currency" });
    const frNames = new Intl.DisplayNames(["fr"], { type: "currency" });
    const make = (code: string, frequent = false) => {
      const symbol = symbolOf(code, locale);
      const name = names.of(code) ?? code;
      return {
        value: code,
        label: `${code} · ${name}`,
        icon: <Flag code={currencyFlagCode(code)} />,
        meta: symbol,
        keywords: `${symbol ?? ""} ${frNames.of(code) ?? ""}`,
        frequent,
      };
    };
    const set = new Set(FREQUENT);
    const others = allCurrencies().filter((c) => !set.has(c)).map((c) => make(c)).sort((a, b) => a.label.localeCompare(b.label, locale));
    return [...FREQUENT.map((c) => make(c, true)), ...others];
  }, [locale]);
  return (
    <SearchSelect
      {...props}
      options={options}
      searchPlaceholder={t("search")}
      emptyText={t("noResult")}
      listLabel={t("label")}
      frequentLabel={t("frequent")}
      allLabel={t("all")}
    />
  );
}
