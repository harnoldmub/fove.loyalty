import "server-only";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { safeInternalPath } from "@fove/shared";
import { serverGet } from "./server-api";

export interface Me {
  user: {
    id: string;
    email: string;
    name: string;
    emailVerifiedAt: string | null;
    isSuperAdmin: boolean;
    isPartner?: boolean;
    adminRole?: "SUPER_ADMIN" | "ASSOCIATE" | "FINANCE_MANAGER" | "SUPPORT" | null;
  };
  activeTenantId: string | null;
  support: boolean;
  role: "OWNER" | "MANAGER" | "CASHIER" | "VIEWER" | "SUPPORT" | null;
  permissions: string[];
  tenants: { id: string; name: string; slug: string; status: string; role: string; logoUrl: string | null; primaryColor: string; onboardingCompleted: boolean }[];
}

export async function requireMe(next: string): Promise<Me> {
  const { status, data } = await serverGet<Me>("/auth/me", true);
  // Session absente, révoquée ou expirée (401 ou 403) : déconnexion et retour immédiat vers le login.
  if (status === 401 || status === 403) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (!data) throw new Error((await getTranslations("errors"))("workspaceUnavailable", { status }));
  return data;
}

/**
 * Page de connexion ou d'inscription ouverte alors que la session est valide : direction l'espace
 * (ou `next`). Avec une offre choisie (`?offre=`), le formulaire garde la main : il mène au paiement.
 */
export async function redirectIfSignedIn(params: { next?: string | string[]; offre?: string | string[] }): Promise<void> {
  if (params.offre) return;
  const { status } = await serverGet<Me>("/auth/me", true);
  if (status === 200) redirect(safeInternalPath(typeof params.next === "string" ? params.next : null, "/app"));
}
