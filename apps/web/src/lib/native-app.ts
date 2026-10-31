import { useSyncExternalStore } from "react";

/** Ajouté à l'user-agent par l'app mobile (`appendUserAgent` de capacitor.config.ts). */
export const NATIVE_APP_MARKER = "FoveApp";

const subscribe = () => () => {};

/** Vrai dans l'application mobile : masque vitrine, inscription et abonnement. */
export function useIsNativeApp(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.userAgent.includes(NATIVE_APP_MARKER),
    () => false,
  );
}
