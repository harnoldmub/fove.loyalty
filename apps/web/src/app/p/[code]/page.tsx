import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { serverGet } from "@/lib/server-api";

interface PageProps {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PartnerRedirectPage({ params, searchParams }: PageProps) {
  const { code } = await params;
  const search = await searchParams;
  const partnerCode = (code || "").toUpperCase().trim();

  // Dépôt du cookie d'attribution first-party pour 30 jours
  const cookieStore = await cookies();
  cookieStore.set("fove_partner_code", partnerCode, {
    path: "/",
    maxAge: 30 * 24 * 60 * 60, // 30 jours
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  // Enregistrement asynchrone du clic via l'API interne
  try {
    await serverGet(`/partners/track/${encodeURIComponent(partnerCode)}`);
  } catch {
    // Non-bloquant pour la redirection
  }

  // Préservation des paramètres UTM et redirection vers les tarifs/inscription
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(search)) {
    if (typeof v === "string") query.set(k, v);
  }
  query.set("utm_source", "partner");
  query.set("utm_campaign", partnerCode);

  redirect(`/tarifs?${query.toString()}`);
}
