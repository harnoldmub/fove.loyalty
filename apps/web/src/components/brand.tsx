import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Logo officiel fourni par FOVE, conservé sans modification : texte bleu nuit
 * en thème clair, texte blanc en thème sombre. Les deux versions sont rendues
 * et le CSS affiche la bonne, sans clignement au chargement.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center", className)}>
      <Image src="/brand/fove-logo.png" alt="FOVE" width={1024} height={341} sizes="156px" className="h-auto w-[156px] dark:hidden" />
      <Image src="/brand/fove-logo-dark.png" alt="FOVE" width={1024} height={341} sizes="156px" className="hidden h-auto w-[156px] dark:block" />
    </span>
  );
}
