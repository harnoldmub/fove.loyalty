"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main id="contenu" className="mx-auto grid min-h-dvh max-w-md content-center justify-items-start gap-4 px-4">
      <h1 className="font-display text-3xl font-semibold">Service momentanément indisponible</h1>
      <p className="text-ink-2">Vos données ne sont pas perdues. Réessayez dans un instant ; si le problème continue, contactez le support FOVE.</p>
      <Button onClick={reset}>Réessayer</Button>
    </main>
  );
}
