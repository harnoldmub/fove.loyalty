import { NextResponse, type NextRequest } from "next/server";
import { serverGet } from "@/lib/server-api";

const DAY = 24 * 60 * 60;
const DEFAULT_COOKIE_DAYS = 30;

/**
 * Lien partenaire `/p/<CODE>` : dépose le cookie d'attribution (durée réglée dans Admin > Partenaires,
 * 30 jours par défaut) avec la date du clic, seulement pour un partenaire validé,
 * enregistre le clic, puis redirige vers les tarifs en gardant les paramètres UTM (ou vers
 * l'inscription pré-remplie avec `to=signup`, lien « Inscrire un commerce » du partenaire).
 * Route (et non page) : une page serveur ne peut pas poser de cookie.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const partnerCode = (code || "").toUpperCase().trim().slice(0, 30);

  let tracked: { found?: boolean; cookieDays?: number } | null = null;
  try {
    tracked = (await serverGet<{ found: boolean; cookieDays?: number }>(`/partners/track/${encodeURIComponent(partnerCode)}`)).data;
  } catch {
    // Non bloquant pour la redirection.
  }

  // « Inscrire un commerce » depuis l'espace partenaire : inscription pré-remplie (le compte reste au commerçant).
  const toSignup = request.nextUrl.searchParams.get("to") === "signup";
  const target = new URL(toSignup ? "/signup" : "/tarifs", request.url);
  for (const [key, value] of request.nextUrl.searchParams) {
    if (key === "to") continue;
    if (toSignup && !["name", "business", "email"].includes(key)) continue;
    target.searchParams.set(key, value.slice(0, 120));
  }
  target.searchParams.set("utm_source", "partner");
  target.searchParams.set("utm_campaign", partnerCode);

  const response = NextResponse.redirect(target);
  // Code inconnu ou partenaire non validé : aucun cookie (ne remplace pas un lien valide cliqué avant).
  if (tracked && tracked.found === false) return response;
  const days = tracked?.cookieDays && tracked.cookieDays > 0 ? tracked.cookieDays : DEFAULT_COOKIE_DAYS;
  const options = { path: "/", maxAge: days * DAY, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production" };
  response.cookies.set("fove_partner_code", partnerCode, options);
  // Date du clic : face à un lien de parrainage, le premier lien cliqué l'emporte.
  response.cookies.set("fove_partner_at", String(Date.now()), options);
  return response;
}
