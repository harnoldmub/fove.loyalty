import { NextResponse, type NextRequest } from "next/server";

// Même valeur que NATIVE_APP_MARKER (lib/native-app.ts, module client).
const NATIVE_APP_MARKER = "FoveApp";

/**
 * L'application mobile (Capacitor) ne contient que l'espace connecté : la
 * vitrine, l'inscription et l'abonnement restent sur le web. Les règles de
 * l'App Store interdisent aussi tout achat hors In-App Purchase dans l'app.
 */
export function proxy(request: NextRequest) {
  const ua = request.headers.get("user-agent") ?? "";
  if (!ua.includes(NATIVE_APP_MARKER)) return NextResponse.next();
  return NextResponse.redirect(new URL("/app", request.url));
}

// CGU et confidentialité restent consultables dans l'app (exigence des stores).
export const config = {
  matcher: ["/", "/tarifs", "/fonctionnalites", "/contact", "/developpeurs", "/signup", "/app/billing/:path*"],
};
