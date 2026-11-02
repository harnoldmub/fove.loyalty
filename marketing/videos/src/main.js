// Point d'entrée : monte la vidéo demandée (?video=…&format=…) puis, selon le
// mode, l'expose au script de rendu (?render=1) ou la joue dans le navigateur.
import { Timeline } from "./engine.js";
import { planVideo } from "./plan.js";
import { scenes } from "./scenes.js";
import videos from "./videos.js";

const params = new URLSearchParams(location.search);
const videoId = videos[params.get("video")] ? params.get("video") : "explainer";
const format = ["9x16", "1x1", "16x9"].includes(params.get("format")) ? params.get("format") : "9x16";
const rendering = params.has("render");
const video = videos[videoId];

document.body.classList.add(`f-${format}`);
document.body.classList.toggle("no-steps", Boolean(video.hideSteps));
document.title = `${video.title} · ${format}`;

// Durées des voix off (scripts/voice.mjs) : sans elles, montage au rythme d'origine.
const timings = await fetch("audio/voice/timings.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
const plan = planVideo(video, timings);

const stage = document.getElementById("stage");
const tl = new Timeline(stage);
plan.forEach(({ name, t0, len, k }, i) => tl.scene(t0, len, (s) => scenes[name].build(s, { first: i === 0 }), k));

window.__duration = tl.duration;
window.__render = (t) => tl.render(t);
window.__ready = Promise.all([
  document.fonts.ready,
  ...[...document.images].map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))),
]).then(() => tl.render(0));

if (!rendering) startPreview();

function startPreview() {
  document.body.classList.add("preview");
  const wrap = document.createElement("div");
  wrap.id = "stageWrap";
  stage.before(wrap);
  wrap.append(stage);
  const controls = document.getElementById("controls");
  controls.hidden = false;

  const fit = () => {
    const w = stage.offsetWidth, h = stage.offsetHeight;
    const k = Math.min((innerWidth - 32) / w, (innerHeight - 90) / h, 1);
    stage.style.transform = `scale(${k})`;
    wrap.style.width = `${w * k}px`;
    wrap.style.height = `${h * k}px`;
  };
  addEventListener("resize", fit);
  fit();

  const pickVideo = document.getElementById("pickVideo");
  for (const [id, v] of Object.entries(videos)) pickVideo.add(new Option(v.title, id, false, id === videoId));
  const pickFormat = document.getElementById("pickFormat");
  pickFormat.value = format;
  const reload = () => { location.search = `?video=${pickVideo.value}&format=${pickFormat.value}`; };
  pickVideo.onchange = reload;
  pickFormat.onchange = reload;

  const scrub = document.getElementById("scrub");
  const clock = document.getElementById("clock");
  const play = document.getElementById("play");
  // Mouvement réduit demandé : l'aperçu démarre en pause, la barre permet de parcourir.
  let playing = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  let t = 0;
  let last = performance.now();
  const show = () => {
    tl.render(t);
    scrub.value = String(Math.round((t / tl.duration) * 1000));
    clock.value = `${t.toFixed(1)} s`;
    play.textContent = playing ? "Pause" : "Lecture";
  };
  play.onclick = () => { playing = !playing; last = performance.now(); show(); };
  scrub.oninput = () => { t = (Number(scrub.value) / 1000) * tl.duration; playing = false; show(); };
  window.__ready.then(() => {
    const loop = (now) => {
      if (playing) t = (t + (now - last) / 1000) % tl.duration;
      last = now;
      show();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
}
