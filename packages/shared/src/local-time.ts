/**
 * Dates et heures dans le fuseau d'un commerce (docs/chantier-relances-anniversaire.md) : tout est
 * stocké et comparé en UTC, mais « aujourd'hui », la plage d'envoi et l'anniversaire se lisent à
 * l'heure locale du commerce (fuseau IANA : Africa/Kinshasa, Europe/Paris…, heure d'été comprise).
 */
export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Fuseau valide, sinon celui par défaut des commerces (Kinshasa). */
export function safeTimeZone(timeZone: string | null | undefined, fallback = "Africa/Kinshasa"): string {
  if (!timeZone) return fallback;
  try {
    formatter(timeZone);
    return timeZone;
  } catch {
    return fallback;
  }
}

/** Date et heure locales d'un instant dans un fuseau. */
export function zonedParts(date: Date, timeZone: string): LocalParts {
  const parts = Object.fromEntries(formatter(safeTimeZone(timeZone)).formatToParts(date).map((p) => [p.type, p.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour: Number(parts.hour), minute: Number(parts.minute) };
}

/** « 2026-11-28 » : jour local, pour les clés d'unicité (un envoi par jour). */
export function localDateKey(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Heure locale comprise dans [from, to[ (par exemple 10 h – 19 h). */
export function isLocalHourBetween(date: Date, timeZone: string, from: number, to: number): boolean {
  const { hour } = zonedParts(date, timeZone);
  return hour >= from && hour < to;
}

const isLeap = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/** Jour de l'anniversaire pour une année : le 29 février devient le 28 les années non bissextiles. */
export function birthdayInYear(day: number, month: number, year: number): { year: number; month: number; day: number } {
  return month === 2 && day === 29 && !isLeap(year) ? { year, month: 2, day: 28 } : { year, month, day };
}

const dayNumber = (d: { year: number; month: number; day: number }) => Date.UTC(d.year, d.month - 1, d.day) / 86_400_000;

/**
 * Position du jour local par rapport à l'anniversaire le plus proche : 0 le jour J, négatif avant
 * (-3 = trois jours avant), positif après. Gère le passage d'année (anniversaire le 2 janvier vu le 30 décembre).
 */
export function birthdayOffset(today: { year: number; month: number; day: number }, day: number, month: number): number {
  const t = dayNumber(today);
  const candidates = [today.year - 1, today.year, today.year + 1].map((y) => t - dayNumber(birthdayInYear(day, month, y)));
  return candidates.reduce((best, c) => (Math.abs(c) < Math.abs(best) ? c : best));
}
