import { useTranslations } from "next-intl";
import { useCallback } from "react";
import frErrors from "../../messages/fr/errors.json";

/** Client HTTP du navigateur : même origine (proxy Next), cookie de session, en-tête anti-CSRF. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

/** Émis quand une action est refusée faute d'email confirmé (code `email_not_verified`). */
export const EMAIL_NOT_VERIFIED_EVENT = "fove:email-not-verified";

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-Fove-Csrf": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  // Session expirée ou révoquée dans l'espace connecté : déconnexion et redirection immédiate vers le login.
  const isAuthArea = typeof window !== "undefined" && /^\/(app|admin|onboarding|partner)(\/|$)/.test(window.location.pathname);
  // « Email non confirmé » n'est pas une session perdue : l'écran affiche quoi faire, sans déconnecter.
  const emailNotVerified = json?.error?.code === "email_not_verified";
  // L'espace commerçant ouvre alors la fenêtre « Confirmez d'abord votre email » (shell).
  if (emailNotVerified && typeof window !== "undefined") window.dispatchEvent(new Event(EMAIL_NOT_VERIFIED_EVENT));
  if ((res.status === 401 || res.status === 403) && !emailNotVerified && !path.startsWith("/auth/") && isAuthArea) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.replace(`/login?next=${next}`);
    return new Promise(() => {}) as unknown as T;
  }
  if (!res.ok) {
    const err = json?.error ?? {};
    throw new ApiError(res.status, err.code ?? "error", err.message ?? frErrors.generic, err.details);
  }
  return json as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body ?? {}),
  delete: <T>(path: string) => request<T>("DELETE", path),
};

/** Traducteur du fichier `errors.json` (retour de `useTranslations("errors")` ou `getTranslations("errors")`). */
export interface ErrorTranslator {
  (key: string): string;
  has(key: string): boolean;
}

/**
 * Message lisible d’une erreur d’appel API.
 * Avec un traducteur, un code connu (`errors.codes.<code>`) est traduit dans la
 * langue de l’interface ; sinon on garde le message renvoyé par l’API (que l’API
 * localise elle-même). Les erreurs de validation champ par champ restent celles de l’API.
 * Sans traducteur, repli en français (langue source).
 */
export function errorMessage(error: unknown, t?: ErrorTranslator): string {
  if (error instanceof ApiError) {
    if (error.details?.length) return error.details.map((d) => d.message).join(" · ");
    if (t && t.has(`codes.${error.code}`)) return t(`codes.${error.code}`);
    if (t && error.message === frErrors.generic) return t("generic");
    return error.message;
  }
  return t ? t("network") : frErrors.network;
}

/** Version traduite de `errorMessage`, à utiliser dans les composants client. */
export function useErrorMessage(): (error: unknown) => string {
  const t = useTranslations("errors");
  return useCallback((error: unknown) => errorMessage(error, t), [t]);
}
