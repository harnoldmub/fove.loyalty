import "server-only";
import { redirect } from "next/navigation";
import { serverGet } from "./server-api";

export interface Me {
  user: { id: string; email: string; name: string; emailVerifiedAt: string | null; isSuperAdmin: boolean };
  activeTenantId: string | null;
  support: boolean;
  role: "OWNER" | "MANAGER" | "CASHIER" | "VIEWER" | "SUPPORT" | null;
  permissions: string[];
  tenants: { id: string; name: string; slug: string; status: string; role: string; logoUrl: string | null; primaryColor: string; onboardingCompleted: boolean }[];
}

export async function requireMe(next: string): Promise<Me> {
  const { status, data } = await serverGet<Me>("/auth/me", true);
  // Seule une session absente ou expirée renvoie vers la connexion ; une panne
  // de l'API affiche la page d'erreur au lieu d'une boucle de reconnexion.
  if (status === 401) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (!data) throw new Error(`Espace indisponible (API ${status})`);
  return data;
}
