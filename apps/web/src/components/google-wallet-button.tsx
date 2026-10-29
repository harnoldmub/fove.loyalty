"use client";

import { LoaderCircle } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { api, errorMessage } from "@/lib/api";

/** Logo Google Wallet : cartes vert, jaune, rouge glissées dans la poche bleue. */
function WalletMark() {
  return (
    <svg viewBox="0 0 40 32" width="34" height="27" aria-hidden>
      <rect x="2" y="0" width="36" height="22" rx="5" fill="#34A853" />
      <rect x="2" y="5" width="36" height="22" rx="5" fill="#FBBC04" />
      <rect x="2" y="10" width="36" height="22" rx="5" fill="#EA4335" />
      <path d="M2 16h11.5c2.4 0 4.2 1.2 5.4 3.1L20 21l1.1-1.9c1.2-1.9 3-3.1 5.4-3.1H38v11a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5z" fill="#4285F4" />
    </svg>
  );
}

const noop = () => () => undefined;
// Google Wallet n'existe pas sur iPhone ni iPad : le bouton y est masqué.
const isApple = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/** Badge « Ajouter à Google Wallet » dans le style officiel. */
export function GoogleWalletButton({ token }: { token: string }) {
  const apple = useSyncExternalStore(noop, isApple, () => true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (apple) return null;
  return (
    <div>
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
        className="inline-flex h-14 items-center gap-3 rounded-full border border-[#747775] bg-[#1f1f1f] pl-4 pr-6 text-left text-white transition-[background-color,transform] hover:bg-black active:scale-[0.97] disabled:opacity-80"
      >
        <span className="grid w-[34px] place-items-center">{loading ? <LoaderCircle className="size-6 animate-spin" aria-hidden /> : <WalletMark />}</span>
        <span aria-hidden className="leading-none">
          <span className="block text-[0.8125rem] font-medium">Ajouter à</span>
          <span className="mt-1 block text-[1.1875rem] font-medium tracking-[-0.01em]">Google Wallet</span>
        </span>
      </button>
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
