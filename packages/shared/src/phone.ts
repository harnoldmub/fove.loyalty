import { parsePhoneNumberFromString, getCountryCallingCode, type CountryCode } from "libphonenumber-js/min";

/** Renvoie l'indicatif téléphonique international d'un pays (ex: "+33" pour FR, "+32" pour BE, "+243" pour CD). */
export function getCallingCode(country: string): string {
  try {
    return `+${getCountryCallingCode(country.toUpperCase() as CountryCode)}`;
  } catch {
    return "+243";
  }
}

/** Normalise un numéro en E.164. Renvoie null si le numéro n'est pas valide. */
export function normalizePhone(raw: string, defaultCountry: string = "CD"): string | null {
  const parsed = parsePhoneNumberFromString(raw.trim(), defaultCountry as CountryCode);
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number;
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}
