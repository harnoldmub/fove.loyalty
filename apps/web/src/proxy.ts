import { NextResponse, type NextRequest } from "next/server";
import { isLocale, LOCALE_COOKIE, localeForCountry, localeFromAcceptLanguage } from "@/i18n/config";

// Même valeur que NATIVE_APP_MARKER (lib/native-app.ts, module client).
const NATIVE_APP_MARKER = "FoveApp";

/**
 * L'application mobile (Capacitor) ne contient que l'espace connecté : la
 * vitrine, l'inscription et l'abonnement restent sur le web. Les règles de
 * l'App Store interdisent aussi tout achat hors In-App Purchase dans l'app.
 * CGU et confidentialité restent consultables dans l'app (exigence des stores).
 */
const WEB_ONLY = [/^\/$/, /^\/tarifs$/, /^\/fonctionnalites$/, /^\/contact$/, /^\/developpeurs$/, /^\/signup$/, /^\/app\/billing(\/|$)/];

export function proxy(request: NextRequest) {
  const ua = request.headers.get("user-agent") ?? "";
  if (ua.includes(NATIVE_APP_MARKER) && WEB_ONLY.some((re) => re.test(request.nextUrl.pathname))) {
    return NextResponse.redirect(new URL("/app", request.url));
  }

  // Langue : choix de l'utilisateur (cookie), sinon pays du visiteur (en-tête
  // Cloudflare), sinon langue du navigateur.
  if (isLocale(request.cookies.get(LOCALE_COOKIE)?.value)) return NextResponse.next();
  const country = request.headers.get("cf-ipcountry");
  const locale = country && country !== "XX" ? localeForCountry(country) : (localeFromAcceptLanguage(request.headers.get("accept-language")) ?? "fr");
  const forwarded = new Headers(request.headers);
  forwarded.set("x-fove-locale", locale);
  const response = NextResponse.next({ request: { headers: forwarded } });
  response.cookies.set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return response;
}

export const config = {
  matcher: ["/((?!api|_next|widget|wallet|flags|favicon|.*\\.(?:png|svg|jpg|jpeg|webp|ico|js|css|txt|xml|webmanifest|json|pdf)$).*)"],
};
