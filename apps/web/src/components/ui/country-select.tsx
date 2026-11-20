"use client";

import "flag-icons/css/flag-icons.min.css";
import { MapPin } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { normalizeSearch, SearchSelect, type SearchOption } from "./search-select";

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

// Ordre voulu : France, Belgique, Algérie, RD Congo, Maroc, puis le reste de la clientèle.
export const PRIORITY_CODES = ["FR", "BE", "DZ", "CD", "MA", "TN", "CI", "SN", "CM", "CG", "GA", "CH", "CA", "ES", "GB", "US"] as const;

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
  DZ: "Africa/Algiers",
  MA: "Africa/Casablanca",
  TN: "Africa/Tunis",
  ES: "Europe/Madrid",
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

/**
 * Détecte automatiquement le pays du client en se basant sur :
 * 1. Le fuseau horaire du navigateur (Intl.DateTimeFormat)
 * 2. Les locales déclarées (navigator.languages)
 * 3. Repli sur la France
 */
export function detectClientCountry(): string {
  if (typeof window === "undefined") return "FR";

  // 1. Détection via le fuseau horaire
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) {
      for (const [code, cTz] of Object.entries(COUNTRY_TIMEZONES)) {
        if (cTz === tz) return code;
      }
      if (tz.includes("Kinshasa") || tz.includes("Lubumbashi")) return "CD";
      if (tz.includes("Brazzaville")) return "CG";
      if (tz.includes("Paris")) return "FR";
      if (tz.includes("Brussels") || tz.includes("Bruxelles")) return "BE";
      if (tz.includes("Zurich") || tz.includes("Geneva")) return "CH";
      if (tz.includes("London")) return "GB";
      if (tz.includes("Abidjan")) return "CI";
      if (tz.includes("Dakar")) return "SN";
      if (tz.includes("Douala") || tz.includes("Yaounde")) return "CM";
      if (tz.includes("Libreville")) return "GA";
      if (tz.includes("Luanda")) return "AO";
      if (tz.includes("Kigali")) return "RW";
      if (tz.includes("Bujumbura")) return "BI";
      if (tz.includes("Casablanca")) return "MA";
      if (tz.includes("Tunis")) return "TN";
      if (tz.includes("Algiers")) return "DZ";
      if (tz.includes("Montreal") || tz.includes("Toronto") || tz.includes("Vancouver")) return "CA";
      if (tz.includes("New_York") || tz.includes("Chicago") || tz.includes("Los_Angeles")) return "US";
      if (tz.includes("Lome")) return "TG";
      if (tz.includes("Cotonou")) return "BJ";
      if (tz.includes("Ouagadougou")) return "BF";
      if (tz.includes("Bamako")) return "ML";
      if (tz.includes("Conakry")) return "GN";
      if (tz.includes("Niamey")) return "NE";
      if (tz.includes("Ndjamena")) return "TD";
      if (tz.includes("Bangui")) return "CF";
      if (tz.includes("Antananarivo")) return "MG";
      if (tz.includes("Johannesburg")) return "ZA";
      if (tz.includes("Nairobi")) return "KE";
      if (tz.includes("Berlin")) return "DE";
      if (tz.includes("Madrid")) return "ES";
      if (tz.includes("Rome")) return "IT";
      if (tz.includes("Lisbon")) return "PT";
      if (tz.includes("Amsterdam")) return "NL";
    }
  } catch {
    // Continuer
  }

  // 2. Détection via les locales du navigateur (ex: fr-FR, fr-CD, fr-BE, en-US)
  try {
    const list = navigator.languages?.length ? navigator.languages : [navigator.language];
    for (const lang of list) {
      if (!lang) continue;
      const sub = lang.split("-")[1]?.toUpperCase();
      if (sub && sub.length === 2 && getCountryOption(sub)) {
        return sub;
      }
    }
  } catch {
    // Continuer
  }

  return "FR";
}

/** Convertit un code ISO alpha-2 ("CD") en emoji drapeau ("🇨🇩"). */
export function countryFlagEmoji(code: string): string {
  const upper = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return "🏳️";
  return String.fromCodePoint(...[...upper].map((char) => 0x1f1e6 + char.charCodeAt(0) - 65));
}

/** Drapeau embarqué (paquet flag-icons) : rien à charger depuis un site tiers. */
export function Flag({ code, className }: { code: string; className?: string }) {
  const clean = code.trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(clean)) return <span aria-hidden="true" className={cn("inline-block h-4 w-[1.35rem] shrink-0 rounded-[2px] bg-surface-2", className)} />;
  return <span aria-hidden="true" className={cn(`fi fi-${clean} !h-4 !w-[1.35rem] shrink-0 rounded-[2px] !bg-cover ring-1 ring-black/10`, className)} />;
}

/** Pays avec leur nom dans la langue de l'interface, fréquents en tête. */
export function useCountryOptions(): SearchOption[] {
  const locale = useLocale();
  return useMemo(() => {
    const names = new Intl.DisplayNames([locale], { type: "region" });
    const label = (code: string) => (locale === "fr" ? labelForCountry(code) : (names.of(code) ?? code));
    const frequent = PRIORITY_CODES.map((code) => ({ value: code, label: label(code), icon: <Flag code={code} />, frequent: true }));
    const prioritySet = new Set<string>(PRIORITY_CODES);
    const others = ISO_CODES.filter((code) => !prioritySet.has(code))
      .map((code) => ({ value: code, label: label(code), keywords: labelForCountry(code), icon: <Flag code={code} /> }))
      .sort((a, b) => a.label.localeCompare(b.label, locale));
    return [...frequent, ...others];
  }, [locale]);
}

interface CountrySelectProps {
  id?: string;
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

/** Sélecteur de pays avec drapeaux et recherche instantanée. */
export function CountrySelect(props: CountrySelectProps) {
  const t = useTranslations("common.country");
  const options = useCountryOptions();
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

interface CityApiItem {
  name: string;
  admin1?: string;
}

const geocodeCache = new Map<string, CityApiItem[]>();

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
 * Sélecteur de ville : suggestions locales par pays, recherche mondiale
 * (géocodage Open-Meteo) et saisie libre.
 */
export function CitySelect({ countryCode, value, onChange, placeholder, ...rest }: CitySelectProps) {
  const t = useTranslations("common.city");
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<{ key: string; items: CityApiItem[] } | null>(null);
  const country = countryCode.toUpperCase();
  const q = query.trim();
  const key = `${country}:${locale}:${normalizeSearch(q)}`;

  useEffect(() => {
    if (q.length < 2 || geocodeCache.has(key)) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const countryParam = country ? `&country_code=${encodeURIComponent(country.toLowerCase())}` : "";
        const res = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=10&language=${locale}${countryParam}`,
          { signal: controller.signal },
        );
        const data = (await res.json()) as { results?: { name: string; admin1?: string; admin2?: string }[] };
        const items = (data.results ?? []).map((r) => ({ name: r.name, admin1: r.admin1 ?? r.admin2 }));
        geocodeCache.set(key, items);
        setRemote({ key, items });
      } catch {
        // Hors ligne ou requête annulée : les suggestions locales suffisent.
      }
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [q, key, country, locale]);

  const options = useMemo(() => {
    const preset = SUGGESTED_CITIES[country] ?? [];
    const remoteItems = q.length >= 2 ? (geocodeCache.get(key) ?? (remote?.key === key ? remote.items : [])) : [];
    const seen = new Set<string>();
    const out: SearchOption[] = [];
    const push = (name: string, meta?: string) => {
      const k = normalizeSearch(name);
      if (seen.has(k)) return;
      seen.add(k);
      out.push({ value: name, label: name, meta, icon: <MapPin className="size-4 shrink-0 text-ink-3" aria-hidden="true" /> });
    };
    if (value) push(value);
    if (q) {
      remoteItems.forEach((c) => push(c.name, c.admin1));
      preset.filter((c) => normalizeSearch(c).includes(normalizeSearch(q))).forEach((c) => push(c));
    } else {
      preset.forEach((c) => push(c));
    }
    return out;
  }, [country, key, q, remote, value]);

  const loading = q.length >= 2 && !geocodeCache.has(key);

  return (
    <SearchSelect
      {...rest}
      value={value}
      onChange={onChange}
      options={options}
      query={query}
      onQueryChange={setQuery}
      loading={loading}
      placeholder={placeholder ?? t("placeholder")}
      trigger={
        <>
          <MapPin className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
          <span className={cn("flex-1 truncate", !value && "text-ink-3")}>{value || placeholder || t("placeholder")}</span>
        </>
      }
      searchPlaceholder={t("search")}
      emptyText={t("typeToSearch")}
      listLabel={t("label")}
      customOption={(typed) =>
        options.some((o) => normalizeSearch(o.value) === normalizeSearch(typed))
          ? null
          : { value: typed, label: t("useTyped", { value: typed }), icon: <MapPin className="size-4 shrink-0 text-cobalt" aria-hidden="true" /> }
      }
    />
  );
}
