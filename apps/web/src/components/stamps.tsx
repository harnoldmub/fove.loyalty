import { Gift } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * Carte à tampons : une case numérotée par passage, cochée une fois comptée ;
 * la dernière case montre la récompense. Rendu sans JavaScript.
 */
export function Stamps({
  count,
  target,
  reward,
  tone = "light",
  size = "md",
  newlyEarned = [],
}: {
  count: number;
  target: number;
  reward?: string | null;
  tone?: "light" | "brand";
  size?: "sm" | "md";
  newlyEarned?: number[];
}) {
  const t = useTranslations("public.stamps");
  const filled = Math.max(0, Math.min(count, target));
  const brand = tone === "brand";
  return (
    <ol className={cn("grid grid-cols-5", size === "sm" ? "gap-1.5" : "gap-2.5")} aria-label={reward ? t("ariaLabelReward", { filled, target, reward }) : t("ariaLabel", { filled, target })}>
      {Array.from({ length: target }, (_, index) => {
        const done = index < filled;
        const last = index === target - 1;
        const isNew = newlyEarned.includes(index);
        return (
          <li
            key={index}
            aria-hidden
            className={cn(
              "grid aspect-square place-items-center rounded-full border-2 text-sm font-semibold tabular transition-all duration-300",
              done
                ? "border-transparent bg-[#f5b82e] text-[#3a2700]"
                : last
                  ? brand ? "border-dashed border-white/80 text-white" : "border-dashed border-stamp text-stamp-ink dark:text-stamp"
                  : brand ? "border-dashed border-white/35 text-white/60" : "border-line-strong text-ink-3",
              isNew && "animate-stamp ring-4 ring-[#f5b82e]/50 ring-offset-2",
            )}
          >
            {done ? "✓" : last ? <Gift className="size-[45%]" /> : index + 1}
          </li>
        );
      })}
    </ol>
  );
}

function StampsStatusText({ count, target, reward }: { count: number; target: number; reward?: string | null }) {
  const t = useTranslations("public.stamps");
  const capped = Math.min(Math.max(0, count), target);
  if (capped >= target) return reward ? t("complete", { reward }) : t("completeDefault");
  const left = target - capped;
  return reward ? t("progress", { capped, target, left, reward }) : t("progressDefault", { capped, target, left });
}

/** Avancement de la carte, traduit : à rendre tel quel dans le JSX. */
export function stampsStatus(count: number, target: number, reward?: string | null) {
  return <StampsStatusText count={count} target={target} reward={reward} />;
}
