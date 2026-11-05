"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string; status?: number };
  reset: () => void;
}) {
  const isAuthError =
    error?.status === 401 ||
    error?.status === 403 ||
    /session|expir|401|403|unauthorized/i.test(error?.message ?? "");

  useEffect(() => {
    if (isAuthError && typeof window !== "undefined") {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.replace(`/login?next=${next}`);
    }
  }, [isAuthError]);

  if (isAuthError) {
    return (
      <main id="contenu" className="mx-auto grid min-h-dvh max-w-md content-center justify-items-start gap-4 px-4">
        <h1 className="font-display text-3xl font-semibold">Session expirée</h1>
        <p className="text-ink-2">Votre session de connexion a expiré. Redirection en cours vers la page de connexion…</p>
        <Button
          onClick={() => {
            const next = encodeURIComponent(window.location.pathname + window.location.search);
            window.location.replace(`/login?next=${next}`);
          }}
        >
          Se reconnecter
        </Button>
      </main>
    );
  }

  return (
    <main id="contenu" className="mx-auto grid min-h-dvh max-w-md content-center justify-items-start gap-4 px-4">
      <h1 className="font-display text-3xl font-semibold">Service momentanément indisponible</h1>
      <p className="text-ink-2">Vos données ne sont pas perdues. Réessayez dans un instant ; si le problème continue, contactez le support FOVE.</p>
      <Button onClick={reset}>Réessayer</Button>
    </main>
  );
}
