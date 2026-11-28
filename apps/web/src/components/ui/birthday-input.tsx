"use client";

import { useLocale, useTranslations } from "next-intl";
import { Select } from "@/components/ui/field";
import { cn } from "@/lib/utils";

export interface Birthday {
  birthDay: number | null;
  birthMonth: number | null;
}

const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Anniversaire : jour et mois seulement (jamais l'année), facultatif. Le jour est limité au mois
 * choisi (pas de 31 avril). docs/chantier-relances-anniversaire.md.
 */
export function BirthdayInput({ value, onChange, className, hint }: { value: Birthday; onChange: (v: Birthday) => void; className?: string; hint?: string }) {
  const t = useTranslations("common.birthday");
  const locale = useLocale();
  const monthName = (m: number) => new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2024, m - 1, 1)));
  const maxDay = value.birthMonth ? MONTH_DAYS[value.birthMonth - 1]! : 31;
  return (
    <fieldset className={cn("grid gap-1.5", className)}>
      <legend className="mb-1.5 text-sm font-medium text-ink">{t("label")}</legend>
      <div className="grid grid-cols-[5.5rem_1fr] gap-2">
        <Select
          aria-label={t("day")}
          value={value.birthDay ?? ""}
          onChange={(e) => {
            const day = e.target.value ? Number(e.target.value) : null;
            onChange({ birthDay: day, birthMonth: day === null ? null : value.birthMonth });
          }}
        >
          <option value="">{t("day")}</option>
          {Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
        </Select>
        <Select
          aria-label={t("month")}
          value={value.birthMonth ?? ""}
          onChange={(e) => {
            const month = e.target.value ? Number(e.target.value) : null;
            const day = month && value.birthDay && value.birthDay > MONTH_DAYS[month - 1]! ? MONTH_DAYS[month - 1]! : value.birthDay;
            onChange({ birthDay: month === null ? null : day, birthMonth: month });
          }}
        >
          <option value="">{t("month")}</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
        </Select>
      </div>
      {hint && <p className="text-xs text-ink-3">{hint}</p>}
    </fieldset>
  );
}

/** « 12 mars » dans la langue de l'interface (pas d'année). */
export function useFormatBirthday() {
  const locale = useLocale();
  return (day: number | null | undefined, month: number | null | undefined) =>
    day && month ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2024, month - 1, day))) : null;
}
