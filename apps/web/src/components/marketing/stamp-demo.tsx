"use client";

import { Coffee, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TARGET = 10;

/** Démonstration de la carte à tampons : chaque clic imprime un tampon. */
export function StampDemo() {
  const [stamps, setStamps] = useState(6);
  const full = stamps >= TARGET;

  return (
    <div className="relative mx-auto w-full max-w-[420px]">
      <div
        className="relative overflow-hidden rounded-[28px] p-6 text-white shadow-2 sm:p-7"
        style={{ background: "linear-gradient(160deg, #2c55f5 0%, #1a3ad1 100%)" }}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-white/75">Carte de fidélité</p>
            <p className="font-display text-2xl font-semibold">Café Matonge</p>
          </div>
          <span className="grid size-11 place-items-center rounded-full bg-white/15">
            <Coffee className="size-5" aria-hidden />
          </span>
        </div>

        <ol className="mt-7 grid grid-cols-5 gap-3" aria-label={`${stamps} tampons sur ${TARGET}`}>
          {Array.from({ length: TARGET }, (_, i) => (
            <li key={i} className="grid aspect-square place-items-center rounded-full border-2 border-dashed border-white/35">
              {i < stamps && (
                <span key={`${i}-${stamps > i}`} className={cn("grid size-[86%] place-items-center rounded-full bg-[#f5b82e] text-[#3a2700]", i === stamps - 1 && "animate-stamp")} style={{ transform: "rotate(-8deg)" }}>
                  <Coffee className="size-[45%]" aria-hidden />
                </span>
              )}
            </li>
          ))}
        </ol>

        <div className="mt-7 flex items-end justify-between gap-4">
          <div>
            <p className="text-sm text-white/75">Awa K.</p>
            <p className="tabular text-sm tracking-[0.12em] text-white/90">FV-7K2M-Q9XD</p>
          </div>
          <p className="tabular text-right font-display text-3xl font-semibold" aria-live="polite">
            {stamps}
            <span className="text-lg text-white/70">/{TARGET}</span>
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        {full ? (
          <>
            <p className="flex-1 rounded-md bg-stamp-soft px-4 py-3 text-sm font-medium text-stamp-ink dark:text-stamp" role="status">
              Carte complète : un café offert à Awa.
            </p>
            <Button variant="secondary" size="icon" onClick={() => setStamps(0)} aria-label="Recommencer la démonstration">
              <RotateCcw />
            </Button>
          </>
        ) : (
          <>
            <Button variant="stamp" className="flex-1" onClick={() => setStamps((s) => Math.min(TARGET, s + 1))}>
              Valider un achat
            </Button>
            <p className="text-sm text-ink-2">Essayez, c’est le geste du caissier.</p>
          </>
        )}
      </div>
    </div>
  );
}
