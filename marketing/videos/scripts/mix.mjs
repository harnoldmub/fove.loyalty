// Mixage du son d'une vidéo : musique (baissée automatiquement sous la voix),
// voix off de chaque scène, bruitages synthétisés, volume final à -14 LUFS
// (niveau attendu par Instagram et TikTok). Le tout est posé sur la vidéo muette.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const audioDir = join(root, "src/audio");
const cacheDir = join(root, ".cache/sfx");

// Bruitages fabriqués par ffmpeg : pas de fichier à licencier, pas de crédit.
const SFX = {
  tap: { expr: "0.5*sin(2*PI*1900*t)*exp(-90*t)", dur: 0.06, gain: 0.6 },
  pop: { expr: "0.7*sin(2*PI*(380+1500*t)*t)*exp(-22*t)", dur: 0.2, gain: 0.55 },
  beep: { expr: "0.5*sin(2*PI*1975*t)*between(t,0,0.11)", dur: 0.13, gain: 0.45 },
  chime: { expr: "0.4*sin(2*PI*1318.5*t)*exp(-4*t)+0.4*sin(2*PI*1975.5*(t-0.13))*exp(-4*(t-0.13))*gte(t,0.13)", dur: 1.1, gain: 0.5 },
};

async function sfxFile(name) {
  const file = join(cacheDir, `${name}.wav`);
  if (!existsSync(file)) {
    await mkdir(cacheDir, { recursive: true });
    const { expr, dur } = SFX[name];
    await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `aevalsrc=exprs='${expr}':d=${dur}:s=48000`, "-af", "afade=t=out:st=0:d=" + dur, file]);
  }
  return file;
}

/** Remplace la vidéo muette `silent` par `out` avec la bande son mixée. */
export async function mixAudio({ plan, duration, silent, out }) {
  const inputs = [];
  const add = (file) => inputs.push(file); // index de l'entrée ffmpeg (0 = la vidéo)
  const filters = [];
  const fmt = "aformat=sample_rates=48000:channel_layouts=stereo";
  const D = duration.toFixed(3);

  const music = join(audioDir, "music.m4a");
  const hasMusic = existsSync(music);
  if (hasMusic) {
    const i = add(music);
    filters.push(`[${i}:a]${fmt},atrim=0:${D},afade=t=in:d=0.4,afade=t=out:st=${(duration - 1.8).toFixed(3)}:d=1.8,volume=0.6[mus]`);
  }

  const voices = [];
  for (const scene of plan) {
    const file = join(audioDir, "voice", `${scene.name}.flac`);
    if (!scene.voiceLen || !existsSync(file)) continue;
    const i = add(file);
    const ms = Math.round(scene.voiceAt * 1000);
    filters.push(`[${i}:a]${fmt},adelay=${ms}|${ms},volume=1.15[v${voices.length}]`);
    voices.push(`[v${voices.length}]`);
  }

  const sfx = [];
  for (const scene of plan) for (const cue of scene.sfx) {
    const i = add(await sfxFile(cue.sound));
    const ms = Math.round(cue.at * 1000);
    filters.push(`[${i}:a]${fmt},adelay=${ms}|${ms},volume=${SFX[cue.sound].gain}[s${sfx.length}]`);
    sfx.push(`[s${sfx.length}]`);
  }

  const bus = [];
  if (voices.length) {
    filters.push(`${voices.join("")}amix=inputs=${voices.length}:normalize=0[vox]`);
    if (hasMusic) {
      // La musique s'efface d'environ 6 dB quand la voix parle et revient vite entre les phrases.
      filters.push("[vox]asplit[voxa][voxsc]");
      filters.push("[mus][voxsc]sidechaincompress=threshold=0.02:ratio=4:attack=15:release=220[duck]");
      bus.push("[duck]", "[voxa]");
    } else bus.push("[vox]");
  } else if (hasMusic) bus.push("[mus]");
  if (sfx.length) {
    filters.push(`${sfx.join("")}amix=inputs=${sfx.length}:normalize=0[fx]`);
    bus.push("[fx]");
  }
  if (!bus.length) throw new Error("Aucune piste audio : lancer d'abord scripts/voice.mjs ou ajouter src/audio/music.m4a");
  filters.push(`${bus.join("")}amix=inputs=${bus.length}:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000,apad,atrim=0:${D}[aout]`);

  await run("ffmpeg", ["-y", "-loglevel", "error", "-i", silent, ...inputs.flatMap((f) => ["-i", f]),
    "-filter_complex", filters.join(";"), "-map", "0:v", "-map", "[aout]",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", out], { maxBuffer: 1 << 24 });
}
