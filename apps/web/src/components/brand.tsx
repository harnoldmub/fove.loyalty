import { cn } from "@/lib/utils";

/** Marque provisoire : le « O » est un tampon. Le logo définitif viendra remplacer ce composant. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-display text-[1.35rem] font-bold tracking-[-0.03em] text-ink", className)}>
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <rect width="32" height="32" rx="9" fill="var(--cobalt)" />
        <circle cx="16" cy="16" r="8.5" fill="none" stroke="var(--stamp)" strokeWidth="3.2" />
        <circle cx="16" cy="16" r="3" fill="var(--stamp)" />
      </svg>
      FOVE
    </span>
  );
}
