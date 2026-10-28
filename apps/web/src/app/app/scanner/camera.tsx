"use client";

import { useEffect, useRef, useState } from "react";
import { CameraOff } from "lucide-react";

/** Lecture du QR personnel à la caméra arrière. Aucun accès réseau : le code est envoyé au serveur ensuite. */
export function QrCamera({ onCode }: { onCode: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const handler = useRef(onCode);
  useEffect(() => {
    handler.current = onCode;
  }, [onCode]);

  useEffect(() => {
    let scanner: { start: () => Promise<void>; stop: () => void; destroy: () => void } | null = null;
    let cancelled = false;
    (async () => {
      const { default: QrScanner } = await import("qr-scanner");
      if (cancelled || !video.current) return;
      if (!(await QrScanner.hasCamera())) {
        setError("Aucune caméra disponible. Utilisez la recherche ci-dessous.");
        return;
      }
      const s = new QrScanner(video.current, (result) => handler.current(result.data), {
        preferredCamera: "environment",
        highlightScanRegion: true,
        maxScansPerSecond: 4,
        returnDetailedScanResult: true,
      });
      scanner = s;
      try {
        await s.start();
      } catch {
        setError("Accès à la caméra refusé. Autorisez-le dans le navigateur ou utilisez la recherche.");
      }
    })();
    return () => {
      cancelled = true;
      scanner?.stop();
      scanner?.destroy();
    };
  }, []);

  if (error) {
    return (
      <div className="grid aspect-square w-full place-items-center gap-2 rounded-[var(--radius-lg)] bg-surface-2 p-6 text-center text-sm text-ink-2">
        <CameraOff className="size-7 text-ink-3" aria-hidden />
        {error}
      </div>
    );
  }
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-[var(--radius-lg)] bg-[#0d1430]">
      <video ref={video} className="size-full object-cover" muted playsInline aria-label="Aperçu de la caméra" />
    </div>
  );
}
