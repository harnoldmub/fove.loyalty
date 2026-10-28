"use client";

import { createContext, useContext, type ReactNode } from "react";

export interface MeData {
  user: { id: string; email: string; name: string; emailVerifiedAt: string | null; isSuperAdmin: boolean };
  activeTenantId: string | null;
  support: boolean;
  role: string | null;
  permissions: string[];
  tenants: { id: string; name: string; slug: string; role: string; logoUrl: string | null; primaryColor: string; onboardingCompleted: boolean }[];
}

const Ctx = createContext<MeData | null>(null);

export function MeProvider({ me, children }: { me: MeData; children: ReactNode }) {
  return <Ctx.Provider value={me}>{children}</Ctx.Provider>;
}

export function useMe(): MeData {
  const me = useContext(Ctx);
  if (!me) throw new Error("MeProvider manquant");
  return me;
}

/** Masque une action côté interface ; le serveur revérifie toujours la permission. */
export function useCan(permission: string): boolean {
  return useMe().permissions.includes(permission);
}

export function useActiveTenant() {
  const me = useMe();
  return me.tenants.find((t) => t.id === me.activeTenantId) ?? null;
}
