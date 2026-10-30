import Image from "next/image";
import { cn } from "@/lib/utils";

/** Logo officiel fourni par FOVE, conservé sans modification. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-md dark:bg-white", className)}>
      <Image src="/brand/fove-logo.png" alt="FOVE" width={2172} height={724} sizes="156px" className="h-auto w-[156px]" />
    </span>
  );
}
