import { NextResponse, type NextRequest } from "next/server";
import { serverGet } from "@/lib/server-api";

const THIRTY_DAYS = 30 * 24 * 60 * 60;

/**
 * Lien partenaire `/p/<CODE>` : dépose le cookie d'attribution (30 jours) avec la date du clic,
 * enregistre le clic, puis redirige vers les tarifs en gardant les paramètres UTM.
 * Route (et non page) : une page serveur ne peut pas poser de cookie.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const partnerCode = (code || "").toUpperCase().trim().slice(0, 30);

  try {
    await serverGet(`/partners/track/${encodeURIComponent(partnerCode)}`);
  } catch {
    // Non bloquant pour la redirection.
  }

  const target = new URL("/tarifs", request.url);
  for (const [key, value] of request.nextUrl.searchParams) target.searchParams.set(key, value);
  target.searchParams.set("utm_source", "partner");
  target.searchParams.set("utm_campaign", partnerCode);

  const response = NextResponse.redirect(target);
  const options = { path: "/", maxAge: THIRTY_DAYS, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production" };
  response.cookies.set("fove_partner_code", partnerCode, options);
  // Date du clic : face à un lien de parrainage, le premier lien cliqué l'emporte.
  response.cookies.set("fove_partner_at", String(Date.now()), options);
  return response;
}
