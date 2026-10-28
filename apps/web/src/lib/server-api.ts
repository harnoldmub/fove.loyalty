import "server-only";
import { cookies } from "next/headers";

const API = process.env.API_URL ?? "http://localhost:5291";

/** Appel serveur vers l’API (rendu des pages publiques et garde des pages privées). */
export async function serverGet<T>(path: string, withSession = false): Promise<{ status: number; data: T | null }> {
  const headers: Record<string, string> = {};
  if (withSession) {
    const store = await cookies();
    headers.cookie = store.getAll().map((c) => `${c.name}=${c.value}`).join("; ");
  }
  try {
    const res = await fetch(`${API}/api${path}`, { headers, cache: "no-store" });
    return { status: res.status, data: res.ok ? ((await res.json()) as T) : null };
  } catch {
    return { status: 503, data: null };
  }
}
