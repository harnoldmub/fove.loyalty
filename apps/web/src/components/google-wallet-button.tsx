"use client";

import { LoaderCircle } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { api, errorMessage } from "@/lib/api";

const noop = () => () => undefined;
// Google Wallet n'existe pas sur iPhone ni iPad : le bouton y est masqué.
const isApple = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/**
 * Badge officiel « Ajouter à Google Wallet » conforme aux directives de marque Google :
 * https://developers.google.com/wallet/generic/resources/brand-guidelines
 */
export function GoogleWalletButton({ token, className = "" }: { token: string; className?: string }) {
  const apple = useSyncExternalStore(noop, isApple, () => true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (apple) return null;

  return (
    <div className={className}>
      <button
        type="button"
        disabled={loading}
        aria-busy={loading || undefined}
        aria-label="Ajouter à Google Wallet"
        onClick={async () => {
          setLoading(true);
          setError(null);
          try {
            const { url } = await api.get<{ url: string }>(`/public/cards/${token}/google-wallet`);
            window.location.assign(url);
          } catch (e) {
            setError(errorMessage(e));
            setLoading(false);
          }
        }}
        className="group relative inline-flex h-[44px] shrink-0 items-center transition-opacity hover:opacity-90 active:scale-[0.98] disabled:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
      >
        <img
          src="/wallet/add-to-google-wallet.svg"
          alt="Ajouter à Google Wallet"
          height={44}
          className="h-[44px] w-auto shrink-0 select-none"
          loading="eager"
        />
        {loading && (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60 backdrop-blur-xs" aria-hidden="true">
            <LoaderCircle className="size-5 animate-spin text-white" aria-hidden />
          </span>
        )}
      </button>
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
