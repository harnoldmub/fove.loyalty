"use client";

import { ChevronDown, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { getCallingCode } from "@fove/shared";
import {
  COUNTRY_OPTIONS,
  Flag,
  getCountryOption,
  type CountryOption,
} from "@/components/ui/country-select";
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

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

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
  const listId = `${inputId}-country-list`;

  // Détection du pays initial à partir de la valeur si elle commence par un "+"
  const [selectedCountry, setSelectedCountry] = useState<string>(() => {
    if (value && value.startsWith("+")) {
      // Trouver si un pays correspond au préfixe
      const match = COUNTRY_OPTIONS.find((c) => value.startsWith(getCallingCode(c.code)));
      if (match) return match.code;
    }
    return defaultCountry.toUpperCase();
  });

  const callingCode = useMemo(() => getCallingCode(selectedCountry), [selectedCountry]);

  // Extraction du numéro local (sans l'indicatif)
  const localNumber = useMemo(() => {
    if (!value) return "";
    if (value.startsWith(callingCode)) {
      return value.slice(callingCode.length).trim();
    }
    return value;
  }, [value, callingCode]);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const numberInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Mettre à jour si defaultCountry change et pas de numéro saisi
  const resetKey = !value && defaultCountry ? defaultCountry.toUpperCase() : null;
  const [appliedResetKey, setAppliedResetKey] = useState(resetKey);
  if (resetKey !== appliedResetKey) {
    setAppliedResetKey(resetKey);
    if (resetKey) setSelectedCountry(resetKey);
  }

  // Fermeture du dropdown lors d'un clic extérieur
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => searchInputRef.current?.focus());

    const onPointer = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  // Liste filtrée des pays avec leur indicatif
  const countriesWithCode = useMemo(() => {
    return COUNTRY_OPTIONS.map((c) => ({
      ...c,
      callingCode: getCallingCode(c.code),
    }));
  }, []);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return countriesWithCode;
    const cleanDigits = query.replace(/[^\d]/g, "");
    return countriesWithCode.filter((c) => {
      return (
        normalize(c.label).includes(q) ||
        c.code.toLowerCase() === q ||
        (cleanDigits && c.callingCode.replace(/[^\d]/g, "").includes(cleanDigits))
      );
    });
  }, [query, countriesWithCode]);

  // Défilement automatique vers l'élément actif
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function handleSelectCountry(code: string) {
    setSelectedCountry(code);
    setOpen(false);
    setQuery("");

    const newCallingCode = getCallingCode(code);
    if (localNumber) {
      const clean = localNumber.replace(/^0+/, "");
      onChange(`${newCallingCode}${clean}`);
    }
    numberInputRef.current?.focus();
  }

  function handleNumberChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;

    // Si l'utilisateur colle un numéro international complet commençant par "+"
    if (raw.startsWith("+")) {
      const match = countriesWithCode.find((c) => raw.startsWith(c.callingCode));
      if (match) {
        setSelectedCountry(match.code);
        onChange(raw.replace(/\s+/g, ""));
        return;
      }
      onChange(raw);
      return;
    }

    // Retirer le 0 initial pour le format international canonique E.164
    const cleanLocal = raw.trim();
    if (!cleanLocal) {
      onChange("");
      return;
    }
    const normalizedDigits = cleanLocal.replace(/\s+/g, "");
    const withoutLeadingZero = normalizedDigits.startsWith("0") ? normalizedDigits.slice(1) : normalizedDigits;
    onChange(`${callingCode}${withoutLeadingZero}`);
  }

  return (
    <div ref={containerRef} className={cn("relative flex w-full items-stretch rounded-md shadow-1", className)}>
      {/* Sélecteur de drapeau + indicatif */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`Indicatif téléphonique : ${callingCode} (${selectedCountry})`}
        onClick={() => setOpen((prev) => !prev)}
        className="flex shrink-0 items-center gap-1.5 rounded-l-md border-y border-l border-line bg-surface-2 px-3 text-sm font-medium text-ink transition-colors hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cobalt disabled:opacity-60"
      >
        <Flag code={selectedCountry} className="h-3.5 w-[1.2rem]" />
        <span className="font-mono text-xs text-ink-2">{callingCode}</span>
        <ChevronDown className={cn("size-3.5 text-ink-3 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>

      {/* Champ de saisie du numéro */}
      <input
        ref={numberInputRef}
        id={inputId}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        required={required}
        disabled={disabled}
        value={localNumber}
        onChange={handleNumberChange}
        placeholder={placeholder ?? (selectedCountry === "CD" ? "081 234 5678" : "6 12 34 56 78")}
        className="min-w-0 flex-1 rounded-r-md border border-line bg-surface px-3 py-2 text-[0.95rem] text-ink placeholder:text-ink-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cobalt disabled:opacity-60"
        {...ariaProps}
      />

      {/* Dropdown de recherche de pays */}
      {open && (
        <div className="absolute inset-x-0 top-full z-50 mt-1.5 max-h-72 overflow-hidden rounded-md border border-line bg-surface shadow-2">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <Search className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              placeholder="Rechercher un pays ou indicatif…"
              aria-label="Rechercher un pays"
              className="w-full bg-transparent text-sm text-ink placeholder:text-ink-3 focus-visible:outline-none"
            />
          </div>

          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label="Sélectionnez un pays pour l’indicatif"
            className="max-h-56 overflow-y-auto py-1"
          >
            {filtered.length === 0 ? (
              <li className="px-3.5 py-3 text-center text-xs text-ink-3">Aucun pays trouvé.</li>
            ) : (
              filtered.map((item, idx) => {
                const isSelected = item.code === selectedCountry;
                return (
                  <li
                    key={item.code}
                    data-index={idx}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelectCountry(item.code)}
                    onMouseEnter={() => setActive(idx)}
                    className={cn(
                      "flex cursor-pointer items-center justify-between gap-2.5 px-3.5 py-2 text-sm transition-colors",
                      idx === active && "bg-surface-2",
                      isSelected && "font-semibold text-cobalt"
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Flag code={item.code} className="h-3.5 w-[1.2rem]" />
                      <span className="truncate">{item.label}</span>
                    </div>
                    <span className="shrink-0 font-mono text-xs text-ink-3">{item.callingCode}</span>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
