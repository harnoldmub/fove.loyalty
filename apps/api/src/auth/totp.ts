import { createHmac, randomBytes } from "node:crypto";

/**
 * Codes à usage unique basés sur le temps (TOTP, RFC 6238) : 6 chiffres, pas de 30 s, HMAC-SHA1,
 * compatible avec Google Authenticator, Authy, 1Password, Microsoft Authenticator…
 */
export const TOTP_STEP_SECONDS = 30;
const DIGITS = 6;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error("Secret base32 invalide");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Nouveau secret de 160 bits, en base32. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export const totpStep = (now: number) => Math.floor(now / 1000 / TOTP_STEP_SECONDS);

export function totpCode(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS;
  return binary.toString().padStart(DIGITS, "0");
}

/**
 * Pas accepté pour ce code (tolérance d'un pas avant et après, décalage d'horloge), ou null.
 * Comparaison sur toutes les fenêtres pour ne pas révéler laquelle correspond.
 */
export function verifyTotp(secret: string, code: string, now = Date.now(), window = 1): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = totpStep(now);
  let match: number | null = null;
  for (let delta = -window; delta <= window; delta++) {
    if (totpCode(secret, current + delta) === code && match === null) match = current + delta;
  }
  return match;
}

/** Adresse otpauth:// à scanner (QR code) dans l'application d'authentification. */
export function otpauthUri(secret: string, account: string, issuer = "FOVE"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${TOTP_STEP_SECONDS}`;
}
