"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Gift, Share, Smartphone } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { ErrorNote } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { cn, formatDate, formatNumber, KIND_LABEL } from "@/lib/utils";

export interface CardData {
  tenant: { name: string; logoUrl: string | null; primaryColor: string };
  program: { name: string; mode: "POINTS" | "STAMPS"; stampsTarget: number; terms: string };
  customer: { firstName: string; lastInitial: string };
  card: { number: string; qr: string; status: string; balance: number; lifetimeEarned: number; memberSince: string };
  nextReward: { name: string; cost: number; remaining: number } | null;
  rewards: { id: string; name: string; description: string; conditions: string; cost: number; available: boolean }[];
  transactions: { id: string; kind: string; delta: number; createdAt: string; reason: string | null }[];
  verification: "EMAIL_OTP" | "IN_STORE" | "NONE" | null;
}

function InstallHint() {
  const [prompt, setPrompt] = useState<(Event & { prompt: () => Promise<void> }) | null>(null);
  const ios = useSyncExternalStore(
    () => () => undefined,
    () => /iphone|ipad/i.test(navigator.userAgent) && !window.matchMedia("(display-mode: standalone)").matches,
    () => false,
  );
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as Event & { prompt: () => Promise<void> });
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  if (prompt) {
    return (
      <Button variant="secondary" className="w-full" onClick={() => prompt.prompt()}>
        <Smartphone /> Ajouter à l’écran d’accueil
      </Button>
    );
  }
  if (ios) {
    return (
      <p className="flex items-center justify-center gap-2 text-center text-sm text-ink-2">
        <Share className="size-4 shrink-0" aria-hidden /> Pour la garder sous la main : Partager, puis « Sur l’écran d’accueil ».
      </p>
    );
  }
  return null;
}

export function CardView({ token, initial }: { token: string; initial: CardData }) {
  const fresh = useSearchParams().get("new") === "1";
  const [data, setData] = useState(initial);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const { tenant, program, card } = data;
  const stamps = program.mode === "STAMPS";
  const filled = stamps ? Math.min(card.balance, program.stampsTarget) : 0;

  const refresh = async () => setData(await api.get<CardData>(`/public/cards/${token}`));

  return (
    <div className="min-h-dvh pb-12" style={{ ["--brand" as string]: tenant.primaryColor }}>
      <main id="contenu" className="mx-auto grid max-w-md gap-5 px-4 pt-6">
        {fresh && card.status === "ACTIVE" && (
          <p role="status" className="rounded-md bg-mint-soft px-4 py-3 text-sm font-medium text-mint">
            Votre carte est prête, {data.customer.firstName}. Montrez ce QR code en caisse à chaque achat.
          </p>
        )}

        <section aria-label="Carte de fidélité" className="relative overflow-hidden rounded-[28px] p-6 text-white shadow-2" style={{ background: "linear-gradient(155deg, var(--brand) 0%, color-mix(in srgb, var(--brand) 72%, #0d1430) 100%)" }}>
          <div className="flex items-center gap-3">
            {tenant.logoUrl ? <img src={tenant.logoUrl} alt="" className="size-11 rounded-full bg-white object-cover" /> : <span className="grid size-11 place-items-center rounded-full bg-white/20 font-display text-lg font-bold">{tenant.name.slice(0, 1)}</span>}
            <div className="min-w-0">
              <p className="truncate text-sm text-white/80">{program.name}</p>
              <h1 className="truncate font-display text-xl font-semibold">{tenant.name}</h1>
            </div>
          </div>

          {stamps ? (
            <ol className="mt-6 grid grid-cols-5 gap-2.5" aria-label={`${filled} tampons sur ${program.stampsTarget}`}>
              {Array.from({ length: program.stampsTarget }, (_, i) => (
                <li key={i} className={cn("aspect-square rounded-full border-2 border-dashed border-white/40", i < filled && "border-solid border-transparent bg-[#f5b82e]")} />
              ))}
            </ol>
          ) : (
            <p className="mt-6 font-display text-5xl font-semibold tabular">
              {formatNumber(card.balance)} <span className="text-xl font-normal text-white/80">points</span>
            </p>
          )}

          <div className="mt-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm text-white/80">{data.customer.firstName} {data.customer.lastInitial}.</p>
              <p className="tabular text-sm tracking-[0.12em]">{card.number}</p>
            </div>
            {stamps && <p className="font-display text-2xl font-semibold tabular">{card.balance}<span className="text-base text-white/70">/{program.stampsTarget}</span></p>}
          </div>
        </section>

        {card.status === "PENDING_VERIFICATION" ? (
          data.verification === "EMAIL_OTP" ? (
            <form
              className="grid gap-3 rounded-[var(--radius-lg)] bg-surface p-5 shadow-1"
              onSubmit={async (e) => {
                e.preventDefault();
                setError(null);
                try {
                  await api.post(`/public/cards/${token}/verify`, { code });
                  await refresh();
                } catch (err) {
                  setError(errorMessage(err));
                }
              }}
            >
              <h2 className="font-display text-lg font-semibold">Validez votre carte</h2>
              <p className="text-sm text-ink-2">Saisissez le code à 6 chiffres reçu par email.</p>
              {error && <ErrorNote>{error}</ErrorNote>}
              {info && <p className="text-sm text-mint">{info}</p>}
              <Field label="Code de validation">{(p) => <Input {...p} inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="text-center text-2xl tracking-[0.4em] tabular" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />}</Field>
              <Button type="submit" disabled={code.length !== 6}>Valider ma carte</Button>
              <Button
                type="button"
                variant="link"
                onClick={async () => {
                  setError(null);
                  try {
                    await api.post(`/public/cards/${token}/resend-code`);
                    setInfo("Nouveau code envoyé.");
                  } catch (err) {
                    setError(errorMessage(err));
                  }
                }}
              >
                Renvoyer le code
              </Button>
            </form>
          ) : (
            <p className="rounded-md bg-stamp-soft px-4 py-3 text-sm text-stamp-ink dark:text-stamp">Votre carte sera activée par le personnel lors de votre prochain passage en caisse.</p>
          )
        ) : card.status === "BLOCKED" ? (
          <ErrorNote>Cette carte est suspendue. Rapprochez-vous de {tenant.name}.</ErrorNote>
        ) : (
          <section aria-label="QR code à présenter en caisse" className="grid justify-items-center gap-3 rounded-[var(--radius-lg)] bg-white p-6 shadow-1">
            <QRCodeSVG value={card.qr} size={220} marginSize={2} fgColor="#14204a" level="M" />
            <p className="text-sm text-[#4a5579]">À présenter en caisse</p>
          </section>
        )}

        {data.nextReward && (
          <div className="rounded-[var(--radius-lg)] bg-surface p-5 shadow-1">
            <p className="text-sm text-ink-2">Prochaine récompense</p>
            <p className="font-display text-lg font-semibold">{data.nextReward.name}</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={data.nextReward.cost} aria-valuenow={card.balance} aria-label="Progression">
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, (card.balance / data.nextReward.cost) * 100)}%`, background: "var(--brand)" }} />
            </div>
            <p className="mt-2 text-sm text-ink-3">Encore {formatNumber(data.nextReward.remaining)} {stamps ? "tampon" : "point"}{data.nextReward.remaining > 1 ? "s" : ""}</p>
          </div>
        )}

        {data.rewards.length > 0 && (
          <section aria-labelledby="recompenses" className="grid gap-2">
            <h2 id="recompenses" className="font-display text-lg font-semibold">Récompenses</h2>
            {data.rewards.map((r) => (
              <div key={r.id} className={cn("flex items-center gap-3 rounded-md bg-surface p-4 shadow-1", !r.available && "opacity-70")}>
                <Gift className={cn("size-5 shrink-0", r.available ? "text-stamp" : "text-ink-3")} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{r.name}</p>
                  {(r.description || r.conditions) && <p className="text-sm text-ink-3">{[r.description, r.conditions].filter(Boolean).join(" · ")}</p>}
                </div>
                <span className="text-sm font-medium tabular">{r.available ? "Disponible" : formatNumber(r.cost)}</span>
              </div>
            ))}
          </section>
        )}

        {data.transactions.length > 0 && (
          <section aria-labelledby="historique" className="grid gap-2">
            <h2 id="historique" className="font-display text-lg font-semibold">Historique</h2>
            <ul className="divide-y divide-line rounded-md bg-surface shadow-1">
              {data.transactions.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span>
                    {t.kind === "REDEMPTION" ? t.reason : KIND_LABEL[t.kind]}
                    <span className="block text-ink-3">{formatDate(t.createdAt)}</span>
                  </span>
                  <span className={cn("font-semibold tabular", t.delta > 0 && "text-mint")}>{t.delta > 0 ? "+" : ""}{formatNumber(t.delta)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <InstallHint />
        <p className="text-center text-xs text-ink-3">Membre depuis le {formatDate(card.memberSince)}. Ce lien est personnel : ne le partagez pas.</p>
      </main>
    </div>
  );
}
