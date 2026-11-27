"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { onNavigationStart, startNavigation } from "@/lib/navigation-progress";

/** Délai avant d'afficher la barre : une page qui arrive plus vite ne fait rien clignoter. */
const SHOW_DELAY_MS = 100;
/** Filet de sécurité si une navigation annoncée n'aboutit jamais (lien intercepté, redirection vers la même page). */
const GIVE_UP_MS = 15_000;

/**
 * Barre de progression en haut de l'écran pendant le passage d'une page à une autre.
 * Elle part au clic sur un lien interne (ou via `useAppRouter`), avance en ralentissant
 * vers 85 %, puis se termine quand l'adresse change.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const barRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const done = useRef<() => void>(() => {});

  useEffect(() => {
    const bar = barRef.current;
    const fill = fillRef.current;
    if (!bar || !fill) return;

    let active = false;
    let shown = false;
    let startedAt = 0;
    let frame = 0;
    let showTimer: ReturnType<typeof setTimeout> | undefined;
    let giveUpTimer: ReturnType<typeof setTimeout> | undefined;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    let pending: Element | null = null;

    const setPending = (el: Element | null) => {
      pending?.removeAttribute("data-nav-pending");
      pending = el;
      pending?.setAttribute("data-nav-pending", "");
    };

    const tick = (now: number) => {
      const seconds = (now - startedAt) / 1000;
      fill.style.width = `${(8 + 77 * (1 - Math.exp(-seconds * 1.1))).toFixed(2)}%`;
      frame = requestAnimationFrame(tick);
    };

    const start = (source?: Element | null) => {
      setPending(source ?? null);
      if (active) return;
      active = true;
      shown = false;
      startedAt = performance.now();
      clearTimeout(hideTimer);
      fill.style.transition = "none";
      fill.style.width = "0%";
      showTimer = setTimeout(() => {
        shown = true;
        bar.dataset.state = "on";
      }, SHOW_DELAY_MS);
      giveUpTimer = setTimeout(() => finish(), GIVE_UP_MS);
      frame = requestAnimationFrame(tick);
    };

    const finish = () => {
      setPending(null);
      if (!active) return;
      active = false;
      cancelAnimationFrame(frame);
      clearTimeout(showTimer);
      clearTimeout(giveUpTimer);
      if (!shown) return;
      fill.style.transition = "width 200ms ease-out";
      fill.style.width = "100%";
      hideTimer = setTimeout(() => {
        bar.dataset.state = "off";
      }, 220);
    };
    done.current = finish;

    // Clic sur un lien interne : écouté en capture, avant que Next ne prenne la main.
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement)) return;
      if ((link.target && link.target !== "_self") || link.hasAttribute("download")) return;
      startNavigation(link.href, link);
    };

    const unsubscribe = onNavigationStart(start);
    window.addEventListener("click", onClick, true);
    // Retour sur une page gardée en cache par le navigateur : rien ne doit rester en cours.
    window.addEventListener("pageshow", finish);
    return () => {
      unsubscribe();
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("pageshow", finish);
      cancelAnimationFrame(frame);
      clearTimeout(showTimer);
      clearTimeout(giveUpTimer);
      clearTimeout(hideTimer);
      setPending(null);
    };
  }, []);

  // Nouvelle adresse affichée : la navigation est terminée.
  const query = searchParams.toString();
  useEffect(() => {
    done.current();
  }, [pathname, query]);

  return (
    <div ref={barRef} className="nav-progress" data-state="off" aria-hidden>
      <div ref={fillRef} className="nav-progress-fill" />
    </div>
  );
}
