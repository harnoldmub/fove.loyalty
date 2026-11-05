"use client";

import { rewardValueLabel, type RewardKind } from "@fove/shared";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Check, CheckCircle2, Copy, Download, Gift, MoreVertical, PartyPopper, PlusSquare, Share, Smartphone, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogRoot } from "@/components/ui/dialog";
import { GoogleWalletButton } from "@/components/google-wallet-button";
import { AppleWalletButton } from "@/components/apple-wallet-button";
import { Stamps, stampsStatus } from "@/components/stamps";
import { rememberCard } from "@/lib/remembered-cards";
import { Field, Input } from "@/components/ui/field";
import { ErrorNote } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { playChime } from "@/lib/sound";
import { cn, formatDate, formatNumber, KIND_LABEL } from "@/lib/utils";

export interface CardData {
  tenant: { name: string; logoUrl: string | null; primaryColor: string };
  program: { currency: string; name: string; mode: "POINTS" | "STAMPS"; stampsTarget: number; terms: string; rule: string };
  customer: { firstName: string; lastInitial: string };
  card: { number: string; qr: string; status: string; balance: number; lifetimeEarned: number; memberSince: string };
  nextReward: { name: string; cost: number; remaining: number } | null;
  rewards: { kind: RewardKind; value: string | null; id: string; name: string; description: string; conditions: string; cost: number; available: boolean }[];
  transactions: { id: string; kind: string; delta: number; createdAt: string; reason: string | null }[];
  verification: "EMAIL_OTP" | "IN_STORE" | "NONE" | null;
  googleWallet: boolean;
  appleWallet?: boolean;
  /** Mention « Propulsé par FOVE », retirée dans les offres payantes. */
  poweredBy?: boolean;
}

function useDeviceOS(): "ios" | "android" | "other" {
  return useSyncExternalStore(
    () => () => undefined,
    () => {
      if (typeof navigator === "undefined") return "other";
      const ua = navigator.userAgent;
      if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
      if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return "ios";
      if (/Android/i.test(ua)) return "android";
      return "other";
    },
    () => "other",
  );
}

function AddToHomeScreenButton({ tenantName }: { tenantName: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [prompt, setPrompt] = useState<(Event & { prompt: () => Promise<void>; userChoice?: Promise<{ outcome: string }> }) | null>(null);

  const os = useDeviceOS();
  const isStandalone = useSyncExternalStore(
    () => () => undefined,
    () => {
      if (typeof window === "undefined") return false;
      return (
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true
      );
    },
    () => false,
  );

  const isInApp = useSyncExternalStore(
    () => () => undefined,
    () => {
      if (typeof navigator === "undefined") return false;
      const ua = navigator.userAgent || "";
      return /FBAN|FBAV|Instagram|Line|Twitter|Snapchat|MicroMessenger|musical_ly|ByteDance/i.test(ua);
    },
    () => false,
  );

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as Event & { prompt: () => Promise<void>; userChoice?: Promise<{ outcome: string }> });
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const handleClick = async () => {
    if (prompt) {
      try {
        await prompt.prompt();
        const choice = await prompt.userChoice;
        if (choice?.outcome === "accepted") {
          toast.success("Carte ajoutée à votre écran d'accueil !");
          return;
        }
      } catch {
        // Fallback vers l'explication si le prompt est ignoré ou échoue
      }
    }
    setOpen(true);
  };

  const handleCopyLink = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        toast.success("Lien de votre carte copié !");
        setTimeout(() => setCopied(false), 2500);
        return;
      } catch {
        // fallback
      }
    }
    toast.info("Lien : " + url);
  };

  if (isStandalone) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-mint font-medium px-3 py-1.5 rounded-full bg-mint-soft border border-mint/20">
        <CheckCircle2 className="size-3.5" /> Sur l’écran d’accueil
      </span>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="rounded-full shadow-xs hover:bg-surface-2 transition-all font-medium"
        onClick={handleClick}
        aria-label="Ajouter la carte sur l'écran d'accueil"
      >
        <Smartphone className="size-3.5 text-ink-2" />
        <span>Ajouter à l’écran d’accueil</span>
      </Button>

      <DialogRoot open={open} onOpenChange={setOpen}>
        <DialogContent
          title="Ajouter à l’écran d’accueil"
          description={`Gardez votre carte ${tenantName} accessible en 1 clic sur votre téléphone.`}
          className="sm:max-w-md"
        >
          {os === "ios" ? (
            <div className="grid gap-3 py-1">
              <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-2/60 p-3">
                <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-cobalt/10 text-cobalt font-bold text-xs">
                  1
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">
                    Appuyez sur <Share className="inline size-4 text-cobalt align-text-bottom mx-0.5" aria-hidden /> Partager
                  </p>
                  <p className="text-xs text-ink-2 mt-0.5">
                    Dans la barre de navigation Safari en bas de votre écran iPhone (ou en haut sur iPad).
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-2/60 p-3">
                <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-cobalt/10 text-cobalt font-bold text-xs">
                  2
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">
                    Touchez <PlusSquare className="inline size-4 text-ink align-text-bottom mx-0.5" aria-hidden /> « Sur l’écran d’accueil »
                  </p>
                  <p className="text-xs text-ink-2 mt-0.5">
                    Faites défiler le menu des options vers le bas pour sélectionner cette action.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-2/60 p-3">
                <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-mint/10 text-mint font-bold text-xs">
                  3
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">
                    Appuyez sur « Ajouter »
                  </p>
                  <p className="text-xs text-ink-2 mt-0.5">
                    Votre carte apparaît comme une vraie application sur votre écran d'accueil !
                  </p>
                </div>
              </div>

              {isInApp && (
                <div className="rounded-lg bg-stamp-soft/30 p-2.5 text-xs text-ink-2">
                  <p className="font-medium text-stamp-ink dark:text-stamp">
                    💡 Vous êtes dans une application (Instagram, WhatsApp...) ?
                  </p>
                  <p className="text-ink-3 mt-0.5">
                    Appuyez sur les options en haut à droite pour ouvrir d'abord la page dans <strong>Safari</strong>.
                  </p>
                </div>
              )}
            </div>
          ) : os === "android" ? (
            <div className="grid gap-3 py-1">
              <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-2/60 p-3">
                <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-cobalt/10 text-cobalt font-bold text-xs">
                  1
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">
                    Appuyez sur le menu <MoreVertical className="inline size-4 text-ink align-text-bottom mx-0.5" aria-hidden />
                  </p>
                  <p className="text-xs text-ink-2 mt-0.5">
                    Les 3 points verticaux en haut à droite de Google Chrome.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-2/60 p-3">
                <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-cobalt/10 text-cobalt font-bold text-xs">
                  2
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">
                    Sélectionnez <Smartphone className="inline size-4 text-ink align-text-bottom mx-0.5" aria-hidden /> « Ajouter à l’écran d’accueil »
                  </p>
                  <p className="text-xs text-ink-2 mt-0.5">
                    (Ou « Installer l'application » selon votre navigateur).
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-2/60 p-3">
                <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-mint/10 text-mint font-bold text-xs">
                  3
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">
                    Confirmez avec « Ajouter »
                  </p>
                  <p className="text-xs text-ink-2 mt-0.5">
                    Votre carte {tenantName} sera accessible immédiatement en 1 clic.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 py-1">
              <p className="text-sm text-ink-2">
                Pour retrouver votre carte en boutique, le plus pratique est de l’ouvrir sur votre smartphone :
              </p>
              <div className="rounded-xl border border-line bg-surface-2/60 p-3.5 space-y-2 text-xs text-ink-2">
                <p className="font-semibold text-ink">Astuces :</p>
                <ul className="space-y-1.5 list-disc list-inside">
                  <li>Scannez le QR code de cette page avec votre smartphone.</li>
                  <li>Copiez le lien ci-dessous pour vous l'envoyer par message ou email.</li>
                  <li>Sur Mac ou PC, ajoutez la page aux favoris (<kbd className="rounded bg-surface px-1 py-0.5 font-mono text-[11px] border">Cmd+D</kbd> ou <kbd className="rounded bg-surface px-1 py-0.5 font-mono text-[11px] border">Ctrl+D</kbd>).</li>
                </ul>
              </div>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-between items-center gap-2 pt-2 border-t border-line">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCopyLink}
              className="w-full sm:w-auto text-xs text-ink-2 hover:text-ink"
            >
              {copied ? <Check className="size-3.5 text-mint" /> : <Copy className="size-3.5" />}
              <span>{copied ? "Lien copié !" : "Copier le lien direct"}</span>
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => setOpen(false)}
              className="w-full sm:w-auto"
            >
              J’ai compris
            </Button>
          </div>
        </DialogContent>
      </DialogRoot>
    </>
  );
}

export function CardView({ token, initial }: { token: string; initial: CardData }) {
  const fresh = useSearchParams().get("new") === "1";
  const [data, setData] = useState(initial);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [newlyEarned, setNewlyEarned] = useState<number[]>([]);
  const [liveNotice, setLiveNotice] = useState<{
    kind: "earn" | "redeem" | "target";
    message: string;
    sub?: string;
  } | null>(null);

  const { tenant, program, card } = data;
  const stamps = program.mode === "STAMPS";
  const stampReward = stamps ? (data.rewards[0]?.name ?? null) : null;

  const os = useDeviceOS();
  const isIos = os === "ios";
  const isAndroid = os === "android";
  // Sur iPhone : exclusivement Apple Wallet
  // Sur Android : exclusivement Google Wallet
  // Sur Ordinateur / Autre : les deux selon disponibilité
  const showAppleWallet = Boolean(data.appleWallet && (isIos || os === "other"));
  const showGoogleWallet = isAndroid || os === "other";

  // La carte est mémorisée sur ce téléphone : la page d'inscription proposera « Ouvrir ma carte ».
  useEffect(() => {
    rememberCard({ tenant: tenant.name, program: program.name, path: `/card/${token}` });
  }, [tenant.name, program.name, token]);

  const refresh = async () => setData(await api.get<CardData>(`/public/cards/${token}`));

  // Synchronisation en temps réel dès le scan en caisse
  useEffect(() => {
    let active = true;
    let timer: NodeJS.Timeout | null = null;

    const checkUpdate = async () => {
      if (!active || typeof document === "undefined" || document.visibilityState !== "visible") return;
      try {
        const freshData = await api.get<CardData>(`/public/cards/${token}`);
        if (!active) return;
        setData((prev) => {
          if (freshData.card.balance !== prev.card.balance) {
            const delta = freshData.card.balance - prev.card.balance;
            if (delta > 0) {
              playChime("earn");
              if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate([60, 60, 60]);
              const indices: number[] = [];
              for (let i = prev.card.balance; i < freshData.card.balance; i++) indices.push(i);
              setNewlyEarned(indices);
              setTimeout(() => { if (active) setNewlyEarned([]); }, 4500);

              if (freshData.program.mode === "STAMPS" && freshData.card.balance >= freshData.program.stampsTarget) {
                setLiveNotice({
                  kind: "target",
                  message: "🎉 Félicitations ! Votre carte est complète !",
                  sub: `Votre récompense « ${freshData.rewards[0]?.name ?? "Récompense"} » est débloquée.`,
                });
              } else {
                setLiveNotice({
                  kind: "earn",
                  message: freshData.program.mode === "STAMPS"
                    ? `+${delta} tampon${delta > 1 ? "s" : ""} validé en caisse !`
                    : `+${formatNumber(delta)} point${delta > 1 ? "s" : ""} crédité en caisse !`,
                  sub: "Votre solde est mis à jour à l’instant.",
                });
              }
              setTimeout(() => { if (active) setLiveNotice(null); }, 6000);
            } else if (delta < 0) {
              playChime("redeem");
              setLiveNotice({
                kind: "redeem",
                message: "Récompense validée en caisse ! 🎁",
                sub: "Merci pour votre fidélité.",
              });
              setTimeout(() => { if (active) setLiveNotice(null); }, 6000);
            }
            return freshData;
          }
          if (freshData.card.status !== prev.card.status) return freshData;
          return prev;
        });
      } catch {
        // En cas d'aléa réseau en boutique, réessai silencieux au tour suivant
      }
    };

    const scheduleNext = () => {
      timer = setTimeout(async () => {
        await checkUpdate();
        if (active) scheduleNext();
      }, 1500);
    };
    scheduleNext();

    const onVisible = () => {
      if (document.visibilityState === "visible") void checkUpdate();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [token]);

  return (
    <div className="min-h-dvh pb-12" style={{ ["--brand" as string]: tenant.primaryColor }}>
      <main id="contenu" className="mx-auto grid max-w-md gap-5 px-4 pt-6">
        {/* Notification temps réel lors du passage en caisse */}
        {liveNotice && (
          <div
            role="status"
            className={cn(
              "flex items-center gap-3 rounded-[var(--radius-lg)] p-4 text-white shadow-2 animate-in slide-in-from-top-4 duration-300",
              liveNotice.kind === "target"
                ? "bg-gradient-to-r from-[#d97706] to-[#b45309]"
                : liveNotice.kind === "earn"
                  ? "bg-gradient-to-r from-mint to-[#0e7452]"
                  : "bg-gradient-to-r from-cobalt to-[#1e3a8a]",
            )}
          >
            {liveNotice.kind === "target" ? (
              <PartyPopper className="size-6 shrink-0 animate-bounce text-[#fef3c7]" />
            ) : liveNotice.kind === "earn" ? (
              <Sparkles className="size-6 shrink-0 text-white" />
            ) : (
              <Gift className="size-6 shrink-0 text-white" />
            )}
            <div className="min-w-0">
              <p className="font-display font-semibold text-base leading-tight">{liveNotice.message}</p>
              {liveNotice.sub && <p className="text-xs text-white/90 mt-0.5">{liveNotice.sub}</p>}
            </div>
          </div>
        )}

        {fresh && card.status === "ACTIVE" && !liveNotice && (
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
            <div className="mt-6">
              <Stamps count={Math.min(card.balance, program.stampsTarget)} target={program.stampsTarget} reward={stampReward} tone="brand" newlyEarned={newlyEarned} />
            </div>
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
            {stamps && <p className="font-display text-2xl font-semibold tabular">{Math.min(card.balance, program.stampsTarget)}<span className="text-base text-white/70">/{program.stampsTarget}</span></p>}
          </div>
        </section>

        {/* Indicateur de direct avec la caisse */}
        <div className="flex items-center justify-center gap-2 text-xs text-ink-3" aria-live="polite">
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mint opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-mint" />
          </span>
          <span>Passage en caisse synchronisé en temps réel</span>
        </div>

        {card.status === "ACTIVE" && (
          <section aria-label="Gardez votre carte toujours à portée de main" className="grid justify-items-center gap-3 rounded-[var(--radius-lg)] bg-surface p-4 shadow-1">
            <p className="text-center text-sm font-medium text-ink-2">Gardez votre carte toujours à portée de main</p>
            {(showAppleWallet || showGoogleWallet) && (
              <div className="flex flex-wrap items-center justify-center gap-3">
                {showAppleWallet && <AppleWalletButton token={token} />}
                {showGoogleWallet && <GoogleWalletButton token={token} />}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-0.5">
              <AddToHomeScreenButton tenantName={tenant.name} />
              <Button asChild variant="secondary" size="sm" className="rounded-full shadow-xs hover:bg-surface-2 transition-all">
                <a href={`/api/public/cards/${token}/carte.png?download=1`} download aria-label="Télécharger la carte en image (PNG)">
                  <Download className="size-3.5" /> Enregistrer l'image
                </a>
              </Button>
            </div>
          </section>
        )}

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

        {stamps && card.status === "ACTIVE" && <p role="status" className="-mt-1 text-center text-sm text-ink-2">{stampsStatus(card.balance, program.stampsTarget, stampReward)}</p>}


        {!stamps && data.nextReward && (
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
                  {r.kind !== "GIFT" && <p className="text-sm text-ink-2">{rewardValueLabel(r, program.currency)}</p>}
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

        <p className="text-center text-xs text-ink-3">Membre depuis le {formatDate(card.memberSince)}. Ce lien est personnel : ne le partagez pas.</p>
        {data.poweredBy && (
          <p className="text-center text-xs text-ink-3">
            Propulsé par{" "}
            <a href="https://fove.digital" target="_blank" rel="noopener" className="font-medium underline underline-offset-2">
              FOVE
            </a>
          </p>
        )}
      </main>
    </div>
  );
}
