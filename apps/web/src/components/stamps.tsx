import { Gift } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Carte à tampons : une case numérotée par passage, cochée une fois comptée ;
 * la dernière case montre la récompense. Rendu sans JavaScript.
 */
export function Stamps({ count, target, reward, tone = "light", size = "md" }: { count: number; target: number; reward?: string | null; tone?: "light" | "brand"; size?: "sm" | "md" }) {
  const filled = Math.max(0, Math.min(count, target));
  const brand = tone === "brand";
  return (
    <ol className={cn("grid grid-cols-5", size === "sm" ? "gap-1.5" : "gap-2.5")} aria-label={`${filled} tampon${filled > 1 ? "s" : ""} sur ${target}${reward ? `, ${reward} au bout` : ""}`}>
      {Array.from({ length: target }, (_, index) => {
        const done = index < filled;
        const last = index === target - 1;
        return (
          <li
            key={index}
            aria-hidden
            className={cn(
              "grid aspect-square place-items-center rounded-full border-2 text-sm font-semibold tabular",
              done
                ? "border-transparent bg-[#f5b82e] text-[#3a2700]"
                : last
                  ? brand ? "border-dashed border-white/80 text-white" : "border-dashed border-stamp text-stamp-ink dark:text-stamp"
                  : brand ? "border-dashed border-white/35 text-white/60" : "border-line-strong text-ink-3",
            )}
          >
            {done ? "✓" : last ? <Gift className="size-[45%]" /> : index + 1}
          </li>
        );
      })}
    </ol>
  );
}

export function stampsStatus(count: number, target: number, reward?: string | null) {
  if (count >= target) return `${reward ?? "Récompense"} disponible au prochain passage.`;
  const left = target - count;
  return `${count}/${target} · encore ${left} passage${left > 1 ? "s" : ""} avant ${reward ?? "la récompense"}`;
}
