/**
 * Retour sonore léger et chaleureux pour le scanner caisse (Web Audio API natif, 0 dépendance).
 */
export function playChime(kind: "earn" | "redeem" | "notify" = "earn") {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (kind === "earn") {
      // Accord montant agréable (D5 -> A5)
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.setValueAtTime(880, now + 0.08);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (kind === "notify") {
      // Cloche douce de notification push (E6 -> G#6)
      osc.type = "sine";
      osc.frequency.setValueAtTime(1318.51, now);
      osc.frequency.setValueAtTime(1661.22, now + 0.06);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    } else {
      // Triade de validation récompense (C5 -> E5 -> G5)
      osc.type = "triangle";
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.08);
      osc.frequency.setValueAtTime(783.99, now + 0.16);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.start(now);
      osc.stop(now + 0.45);
    }
  } catch {
    // Silencieux si le contexte audio n'est pas autorisé par l'utilisateur
  }
}
