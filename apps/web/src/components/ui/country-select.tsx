import { Check, ChevronDown, MapPin, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface CountryOption {
  code: string;
  label: string;
  priority: boolean;
  defaultCity?: string;
  cities?: string[];
  timezone: string;
}

const ISO_CODES = [
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AR", "AT", "AU", "AW", "AZ", "BA", "BB", "BD", "BE", "BF", "BG", "BH",
  "BI", "BJ", "BL", "BM", "BN", "BO", "BR", "BS", "BT", "BW", "BY", "BZ", "CA", "CD", "CF", "CG", "CH", "CI", "CL", "CM",
  "CN", "CO", "CR", "CU", "CV", "CW", "CY", "CZ", "DE", "DJ", "DK", "DM", "DO", "DZ", "EC", "EE", "EG", "ER", "ES", "ET",
  "FI", "FJ", "FR", "GA", "GB", "GD", "GE", "GF", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GT", "GW", "GY", "HK",
  "HN", "HR", "HT", "HU", "ID", "IE", "IL", "IN", "IQ", "IR", "IS", "IT", "JM", "JO", "JP", "KE", "KG", "KH", "KM", "KN",
  "KP", "KR", "KW", "KY", "KZ", "LA", "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY", "MA", "MC", "MD", "ME",
  "MF", "MG", "MK", "ML", "MM", "MN", "MO", "MQ", "MR", "MT", "MU", "MV", "MW", "MX", "MY", "MZ", "NA", "NC", "NE", "NG",
  "NI", "NL", "NO", "NP", "NZ", "OM", "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PM", "PR", "PS", "PT", "PY", "QA", "RE",
  "RO", "RS", "RU", "RW", "SA", "SB", "SC", "SD", "SE", "SG", "SI", "SK", "SL", "SM", "SN", "SO", "SR", "SS", "ST", "SV",
  "SY", "SZ", "TD", "TG", "TH", "TJ", "TL", "TM", "TN", "TO", "TR", "TT", "TW", "TZ", "UA", "UG", "US", "UY", "UZ", "VA",
  "VC", "VE", "VN", "VU", "WF", "WS", "YE", "YT", "ZA", "ZM", "ZW",
] as const;

const PRIORITY_CODES = ["CD", "CG", "FR", "BE", "CI", "SN", "CM", "GA", "AO", "RW", "CA", "CH", "GB", "US"] as const;

const COUNTRY_LABELS: Record<string, string> = {
  CD: "RD Congo",
  CG: "Congo-Brazzaville",
};

export const SUGGESTED_CITIES: Record<string, string[]> = {
  CD: [
    "Kinshasa",
    "Lubumbashi",
    "Goma",
    "Kisangani",
    "Mbuji-Mayi",
    "Matadi",
    "Bukavu",
    "Kolwezi",
    "Kananga",
    "Boma",
    "Likasi",
    "Kikwit",
    "Mbandaka",
    "Kalemie",
    "Uvira",
    "Bunia",
    "Butembo",
    "Beni",
    "Tshikapa",
    "Kindu",
  ],
  CG: ["Brazzaville", "Pointe-Noire", "Dolisie", "Nkayi", "Ouesso", "Owando", "Impfondo"],
  FR: ["Paris", "Lyon", "Marseille", "Lille", "Bordeaux", "Toulouse", "Nantes", "Strasbourg", "Nice", "Rennes", "Montpellier"],
  BE: ["Bruxelles", "Anvers", "Liège", "Gand", "Charleroi", "Namur", "Louvain", "Mons"],
  CI: ["Abidjan", "Bouaké", "Yamoussoukro", "San-Pédro", "Daloa", "Korhogo"],
  SN: ["Dakar", "Thiès", "Saint-Louis", "Touba", "Ziguinchor", "Mbour"],
  CM: ["Douala", "Yaoundé", "Bafoussam", "Garoua", "Bamenda", "Kribi"],
  GA: ["Libreville", "Port-Gentil", "Franceville", "Oyem"],
  AO: ["Luanda", "Cabinda", "Huambo", "Benguela", "Lubango"],
  RW: ["Kigali", "Gisenyi", "Butare", "Musanze"],
  BI: ["Bujumbura", "Gitega", "Ngozi"],
  TD: ["N’Djaména", "Moundou", "Sarh", "Abéché"],
  CF: ["Bangui", "Bimbo", "Berbérati"],
  BJ: ["Cotonou", "Porto-Novo", "Parakou"],
  TG: ["Lomé", "Sokodé", "Kara"],
  BF: ["Ouagadougou", "Bobo-Dioulasso", "Koudougou"],
  ML: ["Bamako", "Sikasso", "Ségou"],
  GN: ["Conakry", "Nzérékoré", "Kankan"],
  NE: ["Niamey", "Zinder", "Maradi"],
  MG: ["Antananarivo", "Toamasina", "Antsirabe"],
  MA: ["Casablanca", "Rabat", "Marrakech", "Tanger", "Fès"],
  TN: ["Tunis", "Sfax", "Sousse"],
  DZ: ["Alger", "Oran", "Constantine"],
  ZA: ["Johannesburg", "Le Cap", "Durban", "Pretoria"],
  KE: ["Nairobi", "Mombasa", "Kisumu"],
  CA: ["Montréal", "Toronto", "Ottawa", "Québec", "Vancouver", "Calgary"],
  CH: ["Genève", "Lausanne", "Zurich", "Bâle", "Berne"],
  GB: ["Londres", "Manchester", "Birmingham", "Édimbourg"],
  US: ["New York", "Washington", "Atlanta", "Los Angeles", "Miami", "Chicago"],
};

const COUNTRY_TIMEZONES: Record<string, string> = {
  CD: "Africa/Kinshasa",
  CG: "Africa/Brazzaville",
  GA: "Africa/Libreville",
  CM: "Africa/Douala",
  AO: "Africa/Luanda",
  CI: "Africa/Abidjan",
  SN: "Africa/Dakar",
  RW: "Africa/Kigali",
  FR: "Europe/Paris",
  BE: "Europe/Brussels",
  CH: "Europe/Zurich",
  GB: "Europe/London",
  CA: "America/Toronto",
  US: "America/New_York",
};

const regionNames = typeof Intl !== "undefined" ? new Intl.DisplayNames(["fr"], { type: "region" }) : null;

function labelForCountry(code: string): string {
  return COUNTRY_LABELS[code] ?? regionNames?.of(code) ?? code;
}

export const COUNTRY_OPTIONS: CountryOption[] = (() => {
  const prioritySet = new Set<string>(PRIORITY_CODES);
  const priority = PRIORITY_CODES.map((code) => ({
    code,
    label: labelForCountry(code),
    priority: true,
    defaultCity: SUGGESTED_CITIES[code]?.[0],
    cities: SUGGESTED_CITIES[code],
    timezone: COUNTRY_TIMEZONES[code] ?? "Africa/Kinshasa",
  }));
  const others = ISO_CODES.filter((code) => !prioritySet.has(code))
    .map((code) => ({
      code,
      label: labelForCountry(code),
      priority: false,
      defaultCity: SUGGESTED_CITIES[code]?.[0],
      cities: SUGGESTED_CITIES[code],
      timezone: COUNTRY_TIMEZONES[code] ?? "Europe/Paris",
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));
  return [...priority, ...others];
})();

export function getCountryOption(code: string): CountryOption | undefined {
  return COUNTRY_OPTIONS.find((c) => c.code === code.toUpperCase());
}

/** Convertit un code ISO alpha-2 ("CD") en emoji drapeau ("🇨🇩"). */
export function countryFlagEmoji(code: string): string {
  const upper = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return "🏳️";
  return String.fromCodePoint(...[...upper].map((char) => 0x1f1e6 + char.charCodeAt(0) - 65));
}

export function Flag({ code, className }: { code: string; className?: string }) {
  const clean = code.trim().toLowerCase();
  const [failedCode, setFailedCode] = useState<string | null>(null);
  const imgFailed = failedCode === clean;

  if (imgFailed || !/^[a-z]{2}$/.test(clean)) {
    return (
      <span aria-hidden="true" className={cn("inline-flex shrink-0 select-none text-lg leading-none", className)}>
        {countryFlagEmoji(code)}
      </span>
    );
  }

  return (
    <img
      src={`https://flagcdn.com/${clean}.svg`}
      alt=""
      aria-hidden="true"
      onError={() => setFailedCode(clean)}
      className={cn("h-4 w-[1.35rem] shrink-0 rounded-[2px] object-cover ring-1 ring-black/10", className)}
    />
  );
}

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

interface CountrySelectProps {
  id?: string;
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

/**
 * Sélecteur de pays avec drapeaux et recherche instantanée.
 */
export function CountrySelect({ id, value, onChange, disabled, ...aria }: CountrySelectProps) {
  const fallbackId = useId();
  const baseId = id ?? fallbackId;
  const listId = `${baseId}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const selected = useMemo(() => getCountryOption(value) ?? COUNTRY_OPTIONS[0]!, [value]);
  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return COUNTRY_OPTIONS;
    return COUNTRY_OPTIONS.filter((opt) => normalize(opt.label).includes(q) || opt.code.toLowerCase() === q);
  }, [query]);
  const showGroups = !query.trim();
  const firstOther = filtered.findIndex((opt) => !opt.priority);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => search.current?.focus());
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function openList() {
    setActive(Math.max(0, filtered.findIndex((opt) => opt.code === value)));
    setOpen(true);
  }

  function close(focusTrigger = true) {
    setOpen(false);
    setQuery("");
    if (focusTrigger) trigger.current?.focus();
  }

  function choose(code: string) {
    onChange(code);
    close();
  }

  function onSearchKey(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(filtered.length - 1, i + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (event.key === "Home") {
      setActive(0);
    } else if (event.key === "End") {
      setActive(filtered.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = filtered[active];
      if (option) choose(option.code);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Tab") {
      close(false);
    }
  }

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        id={baseId}
        type="button"
        disabled={disabled}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        {...aria}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp"].includes(event.key)) {
            event.preventDefault();
            if (!open) openList();
          }
        }}
        className="flex h-11 w-full items-center gap-2.5 rounded-md bg-surface px-3.5 text-left text-[0.95rem] text-ink shadow-1 transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cobalt aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-danger disabled:opacity-60"
      >
        <Flag code={selected.code} />
        <span className="flex-1 truncate">{selected.label}</span>
        <ChevronDown className={cn("size-4 shrink-0 text-ink-3 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute inset-x-0 top-full z-50 mt-1.5 overflow-hidden rounded-[var(--radius)] bg-surface shadow-2 ring-1 ring-line">
          <div className="flex items-center gap-2 border-b border-line px-3">
            <Search className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
            <input
              ref={search}
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActive(0); }}
              onKeyDown={onSearchKey}
              placeholder="Rechercher un pays…"
              aria-label="Rechercher un pays"
              aria-controls={listId}
              aria-activedescendant={filtered[active] ? `${baseId}-${filtered[active].code}` : undefined}
              autoComplete="off"
              className="h-10 w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
            />
          </div>
          <ul ref={list} id={listId} role="listbox" aria-label="Pays" className="max-h-64 overflow-y-auto overscroll-contain py-1">
            {filtered.length === 0 && <li className="px-3.5 py-3 text-sm text-ink-3">Aucun pays trouvé.</li>}
            {filtered.map((option, index) => (
              <li key={option.code} role="presentation">
                {showGroups && index === 0 && option.priority && (
                  <p className="px-3.5 pt-2 pb-1 text-xs font-semibold text-ink-3">Pays fréquents</p>
                )}
                {showGroups && index === firstOther && firstOther > 0 && (
                  <p className="mt-1 border-t border-line px-3.5 pt-2.5 pb-1 text-xs font-semibold text-ink-3">Tous les pays</p>
                )}
                <div
                  id={`${baseId}-${option.code}`}
                  role="option"
                  data-index={index}
                  aria-selected={option.code === value}
                  onPointerMove={() => setActive(index)}
                  onClick={() => choose(option.code)}
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 px-3.5 py-2 text-sm text-ink",
                    index === active && "bg-surface-2",
                    option.code === value && "font-semibold",
                  )}
                >
                  <Flag code={option.code} />
                  <span className="flex-1 truncate">{option.label}</span>
                  {option.code === value && <Check className="size-4 text-cobalt" aria-hidden="true" />}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

interface CitySelectProps {
  id?: string;
  countryCode: string;
  value: string;
  onChange: (city: string) => void;
  disabled?: boolean;
  placeholder?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

/**
 * Sélecteur de ville adapté au pays sélectionné, avec recherche et saisie libre.
 */
export function CitySelect({
  id,
  countryCode,
  value,
  onChange,
  disabled,
  placeholder = "Sélectionner une ville…",
  ...aria
}: CitySelectProps) {
  const fallbackId = useId();
  const baseId = id ?? fallbackId;
  const listId = `${baseId}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const cities = useMemo(() => {
    const preset = SUGGESTED_CITIES[countryCode.toUpperCase()] ?? [];
    if (value && !preset.some((c) => normalize(c) === normalize(value))) {
      return [value, ...preset];
    }
    return preset;
  }, [countryCode, value]);

  const trimmedQuery = query.trim();
  const filtered = useMemo(() => {
    const q = normalize(trimmedQuery);
    const matches = q ? cities.filter((c) => normalize(c).includes(q)) : cities;
    if (trimmedQuery && !matches.some((c) => normalize(c) === q)) {
      return [...matches, trimmedQuery];
    }
    return matches;
  }, [cities, trimmedQuery]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => search.current?.focus());
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function openList() {
    setActive(Math.max(0, filtered.findIndex((c) => normalize(c) === normalize(value))));
    setOpen(true);
  }

  function close(focusTrigger = true) {
    setOpen(false);
    setQuery("");
    if (focusTrigger) trigger.current?.focus();
  }

  function choose(city: string) {
    onChange(city);
    close();
  }

  function onSearchKey(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(filtered.length - 1, i + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (event.key === "Home") {
      setActive(0);
    } else if (event.key === "End") {
      setActive(filtered.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = filtered[active] ?? trimmedQuery;
      if (option) choose(option);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Tab") {
      if (trimmedQuery && filtered.length === 1) {
        onChange(trimmedQuery);
      }
      close(false);
    }
  }

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        id={baseId}
        type="button"
        disabled={disabled}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        {...aria}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp"].includes(event.key)) {
            event.preventDefault();
            if (!open) openList();
          }
        }}
        className="flex h-11 w-full items-center gap-2.5 rounded-md bg-surface px-3.5 text-left text-[0.95rem] text-ink shadow-1 transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cobalt aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-danger disabled:opacity-60"
      >
        <MapPin className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
        <span className={cn("flex-1 truncate", !value && "text-ink-3")}>{value || placeholder}</span>
        <ChevronDown className={cn("size-4 shrink-0 text-ink-3 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute inset-x-0 top-full z-50 mt-1.5 overflow-hidden rounded-[var(--radius)] bg-surface shadow-2 ring-1 ring-line">
          <div className="flex items-center gap-2 border-b border-line px-3">
            <Search className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
            <input
              ref={search}
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActive(0); }}
              onKeyDown={onSearchKey}
              placeholder="Rechercher ou saisir une ville…"
              aria-label="Rechercher ou saisir une ville"
              aria-controls={listId}
              autoComplete="off"
              className="h-10 w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
            />
          </div>
          <ul ref={list} id={listId} role="listbox" aria-label="Ville" className="max-h-60 overflow-y-auto overscroll-contain py-1">
            {filtered.length === 0 && (
              <li className="px-3.5 py-3 text-sm text-ink-3">Saisissez le nom de votre ville ci-dessus.</li>
            )}
            {filtered.map((city, index) => {
              const isCustom = trimmedQuery === city && !cities.some((c) => normalize(c) === normalize(city));
              const isSelected = normalize(city) === normalize(value);
              return (
                <li key={city} role="presentation">
                  <div
                    role="option"
                    data-index={index}
                    aria-selected={isSelected}
                    onPointerMove={() => setActive(index)}
                    onClick={() => choose(city)}
                    className={cn(
                      "flex cursor-pointer items-center gap-2.5 px-3.5 py-2 text-sm text-ink",
                      index === active && "bg-surface-2",
                      isSelected && "font-semibold",
                    )}
                  >
                    <MapPin className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
                    <span className="flex-1 truncate">{isCustom ? `Utiliser « ${city} »` : city}</span>
                    {isSelected && <Check className="size-4 text-cobalt" aria-hidden="true" />}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
