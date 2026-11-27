import { cn } from "@/lib/utils";

/**
 * Chargement d'une page : une carte de fidélité qui se tamponne case après case.
 * Elle n'apparaît qu'après un court délai (CSS), pour ne pas clignoter sur les pages rapides.
 * Sans hook : utilisable dans les fichiers `loading.tsx` (composants serveur).
 */
export function PageLoader({ label, className }: { label: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn("page-loader grid min-h-[50dvh] place-items-center", className)}>
      <div className="grid justify-items-center gap-3">
        <div className="page-loader-card" aria-hidden>
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <p className="text-sm text-ink-3">{label}</p>
      </div>
    </div>
  );
}
