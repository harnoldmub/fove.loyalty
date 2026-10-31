"use client";

import { Camera, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { hapticImpact } from "@/lib/native";

type QrScannerInstance = { start: () => Promise<void>; stop: () => void; destroy: () => void };

/**
 * Viseur plein cadre. La caméra démarre à l'ouverture et s'arrête dès qu'une
 * carte est lue (ou en quittant l'écran). Décodage local au navigateur.
 */
export function QrCamera({ onCode, busy }: { onCode: (code: string) => void; busy: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const scanner = useRef<QrScannerInstance | null>(null);
  const handler = useRef(onCode);
  const [state, setState] = useState<"starting" | "ready" | "stopped">("starting");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    handler.current = onCode;
  }, [onCode]);

  const stop = useCallback(() => {
    scanner.current?.stop();
    scanner.current?.destroy();
    scanner.current = null;
  }, []);

  const start = useCallback(async () => {
    stop();
    setError(null);
    setState("starting");
    try {
      const { default: QrScanner } = await import("qr-scanner");
      if (!video.current) return;
      if (!(await QrScanner.hasCamera())) throw new Error("Aucune caméra disponible. Recherchez le client par son nom ou son téléphone.");
      const instance = new QrScanner(
        video.current,
        (result) => {
          if (!/^fvq_[A-Za-z0-9_-]{10,}$/.test(result.data)) {
            setError("Ce QR code n’est pas une carte de fidélité.");
            return;
          }
          void hapticImpact("medium");
          stop();
          setState("stopped");
          handler.current(result.data);
        },
        { preferredCamera: "environment", maxScansPerSecond: 6, returnDetailedScanResult: true },
      );
      scanner.current = instance;
      await instance.start();
      setState("ready");
    } catch (e) {
      stop();
      setState("stopped");
      const denied = e instanceof Error ? e.name === "NotAllowedError" || /permission|denied/i.test(e.message) : /permission|denied/i.test(String(e));
      setError(denied ? "Accès à la caméra refusé. Autorisez-le dans le navigateur, puis touchez « Activer la caméra »." : e instanceof Error ? e.message : "Caméra indisponible.");
    }
  }, [stop]);

  useEffect(() => {
    // Démarrage différé d'un tick : le premier rendu reste pur.
    const t = setTimeout(() => void start(), 0);
    return () => {
      clearTimeout(t);
      stop();
    };
  }, [start, stop]);

  const showVideo = state === "ready" && !busy;
  return (
    <div className="grid gap-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-[28px] bg-[#0d1430]">
        <video ref={video} muted playsInline aria-label="Aperçu de la caméra" className={`size-full object-cover transition-opacity duration-300 ${showVideo ? "opacity-100" : "opacity-0"}`} />
        {/* Viseur : quatre coins et une ligne qui balaie le cadre. */}
        <div aria-hidden className="pointer-events-none absolute inset-[14%]">
          {["left-0 top-0 rounded-tl-2xl border-l-4 border-t-4", "right-0 top-0 rounded-tr-2xl border-r-4 border-t-4", "bottom-0 left-0 rounded-bl-2xl border-b-4 border-l-4", "bottom-0 right-0 rounded-br-2xl border-b-4 border-r-4"].map((c) => (
            <span key={c} className={`absolute size-12 border-white ${c}`} />
          ))}
          {showVideo && <span className="scan-line absolute inset-x-2 top-1/2 h-0.5 rounded-full bg-[#f5b82e] shadow-[0_0_16px_4px_rgb(245_184_46/0.55)]" />}
        </div>
        {(busy || state === "starting") && (
          <div role="status" className="absolute inset-0 grid place-content-center justify-items-center gap-3 text-sm font-medium text-white">
            <LoaderCircle className="size-8 animate-spin motion-reduce:animate-none" aria-hidden />
            {busy ? "Carte lue, ouverture de la fiche…" : "Ouverture de la caméra…"}
          </div>
        )}
        {state === "stopped" && !busy && (
          <div className="absolute inset-0 grid place-items-center">
            <Button onClick={() => void start()} size="lg">
              <Camera /> Activer la caméra
            </Button>
          </div>
        )}
      </div>
      {error && <p role="alert" className="text-center text-sm text-danger">{error}</p>}
      <style>{`
        @media (prefers-reduced-motion: no-preference) { .scan-line { animation: scan-sweep 2.2s ease-in-out infinite alternate; } }
        @keyframes scan-sweep { from { top: 4%; } to { top: 96%; } }
      `}</style>
    </div>
  );
}

/** Après une erreur de recherche, le parent remonte la caméra pour un nouveau scan. */
export function useRestartKey() {
  const [key, setKey] = useState(0);
  return [key, () => setKey((k) => k + 1)] as const;
}
