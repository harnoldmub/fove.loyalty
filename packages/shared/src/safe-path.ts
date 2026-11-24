const BASE = "https://fove.invalid";

/**
 * Chemin interne sûr pour une redirection après connexion (`next`), sinon `fallback`.
 * Refuse tout ce qu'un navigateur pourrait lire comme un autre site : `//hote`, `/\hote`
 * (la barre oblique inverse vaut `/` pour http(s)), caractères de contrôle (une tabulation
 * est supprimée par le navigateur : `/\t/hote` devient `//hote`).
 */
export function safeInternalPath(next: unknown, fallback: string): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.length > 500) return fallback;
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return fallback;
  try {
    const url = new URL(next, BASE);
    return url.origin === BASE ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch {
    return fallback;
  }
}
