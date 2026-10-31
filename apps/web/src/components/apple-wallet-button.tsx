"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * Bouton officiel « Ajouter à Apple Wallet » conforme aux directives Apple :
 * https://developer.apple.com/wallet/add-to-apple-wallet-guidelines/
 */
export function AppleWalletButton({ token, className = "" }: { token: string; className?: string }) {
  // Affiché sur iPhone, iPad, iPod ou Mac.
  const apple = useSyncExternalStore(
    () => () => undefined,
    () => /Macintosh|iPhone|iPad|iPod/.test(navigator.userAgent),
    () => false,
  );
  const [loading, setLoading] = useState(false);

  // Débloque le chargement dès que la feuille native PassKit apparaît ou que la page reprend le focus
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setLoading(false), 3000);
    const onFocus = () => setLoading(false);
    window.addEventListener("focus", onFocus);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [loading]);

  if (!apple) return null;
  const href = `/api/public/cards/${token}/apple-wallet`;

  return (
    <div className={className}>
      <a
        href={href}
        onClick={() => setLoading(true)}
        aria-busy={loading}
        aria-label="Ajouter à Apple Wallet"
        className="group relative inline-flex h-[44px] shrink-0 items-center transition-opacity hover:opacity-90 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
      >
        <img
          src="/wallet/add-to-apple-wallet.svg"
          alt="Ajouter à Apple Wallet"
          width={141}
          height={44}
          className="h-[44px] w-auto shrink-0 select-none"
          loading="eager"
        />
        {loading && (
          <span className="absolute inset-0 flex items-center justify-center rounded-[8px] bg-black/60 backdrop-blur-xs" aria-hidden="true">
            <LoaderCircle size={20} className="animate-spin text-white motion-reduce:animate-none" />
          </span>
        )}
      </a>
    </div>
  );
}

