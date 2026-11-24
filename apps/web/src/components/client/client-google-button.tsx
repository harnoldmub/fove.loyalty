"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { GoogleIcon } from "@/components/google-icon";
import { api } from "@/lib/api";

/**
 * « Continuer avec Google » pour le compte client FOVE : le chemin principal, avant le code email.
 * Revient sur `next` (par défaut la page courante). Masqué si Google n'est pas configuré.
 */
export function ClientGoogleButton({ next, divider = true }: { next?: string; divider?: boolean }) {
  const t = useTranslations("client.google");
  const pathname = usePathname();
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let cancelled = false;
    api
      .get<{ google: boolean }>("/auth/providers")
      .then((p) => !cancelled && setEnabled(p.google))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  if (!enabled) return null;

  return (
    <div className="grid gap-4">
      <a
        href={`/api/client/auth/google?next=${encodeURIComponent(next ?? pathname)}`}
        className="flex min-h-12 items-center justify-center gap-3 rounded-md border border-line bg-surface px-4 py-3 text-base font-semibold text-ink shadow-1 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cobalt focus-visible:ring-offset-2"
      >
        <GoogleIcon />
        {t("continue")}
      </a>
      {divider && (
        <div className="flex items-center gap-3 text-xs text-ink-3" aria-hidden="true">
          <span className="h-px flex-1 bg-line" />
          {t("orEmail")}
          <span className="h-px flex-1 bg-line" />
        </div>
      )}
    </div>
  );
}
