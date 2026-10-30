"use client";

import { useState } from "react";
import {
  Bell,
  Camera,
  CheckCircle2,
  Coffee,
  Flame,
  Flashlight,
  Gift,
  MapPin,
  QrCode,
  Sparkles,
  Volume2,
  Wifi,
} from "lucide-react";
import { playChime } from "@/lib/sound";
import { cn } from "@/lib/utils";

type WalletPlatform = "apple" | "google";

/** Icône officielle Apple Wallet (Cartes iOS) : étui noir à encoche centrale et cartes multicolores empilées. */
function AppleWalletIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 36" className={className} aria-hidden="true">
      <rect width="36" height="36" rx="8.5" fill="#1C1C1E" />
      <rect x="4.5" y="5" width="27" height="14" rx="3" fill="#0A84FF" />
      <rect x="4.5" y="8.5" width="27" height="14" rx="3" fill="#FF9F0A" />
      <rect x="4.5" y="12" width="27" height="14" rx="3" fill="#30D158" />
      <rect x="4.5" y="15.5" width="27" height="14" rx="3" fill="#FF453A" />
      <path
        d="M3.5 19.5h9.2c1.4 0 2.6.7 3.3 1.9.5.8 1.2 1.3 2 1.3s1.5-.5 2-1.3c.7-1.2 1.9-1.9 3.3-1.9h9.2V28a4.5 4.5 0 0 1-4.5 4.5H8A4.5 4.5 0 0 1 3.5 28v-8.5Z"
        fill="#D8D2C5"
      />
    </svg>
  );
}

/** Icône officielle Google Wallet : cartes vert, jaune, rouge glissées dans la poche bleue. */
function GoogleWalletIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 32" className={className} aria-hidden="true">
      <rect x="2" y="0" width="36" height="22" rx="5" fill="#34A853" />
      <rect x="2" y="5" width="36" height="22" rx="5" fill="#FBBC04" />
      <rect x="2" y="10" width="36" height="22" rx="5" fill="#EA4335" />
      <path
        d="M2 16h11.5c2.4 0 4.2 1.2 5.4 3.1L20 21l1.1-1.9c1.2-1.9 3-3.1 5.4-3.1H38v11a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5z"
        fill="#4285F4"
      />
    </svg>
  );
}

interface Scenario {
  id: string;
  label: string;
  icon: typeof Bell;
  tag: string;
  time: string;
  title: string;
  body: string;
  badgeText: string;
  passBalance: string;
  passStamps: number;
  passDetail: string;
}

const SCENARIOS: Scenario[] = [
  {
    id: "promo",
    label: "Offre Flash",
    icon: Flame,
    tag: "Campagne commerciale",
    time: "À l’instant",
    title: "Café Matonge · Offre Flash",
    body: "Profitez de -20% sur toutes les boissons gourmandes cet après-midi jusqu’à 17h sur présentation de votre pass !",
    badgeText: "-20% jusqu’à 17h",
    passBalance: "7 / 10",
    passStamps: 7,
    passDetail: "Avantage flash actif",
  },
  {
    id: "earn",
    label: "Achat en Caisse",
    icon: Coffee,
    tag: "Mise à jour en temps réel",
    time: "Il y a 1 min",
    title: "Café Matonge · Solde mis à jour",
    body: "+1 tampon ajouté ! Vous avez désormais 8 tampons sur 10. Plus que 2 passages avant votre café offert.",
    badgeText: "+1 tampon validé",
    passBalance: "8 / 10",
    passStamps: 8,
    passDetail: "Prochaine récompense à 10",
  },
  {
    id: "reward",
    label: "Cadeau Débloqué",
    icon: Gift,
    tag: "Fidélisation VIP",
    time: "Il y a 2 min",
    title: "Café Matonge · Récompense prête !",
    body: "Félicitations Nadia ! Votre carte est complète. Venez savourer votre café signature offert lors de votre prochain passage.",
    badgeText: "1 café offert débloqué",
    passBalance: "10 / 10",
    passStamps: 10,
    passDetail: "Récompense prête au comptoir",
  },
  {
    id: "location",
    label: "Proximité GPS",
    icon: MapPin,
    tag: "Rappel géolocalisé",
    time: "À l’instant",
    title: "Café Matonge · Vous êtes tout près",
    body: "Envie d'une pause ? Votre barista vous attend. Présentez votre carte pour doubler vos points aujourd'hui !",
    badgeText: "Boutique à 50m",
    passBalance: "Points ×2",
    passStamps: 8,
    passDetail: "Bonus proximité actif",
  },
];

export function WalletNotificationDemo() {
  const [activeScenarioId, setActiveScenarioId] = useState<string>("promo");
  const [platform, setPlatform] = useState<WalletPlatform>("apple");
  const [isAnimating, setIsAnimating] = useState(false);
  const [notificationKey, setNotificationKey] = useState(0);

  const scenario = SCENARIOS.find((s) => s.id === activeScenarioId) ?? SCENARIOS[0]!;

  const triggerNotification = (scId: string) => {
    setActiveScenarioId(scId);
    setNotificationKey((k) => k + 1);
    setIsAnimating(true);
    playChime("notify");
    setTimeout(() => setIsAnimating(false), 600);
  };

  return (
    <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-center">
      {/* Colonne gauche : Explications & Boutons de scénarios */}
      <div>
        <h2 className="font-display text-3xl font-semibold sm:text-4xl">
          Communiquez directement sur l’écran de vos clients.
        </h2>

        <p className="mt-4 text-lg text-ink-2">
          Vos cartes s’installent en 1 clic dans <strong>Apple Wallet</strong> et <strong>Google Wallet</strong>.
          Diffusez des messages, offres et alertes visibles immédiatement sur l’écran verrouillé de l’iPhone ou d’Android avec un taux d’ouverture proche de 100%.
        </p>

        {/* Sélecteur de plateforme Apple Wallet / Google Wallet avec vraies icônes */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-ink-3">Aperçu OS :</span>
          <div className="inline-flex rounded-xl border border-line bg-surface p-1 shadow-1">
            <button
              type="button"
              onClick={() => {
                setPlatform("apple");
                playChime("notify");
              }}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all",
                platform === "apple"
                  ? "bg-ink text-surface shadow-1"
                  : "text-ink-2 hover:text-ink",
              )}
            >
              <AppleWalletIcon className="size-4 shrink-0" />
              <span>Apple Wallet</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setPlatform("google");
                playChime("notify");
              }}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all",
                platform === "google"
                  ? "bg-ink text-surface shadow-1"
                  : "text-ink-2 hover:text-ink",
              )}
            >
              <GoogleWalletIcon className="h-3.5 w-4 shrink-0" />
              <span>Google Wallet</span>
            </button>
          </div>
        </div>

        {/* Boutons interactifs des scénarios */}
        <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
          {SCENARIOS.map((item) => {
            const Icon = item.icon;
            const active = item.id === activeScenarioId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => triggerNotification(item.id)}
                className={cn(
                  "group flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all",
                  active
                    ? "border-cobalt bg-cobalt-soft/60 shadow-sm"
                    : "border-line bg-surface/50 hover:border-line-2 hover:bg-surface",
                )}
              >
                <div
                  className={cn(
                    "grid size-9 shrink-0 place-items-center rounded-lg transition-colors",
                    active
                      ? "bg-cobalt text-white shadow-xs"
                      : "bg-surface-2 text-ink-2 group-hover:text-ink",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-sm font-semibold text-ink">
                      {item.label}
                    </span>
                    {active && (
                      <span className="size-1.5 rounded-full bg-cobalt animate-ping" />
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-ink-3">
                    {item.tag}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-4 text-xs text-ink-3">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="size-4 text-emerald-600" />
            <span>100% de délivrabilité (écran verrouillé)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="size-4 text-emerald-600" />
            <span>0 $ de frais SMS</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="size-4 text-emerald-600" />
            <span>Mise à jour en direct du solde</span>
          </div>
        </div>
      </div>

      {/* Colonne droite : Simulation réaliste sur iPhone (Châssis Titane + iOS Lock Screen) */}
      <div className="mx-auto flex w-full max-w-[356px] flex-col items-center">
        <div className="relative w-full">
          {/* Halo ambiant derrière l'iPhone */}
          <div className="pointer-events-none absolute -inset-5 rounded-[64px] bg-gradient-to-tr from-cobalt/25 via-sky-500/15 to-amber-400/15 blur-2xl opacity-80" />

          {/* Boutons physiques latéraux de l'iPhone (Action, Volume +, Volume -, Power) */}
          <div aria-hidden className=" absolute -left-[3px] top-24 h-7 w-[3px] rounded-l-full bg-slate-700" />
          <div aria-hidden className="absolute -left-[3px] top-36 h-12 w-[3px] rounded-l-full bg-slate-700" />
          <div aria-hidden className="absolute -left-[3px] top-52 h-12 w-[3px] rounded-l-full bg-slate-700" />
          <div aria-hidden className="absolute -right-[3px] top-40 h-16 w-[3px] rounded-r-full bg-slate-700" />

          {/* Châssis iPhone Titane */}
          <div className="relative overflow-hidden rounded-[54px] border-[3px] border-slate-700/90 bg-[#0b0e17] p-[9px] shadow-2xl ring-1 ring-white/15">
            {/* Écran OLED interne iPhone */}
            <div
              className="relative flex flex-col justify-between overflow-hidden rounded-[44px] px-4 pb-3 pt-3 text-white"
              style={{
                background:
                  "radial-gradient(120% 80% at 50% 0%, #1e2b58 0%, #0d1326 52%, #070a14 100%)",
              }}
            >
              {/* Barre d'état iOS + Dynamic Island */}
              <div className="relative flex items-center justify-between px-2 pt-0.5 text-[11px] font-semibold tracking-tight text-white/90">
                <span className="w-12 pl-1 tabular">9:41</span>

                {/* Dynamic Island */}
                <div className="flex h-[26px] w-[104px] items-center justify-between rounded-full bg-black px-2.5 shadow-inner ring-1 ring-white/10">
                  <div className="size-2.5 rounded-full bg-[#0f1322] ring-1 ring-white/10" />
                  <div className="size-2.5 rounded-full bg-[radial-gradient(circle_at_35%_35%,#3b82f6,#1e1b4b_70%)]" />
                </div>

                {/* Icônes réseau / Wi-Fi / Batterie iOS */}
                <div className="flex w-14 items-center justify-end gap-1.5 pr-1">
                  <svg viewBox="0 0 16 11" className="h-2.5 w-3.5 fill-white" aria-hidden>
                    <rect x="0" y="7" width="2.5" height="4" rx="0.7" />
                    <rect x="4" y="5" width="2.5" height="6" rx="0.7" />
                    <rect x="8" y="2.5" width="2.5" height="8.5" rx="0.7" />
                    <rect x="12" y="0" width="2.5" height="11" rx="0.7" />
                  </svg>
                  <Wifi className="size-3 stroke-[2.4]" aria-hidden />
                  <div className="flex items-center" aria-hidden>
                    <div className="h-2.5 w-5 rounded-[3px] border border-white/50 p-[1.5px]">
                      <div className="h-full w-full rounded-[1.5px] bg-white" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Heure et Date iOS Lock Screen */}
              <div className="mt-4 text-center">
                <p className="text-[0.8rem] font-medium tracking-wide text-white/75">
                  Jeudi 30 octobre
                </p>
                <p className="font-display text-[3.4rem] font-bold leading-none tracking-tight text-white/95 tabular">
                  09:41
                </p>
              </div>

              {/* Notification Push iOS / Wallet sur l'écran verrouillé */}
              <div
                key={notificationKey}
                className={cn(
                  "mt-5 rounded-[22px] border border-white/20 bg-white/[0.13] p-3.5 backdrop-blur-2xl shadow-xl transition-all duration-300",
                  isAnimating ? "scale-[0.97] ring-2 ring-cobalt/70" : "scale-100",
                )}
              >
                <div className="flex items-center justify-between gap-2 text-[0.72rem] text-slate-200">
                  <div className="flex items-center gap-2">
                    {platform === "apple" ? (
                      <AppleWalletIcon className="size-5 shrink-0 shadow-xs" />
                    ) : (
                      <span className="grid size-5 shrink-0 place-items-center rounded-[5px] bg-white p-0.5 shadow-xs">
                        <GoogleWalletIcon className="h-3.5 w-4" />
                      </span>
                    )}
                    <span className="text-[0.7rem] font-semibold tracking-wide text-white/95 uppercase">
                      {platform === "apple" ? "Cartes · Apple Wallet" : "Google Wallet"}
                    </span>
                  </div>
                  <span className="text-[0.68rem] text-white/65">{scenario.time}</span>
                </div>

                <p className="mt-2 text-[0.84rem] font-semibold leading-snug text-white">
                  {scenario.title}
                </p>
                <p className="mt-1 text-[0.76rem] leading-relaxed text-white/85">
                  {scenario.body}
                </p>

                <div className="mt-2.5 flex items-center justify-between border-t border-white/15 pt-2 text-[0.7rem]">
                  <span className="inline-flex items-center gap-1 font-medium text-amber-300">
                    <Sparkles className="size-3" aria-hidden />
                    {scenario.badgeText}
                  </span>
                  <span className="text-white/60">Toucher pour ouvrir ›</span>
                </div>
              </div>

              {/* Aperçu du Pass Wallet actif sur l'iPhone */}
              <div className="mt-3.5 overflow-hidden rounded-[22px] border border-white/15 bg-gradient-to-br from-[#2c55f5] via-[#1f42cc] to-[#11247a] p-3.5 text-white shadow-lg">
                {/* En-tête du pass */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="grid size-7 place-items-center rounded-full bg-white/20 ring-1 ring-white/25">
                      <Coffee className="size-3.5" aria-hidden />
                    </span>
                    <div>
                      <p className="font-display text-sm font-semibold leading-tight">
                        Café Matonge
                      </p>
                      <p className="text-[0.62rem] tracking-wider text-white/75 uppercase">
                        Pass Fidélité
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[0.6rem] tracking-wider text-white/70 uppercase">
                      Solde
                    </p>
                    <p className="font-display text-sm font-bold tabular">
                      {scenario.passBalance}
                    </p>
                  </div>
                </div>

                {/* Bandeau visuel des tampons sur le pass */}
                <div className="mt-3 rounded-xl bg-black/20 px-2.5 py-2">
                  <div className="grid grid-cols-5 gap-1.5">
                    {Array.from({ length: 10 }).map((_, idx) => {
                      const filled = idx < scenario.passStamps;
                      return (
                        <div
                          key={idx}
                          className={cn(
                            "flex h-5 items-center justify-center rounded-md text-[10px] font-bold transition-colors",
                            filled
                              ? "bg-white text-[#1f42cc] shadow-xs"
                              : "border border-white/20 bg-white/5 text-white/40",
                          )}
                        >
                          {filled ? "✓" : idx + 1}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Pied du pass avec titulaire et mini QR */}
                <div className="mt-2.5 flex items-center justify-between pt-1 text-xs">
                  <div>
                    <p className="text-[0.62rem] text-white/70 uppercase">
                      Titulaire · Nadia K.
                    </p>
                    <p className="text-[0.72rem] font-medium text-amber-200">
                      {scenario.passDetail}
                    </p>
                  </div>
                  <div className="grid size-8 place-items-center rounded-lg bg-white p-1 text-slate-950 shadow-xs">
                    <QrCode className="size-6" aria-hidden />
                  </div>
                </div>
              </div>

              {/* Raccourcis bas d'écran verrouillé iPhone (Lampe torche, Caméra & Barre d'accueil iOS) */}
              <div className="mt-5 px-2">
                <div className="flex items-center justify-between">
                  <span
                    aria-hidden
                    className="grid size-9 place-items-center rounded-full border border-white/15 bg-white/10 text-white/85 backdrop-blur-md"
                  >
                    <Flashlight className="size-4" />
                  </span>
                  <span className="text-[0.65rem] font-medium tracking-wide text-white/45">
                    Balayer vers le haut pour déverrouiller
                  </span>
                  <span
                    aria-hidden
                    className="grid size-9 place-items-center rounded-full border border-white/15 bg-white/10 text-white/85 backdrop-blur-md"
                  >
                    <Camera className="size-4" />
                  </span>
                </div>
                <div className="mx-auto mt-3 h-1 w-28 rounded-full bg-white/80" />
              </div>
            </div>
          </div>
        </div>

        {/* Bouton d'action sous l'iPhone pour rejouer la notification sonore */}
        <button
          type="button"
          onClick={() => triggerNotification(activeScenarioId)}
          className="mt-4 inline-flex items-center justify-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-xs font-semibold text-ink-2 shadow-1 transition-colors hover:border-cobalt hover:text-ink"
        >
          <Volume2 className="size-3.5 text-cobalt" aria-hidden />
          <span>Tester la notification push sonore</span>
        </button>
      </div>
    </div>
  );
}
