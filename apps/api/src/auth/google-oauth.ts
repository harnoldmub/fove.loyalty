import type { Request, Response } from "express";
import { loadConfig } from "../config";
import { safeInternalPath } from "@fove/shared";
import { randomToken, safeEqual, sha256 } from "../common/crypto";

/**
 * Connexion « Continuer avec Google » (OAuth 2.0, code d'autorisation + PKCE), partagée par
 * les comptes commerçants (`/auth/google`) et les comptes clients FOVE (`/client/auth/google`).
 * Chaque espace a son propre cookie d'état et sa propre adresse de retour.
 */
export interface GoogleProfile {
  /** Identifiant stable du compte Google. */
  sub: string;
  email: string;
  name: string;
  givenName: string;
  familyName: string;
}

interface Flow {
  /** Cookie qui garde l'état et le vérificateur PKCE pendant l'aller-retour (10 min). */
  cookie: string;
  redirectUri: string;
}

const MAX_AGE_MS = 10 * 60_000;

/** Page interne de retour (jamais un autre site). */
export function safeNext(value: unknown, fallback: string): string {
  return safeInternalPath(value, fallback);
}

/** Prépare l'aller vers Google et renvoie l'adresse où rediriger le navigateur. */
export function startGoogleOAuth(res: Response, flow: Flow, next: string): string {
  const config = loadConfig();
  const state = randomToken("", 24);
  const verifier = randomToken("", 48);
  const payload = Buffer.from(JSON.stringify({ state, verifier, next, at: Date.now() })).toString("base64url");
  res.cookie(flow.cookie, payload, { httpOnly: true, secure: config.isProd, sameSite: "lax", path: "/", maxAge: MAX_AGE_MS });
  const params = new URLSearchParams({
    client_id: config.GOOGLE_OAUTH_CLIENT_ID!,
    redirect_uri: flow.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: Buffer.from(sha256(verifier), "hex").toString("base64url"),
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

/**
 * Retour de Google : vérifie l'état, échange le code côté serveur et lit le profil.
 * Renvoie null au moindre doute (état absent ou expiré, refus, email non vérifié par Google).
 */
export async function finishGoogleOAuth(
  req: Request,
  res: Response,
  flow: Flow,
  query: { code?: string; state?: string; error?: string },
): Promise<{ profile: GoogleProfile; next: string | undefined } | null> {
  const config = loadConfig();
  const raw = req.cookies?.[flow.cookie];
  res.clearCookie(flow.cookie, { httpOnly: true, secure: config.isProd, sameSite: "lax", path: "/" });
  const { code, state } = query;
  if (query.error || !code || !state || typeof raw !== "string" || raw.length > 2_000 || !config.googleOAuthEnabled) return null;

  try {
    const saved = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as { state?: string; verifier?: string; next?: string; at?: number };
    if (!saved.state || !saved.verifier || !safeEqual(state, saved.state) || !saved.at || Date.now() - saved.at > MAX_AGE_MS) return null;

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.GOOGLE_OAUTH_CLIENT_ID!,
        client_secret: config.GOOGLE_OAUTH_CLIENT_SECRET!,
        redirect_uri: flow.redirectUri,
        grant_type: "authorization_code",
        code_verifier: saved.verifier,
      }),
    });
    if (!tokenResponse.ok) return null;
    const tokens = (await tokenResponse.json()) as { access_token?: string };
    if (!tokens.access_token) return null;

    const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    if (!profileResponse.ok) return null;
    const p = (await profileResponse.json()) as { sub?: string; email?: string; email_verified?: boolean; name?: string; given_name?: string; family_name?: string };
    if (!p.sub || !p.email || p.email_verified !== true) return null;

    return {
      profile: { sub: p.sub, email: p.email, name: p.name ?? "", givenName: p.given_name ?? "", familyName: p.family_name ?? "" },
      next: saved.next,
    };
  } catch {
    return null;
  }
}
