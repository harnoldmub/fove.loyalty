import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(prefix = "", bytes = 32): string {
  return `${prefix}${randomBytes(bytes).toString("base64url")}`;
}

export function randomDigits(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += randomInt(0, 10).toString();
  return out;
}

const CARD_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export function cardNumber(prefix = "FV"): string {
  const cleanPrefix = (prefix || "FV").trim().toUpperCase().slice(0, 2);
  const pick = () => CARD_ALPHABET[randomInt(0, CARD_ALPHABET.length)];
  const generate = () => `${Array.from({ length: 4 }, pick).join("")}-${Array.from({ length: 4 }, pick).join("")}`;
  let blocks = generate();
  // Garantit la présence d'au moins un chiffre (2-9) et d'au moins une lettre (A-Z)
  while (!/\d/.test(blocks) || !/[A-Z]/.test(blocks)) {
    blocks = generate();
  }
  return `${cleanPrefix}-${blocks}`;
}

// --- Chiffrement des secrets au repos (AES-256-GCM) ------------------------
function key(rawKey: string): Buffer {
  const buf = Buffer.from(rawKey, "base64");
  if (buf.length !== 32) throw new Error("APP_ENCRYPTION_KEY doit faire 32 octets (base64)");
  return buf;
}

export function encrypt(plain: string, rawKey: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(rawKey), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}

export function decrypt(payload: string, rawKey: string): string {
  const [iv, tag, data] = payload.split(".").map((p) => Buffer.from(p, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key(rawKey), iv!);
  decipher.setAuthTag(tag!);
  return Buffer.concat([decipher.update(data!), decipher.final()]).toString("utf8");
}

export function hmacSha256(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
