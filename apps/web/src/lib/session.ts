import "server-only";
import { redirect } from "next/navigation";
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
  if (!data) throw new Error(`Espace indisponible (API ${status})`);
  return data;
}
