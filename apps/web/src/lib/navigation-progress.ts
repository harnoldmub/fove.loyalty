"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";

/**
 * Signal « une navigation commence » (docs/fonctionnalites.md, chargement des pages).
 * La barre de progression l'écoute ; la fin est détectée par le changement d'adresse.
 */
type Listener = (source?: Element | null) => void;
const listeners = new Set<Listener>();

export function onNavigationStart(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Vrai si `href` mène à une autre page de l'application (même origine, autre chemin ou autres paramètres). */
export function isNewPage(href: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const url = new URL(href, window.location.href);
    return url.origin === window.location.origin && (url.pathname !== window.location.pathname || url.search !== window.location.search);
  } catch {
    return false;
  }
}

export function startNavigation(href: string, source?: Element | null): void {
  if (!isNewPage(href)) return;
  for (const listener of listeners) listener(source);
}

/** `useRouter` de Next qui déclenche aussi la barre de progression sur `push` et `replace`. */
export function useAppRouter(): ReturnType<typeof useRouter> {
  const router = useRouter();
  return useMemo(
    () => ({
      ...router,
      push: (href, options) => {
        startNavigation(href);
        router.push(href, options);
      },
      replace: (href, options) => {
        startNavigation(href);
        router.replace(href, options);
      },
    }),
    [router],
  );
}
