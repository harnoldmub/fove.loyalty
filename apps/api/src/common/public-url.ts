import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

export type Resolver = (hostname: string) => Promise<string[]>;

const defaultResolver: Resolver = async (hostname) => (await dnsLookup(hostname, { all: true, verbatim: true })).map((a) => a.address);

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

const PRIVATE_V4: [string, number][] = [
  ["0.0.0.0", 8], // « ce réseau »
  ["10.0.0.0", 8], // privé
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // boucle locale
  ["169.254.0.0", 16], // link-local (métadonnées cloud)
  ["172.16.0.0", 12], // privé
  ["192.0.0.0", 24], // IETF
  ["192.168.0.0", 16], // privé
  ["198.18.0.0", 15], // tests de performance
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // réservé, diffusion
];

/** Adresse IP joignable sur Internet (ni boucle locale, ni réseau privé, link-local, multicast…). */
export function isPublicIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    const n = ipv4ToInt(ip);
    return !PRIVATE_V4.some(([base, bits]) => (n & (~0 << (32 - bits))) >>> 0 === ipv4ToInt(base));
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    // IPv4 encapsulée (::ffff:10.0.0.1) : on juge l'adresse IPv4.
    const mapped = /^(?:0*:)*:?ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower) ?? /^::(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) return isPublicIp(mapped[1]!);
    if (lower === "::" || lower === "::1") return false;
    const first = parseInt(lower.split(":")[0] || "0", 16);
    if ((first & 0xfe00) === 0xfc00) return false; // fc00::/7 privé (ULA, réseau interne Railway)
    if ((first & 0xffc0) === 0xfe80) return false; // fe80::/10 link-local
    if ((first & 0xff00) === 0xff00) return false; // multicast
    return true;
  }
  return false;
}

/**
 * Vérifie qu'une adresse de webhook vise Internet et pas le réseau interne du serveur (SSRF) :
 * HTTPS, pas de nom interne, et toutes les adresses IP résolues publiques.
 * Renvoie un motif de refus, ou null si l'adresse est acceptable.
 */
export async function publicUrlProblem(raw: string, resolve: Resolver = defaultResolver): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "invalid_url";
  }
  if (url.protocol !== "https:") return "https_required";
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) return "private_host";
  let addresses: string[];
  try {
    addresses = isIP(host) ? [host] : await resolve(host);
  } catch {
    return "unresolvable_host";
  }
  if (addresses.length === 0) return "unresolvable_host";
  return addresses.every(isPublicIp) ? null : "private_host";
}
