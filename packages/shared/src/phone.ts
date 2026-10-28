import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";

/** Normalise un numéro en E.164. Renvoie null si le numéro n'est pas valide. */
export function normalizePhone(raw: string, defaultCountry: string = "CD"): string | null {
  const parsed = parsePhoneNumberFromString(raw.trim(), defaultCountry as CountryCode);
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number;
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}
