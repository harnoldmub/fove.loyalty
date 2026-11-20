"use client";

import { useTranslations } from "next-intl";
import { useId, useMemo, useRef, useState } from "react";
import { getCallingCode } from "@fove/shared";
import { COUNTRY_OPTIONS, Flag, useCountryOptions } from "@/components/ui/country-select";
import { SearchSelect } from "@/components/ui/search-select";
import { cn } from "@/lib/utils";

export interface PhoneInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  defaultCountry?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  className?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

/**
 * Champ de téléphone avec sélecteur d'indicatif international et drapeau du pays.
 * Produit automatiquement un numéro au format international (E.164).
 */
export function PhoneInput({
  id,
  value,
  onChange,
  defaultCountry = "CD",
  disabled,
  required,
  placeholder,
  className,
  ...ariaProps
}: PhoneInputProps) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  const t = useTranslations("common");
  const countryOptions = useCountryOptions();
  const callingOptions = useMemo(
    () =>
      countryOptions.map((o) => {
        const code = getCallingCode(o.value);
        return { ...o, meta: code, keywords: `${code} ${code.replace("+", "")}` };
      }),
    [countryOptions],
  );

  // Liste ordonnée des pays avec indicatif (les indicatifs les plus longs en premier pour éviter les faux positifs)
  const countriesWithCode = useMemo(() => {
    return COUNTRY_OPTIONS.map((c) => ({
      ...c,
      callingCode: getCallingCode(c.code),
    })).sort((a, b) => b.callingCode.length - a.callingCode.length);
  }, []);

  // Détection du pays initial à partir de la valeur si elle commence par un "+"
  const [selectedCountry, setSelectedCountry] = useState<string>(() => {
    if (value && value.startsWith("+")) {
      const match = countriesWithCode.find((c) => value.startsWith(c.callingCode));
      if (match) return match.code;
    }
    return defaultCountry.toUpperCase();
  });

  const callingCode = useMemo(() => getCallingCode(selectedCountry), [selectedCountry]);

  // Extraction du numéro local (sans l'indicatif)
  const computeLocalNumber = useMemo(() => {
    if (!value) return "";
    if (value.startsWith(callingCode)) {
      return value.slice(callingCode.length).trim();
    }
    if (value.startsWith("+")) {
      const match = countriesWithCode.find((c) => value.startsWith(c.callingCode));
      if (match) return value.slice(match.callingCode.length).trim();
    }
    return value;
  }, [value, callingCode, countriesWithCode]);

  const [displayNumber, setDisplayNumber] = useState(computeLocalNumber);
  const [lastEmitted, setLastEmitted] = useState(value);

  // Synchronisation si la valeur change depuis l'extérieur (ex: réinitialisation du formulaire)
  if (value !== lastEmitted) {
    setLastEmitted(value);
    if (!value) {
      setDisplayNumber("");
    } else if (value.startsWith("+")) {
      const match = countriesWithCode.find((c) => value.startsWith(c.callingCode));
      if (match && match.code !== selectedCountry) setSelectedCountry(match.code);
      setDisplayNumber(computeLocalNumber);
    } else {
      setDisplayNumber(value);
    }
  }

  const numberInputRef = useRef<HTMLInputElement>(null);

  // Mettre à jour si defaultCountry change et pas de numéro saisi
  const resetKey = !value && defaultCountry ? defaultCountry.toUpperCase() : null;
  const [appliedResetKey, setAppliedResetKey] = useState(resetKey);
  if (resetKey !== appliedResetKey) {
    setAppliedResetKey(resetKey);
    if (resetKey) setSelectedCountry(resetKey);
  }

  function handleSelectCountry(code: string) {
    setSelectedCountry(code);

    const newCallingCode = getCallingCode(code);
    const digits = displayNumber.replace(/\D/g, "");
    const withoutZero = digits.replace(/^0+/, "");
    if (withoutZero) {
      const nextValue = `${newCallingCode}${withoutZero}`;
      setLastEmitted(nextValue);
      onChange(nextValue);
    } else {
      setLastEmitted("");
      onChange("");
    }
    numberInputRef.current?.focus();
  }

  function handleNumberChange(e: React.ChangeEvent<HTMLInputElement>) {
    let raw = e.target.value;
    setDisplayNumber(raw);

    // Si l'utilisateur tape ou colle un numéro au format international (avec "+" ou "00")
    if (raw.startsWith("00")) {
      raw = `+${raw.slice(2)}`;
    }

    if (raw.startsWith("+")) {
      const match = countriesWithCode.find((c) => raw.startsWith(c.callingCode));
      if (match) {
        setSelectedCountry(match.code);
        const cleanAll = raw.replace(/[^+\d]/g, "");
        const localPart = cleanAll.slice(match.callingCode.length).replace(/^0+/, "");
        setDisplayNumber(localPart);
        const nextValue = localPart ? `${match.callingCode}${localPart}` : "";
        setLastEmitted(nextValue);
        onChange(nextValue);
        return;
      }
      setLastEmitted(raw);
      onChange(raw);
      return;
    }

    // Numéro national standard
    const digits = raw.replace(/\D/g, "");
    const withoutZero = digits.replace(/^0+/, "");

    // Si l'utilisateur n'a encore tapé que des zéros ou a vidé le champ : ne pas envoyer "+243" incomplet
    if (!withoutZero) {
      setLastEmitted("");
      onChange("");
      return;
    }

    // Si l'utilisateur tape déjà son indicatif pays sans le signe "+" (ex: 24381... avec indicatif +243)
    const rawCallingDigits = callingCode.replace(/\D/g, "");
    const cleanDigits = withoutZero.startsWith(rawCallingDigits) && withoutZero.length > rawCallingDigits.length
      ? withoutZero.slice(rawCallingDigits.length).replace(/^0+/, "")
      : withoutZero;

    const nextValue = `${callingCode}${cleanDigits}`;
    setLastEmitted(nextValue);
    onChange(nextValue);
  }

  return (
    <div dir="ltr" className={cn("relative flex w-full items-stretch rounded-md shadow-1", className)}>
      {/* Sélecteur de drapeau + indicatif */}
      <SearchSelect
        variant="compact"
        value={selectedCountry}
        onChange={handleSelectCountry}
        options={callingOptions}
        disabled={disabled}
        aria-label={t("phone.callingCode", { code: callingCode, country: selectedCountry })}
        trigger={
          <>
            <Flag code={selectedCountry} className="!h-3.5 !w-[1.2rem]" />
            <span className="text-xs text-ink-2 tabular" dir="ltr">{callingCode}</span>
          </>
        }
        searchPlaceholder={t("phone.search")}
        emptyText={t("country.noResult")}
        listLabel={t("country.label")}
        frequentLabel={t("country.frequent")}
        allLabel={t("country.all")}
      />

      {/* Champ de saisie du numéro */}
      <input
        ref={numberInputRef}
        id={inputId}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        required={required}
        disabled={disabled}
        value={displayNumber}
        onChange={handleNumberChange}
        dir="ltr"
        placeholder={placeholder ?? (selectedCountry === "CD" ? "081 234 5678" : "6 12 34 56 78")}
        className="min-w-0 flex-1 rounded-e-md border border-line bg-surface px-3 py-2 text-[0.95rem] text-ink placeholder:text-ink-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cobalt disabled:opacity-60"
        {...ariaProps}
      />

    </div>
  );
}
