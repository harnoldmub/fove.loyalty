"use client";

import { useTranslations } from "next-intl";

/** Nouvel onglet : le client ne perd pas ce qu'il a saisi. */
function LegalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-ink">
      {children}
    </a>
  );
}

/**
 * « En continuant, vous acceptez les conditions… » sous chaque bouton qui crée le compte FOVE
 * ou y connecte. L'API garde la date et la version acceptées.
 */
export function ClientTermsNotice({ variant = "continue", className = "" }: { variant?: "continue" | "create"; className?: string }) {
  const t = useTranslations("client.legal");
  return (
    <p className={`text-xs leading-5 text-ink-3 ${className}`}>
      {t.rich(variant, {
        terms: (chunks) => <LegalLink href="/compte/conditions">{chunks}</LegalLink>,
        privacy: (chunks) => <LegalLink href="/compte/confidentialite">{chunks}</LegalLink>,
      })}
    </p>
  );
}
