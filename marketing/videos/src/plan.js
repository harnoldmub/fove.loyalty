// Calcule le montage réel d'une vidéo : début de chaque scène, ralenti
// éventuel pour laisser la voix off finir sa phrase, moments des bruitages.
// Lu par le navigateur (main.js) et par le mixage audio (scripts/render.mjs),
// pour que l'image et le son tombent exactement ensemble.
import { scenes } from "./scenes.js";

// La voix démarre un peu après le début de la scène et laisse un souffle avant la suivante.
const VOICE_START = 0.2;
const FIRST_VOICE_START = 0.35;
const VOICE_TAIL = 0.15;
const HOLD_TAIL = 1.3;

export function planVideo(video, timings = {}) {
  let t0 = 0;
  return video.scenes.map((name, i) => {
    const scene = scenes[name];
    const voiceAt = i === 0 ? FIRST_VOICE_START : VOICE_START;
    const voiceLen = timings[name] ?? 0;
    let k = 1;
    let len = scene.dur;
    if (voiceLen && scene.hold) len = Math.max(scene.dur, voiceAt + voiceLen + HOLD_TAIL);
    else if (voiceLen) k = Math.max(1, (voiceAt + voiceLen + VOICE_TAIL) / scene.dur);
    if (!scene.hold) len = scene.dur * k;
    const entry = { name, t0, len, k, voiceAt: t0 + voiceAt, voiceLen, sfx: (scene.sfx ?? []).map((s) => ({ ...s, at: t0 + s.at * k })) };
    t0 += len;
    return entry;
  });
}
