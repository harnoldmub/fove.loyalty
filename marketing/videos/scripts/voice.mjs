// Voix off : fait lire le texte `voice` de chaque scène par Higgsfield
// (ElevenLabs preset via text2speech_v2, ~0.15 crédit par phrase), puis resserre les silences.
//
//   node scripts/voice.mjs            -> génère seulement les phrases nouvelles ou modifiées
//   node scripts/voice.mjs --process  -> retraite les fichiers déjà téléchargés, sans crédit
//   node scripts/voice.mjs --force    -> tout régénérer avec la voix ElevenLabs par défaut (Ines)
//   VOICE_ID="04e867c7-9e41-5cff-80d3-5284e74d7bd1" node scripts/voice.mjs --force -> régénérer avec Luc
//
// Voix recommandées :
// - Ines (023ebf5e-1970-40d8-825c-a5ef6a1dd4ff) : voix féminine française naturelle, chaleureuse et fluide
// - Luc (04e867c7-9e41-5cff-80d3-5284e74d7bd1) : voix masculine française posée et professionnelle
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { scenes } from "../src/scenes.js";

const run = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "src/audio/voice");
const rawDir = join(dir, "raw");
const manifestPath = join(dir, "manifest.json");

const DEFAULT_VOICE_ID = "023ebf5e-1970-40d8-825c-a5ef6a1dd4ff"; // Ines
const voiceId = process.env.VOICE_ID ?? DEFAULT_VOICE_ID;
const voiceName = process.env.VOICE_NAME ?? (voiceId === "04e867c7-9e41-5cff-80d3-5284e74d7bd1" ? "Luc" : "Ines");

const force = process.argv.includes("--force");
const processOnly = process.argv.includes("--process");

await mkdir(rawDir, { recursive: true });
const manifest = existsSync(manifestPath) ? JSON.parse(await readFile(manifestPath, "utf8")) : {};

const todo = Object.entries(scenes).filter(([name, s]) => {
  if (!s.voice || processOnly) return false;
  const prev = manifest[name];
  return force || !prev || prev.text !== s.voice || prev.voiceId !== voiceId || !existsSync(join(rawDir, `${name}.flac`));
});

if (todo.length) console.log(`Génération de ${todo.length} phrase(s) avec ${voiceName} (${voiceId}), environ ${(todo.length * 0.15).toFixed(2)} crédits.`);
// Chaque phrase est enregistrée dès qu'elle arrive : une erreur sur l'une ne fait pas perdre les autres (déjà payées).
const results = await Promise.allSettled(todo.map(async ([name, s]) => {
  const { stdout } = await run("higgsfield", [
    "generate", "create", "text2speech_v2",
    "--prompt", s.voice,
    "--variant", "elevenlabs",
    "--voice-id", voiceId,
    "--voice-type", "preset",
    "--wait", "--json",
  ], { maxBuffer: 1 << 20 });
  const job = JSON.parse(stdout)[0];
  if (job.status !== "completed" || !job.result_url) throw new Error(`Voix « ${name} » : tâche ${job.id} en état ${job.status}`);
  const res = await fetch(job.result_url);
  if (!res.ok) throw new Error(`Téléchargement de « ${name} » impossible (${res.status})`);
  const tmpAudio = join(rawDir, `${name}.mp3`);
  await writeFile(tmpAudio, Buffer.from(await res.arrayBuffer()));
  await run("ffmpeg", ["-y", "-loglevel", "error", "-i", tmpAudio, "-c:a", "flac", join(rawDir, `${name}.flac`)]);
  await run("rm", [tmpAudio]);
  manifest[name] = { text: s.voice, voice: voiceName, voiceId, job: job.id };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`  ${name} : ${s.voice}`);
}));
const failed = results.map((r, i) => [todo[i][0], r]).filter(([, r]) => r.status === "rejected");
for (const [name, r] of failed) console.error(`Échec pour « ${name} » : ${r.reason.stderr?.trim() || r.reason.message}`);

// Traitement : silences de plus de 0,2 s ramenés à 0,2 s, débit légèrement accéléré.
const timings = {};
for (const name of Object.keys(scenes)) {
  const raw = join(rawDir, `${name}.flac`);
  if (!existsSync(raw)) continue;
  const out = join(dir, `${name}.flac`);
  await run("ffmpeg", ["-y", "-loglevel", "error", "-i", raw, "-af",
    "silenceremove=start_periods=1:start_threshold=-45dB:stop_periods=-1:stop_duration=0.2:stop_silence=0.2:stop_threshold=-45dB,atempo=1.06",
    "-ar", "48000", "-ac", "1", "-c:a", "flac", out]);
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out]);
  timings[name] = Math.round(Number(stdout) * 1000) / 1000;
}
await writeFile(join(dir, "timings.json"), `${JSON.stringify(timings, null, 2)}\n`);
console.log("Durées des voix (s) :", timings);
if (failed.length) process.exitCode = 1;
