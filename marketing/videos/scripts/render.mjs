// Rend une composition en MP4 : Chrome (sans fenêtre) affiche chaque image à
// l'instant exact demandé, ffmpeg assemble les captures en H.264.
//
//   node scripts/render.mjs                      -> toutes les vidéos en 9:16
//   node scripts/render.mjs --all                -> toutes les vidéos, tous les formats
//   node scripts/render.mjs explainer 9x16       -> une vidéo, un format
//   node scripts/render.mjs explainer 9x16 --still 3,12.5 -> images PNG à 3 s et 12,5 s
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { startServer } from "./serve.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const FORMATS = { "9x16": [1080, 1920], "1x1": [1080, 1080], "16x9": [1920, 1080] };
const FPS = 30;
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const allFormats = process.argv.includes("--all");
const args = process.argv.slice(2).filter((a) => a !== "--all");
const stillIdx = args.indexOf("--still");
const stills = stillIdx >= 0 ? args.splice(stillIdx, 2)[1].split(",").map(Number) : null;
const { default: videos } = await import(join(root, "src/videos.js"));
const ids = args[0] ? [args[0]] : Object.keys(videos);
// 9:16 (Reels, TikTok, Stories) par défaut ; --all ajoute le carré et le 16:9.
const formats = args[1] ? [args[1]] : allFormats ? Object.keys(FORMATS) : ["9x16"];

const { server, url } = await startServer();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--force-color-profile=srgb", "--hide-scrollbars", "--font-render-hinting=none"] });
await mkdir(join(root, "out"), { recursive: true });

try {
  for (const id of ids) {
    if (!videos[id]) throw new Error(`Vidéo inconnue : ${id} (connues : ${Object.keys(videos).join(", ")})`);
    for (const format of formats) {
      const [width, height] = FORMATS[format] ?? [];
      if (!width) throw new Error(`Format inconnu : ${format}`);
      const page = await browser.newPage();
      await page.setViewport({ width, height, deviceScaleFactor: 1 });
      await page.goto(`${url}/index.html?video=${id}&format=${format}&render=1`, { waitUntil: "networkidle0" });
      await page.evaluate(() => window.__ready);
      const duration = await page.evaluate(() => window.__duration);

      if (stills) {
        for (const still of stills) {
          await page.evaluate((t) => window.__render(t), still);
          const file = join(root, "out", `${id}-${format}-${String(still).replace(".", "_")}s.png`);
          await page.screenshot({ path: file });
          console.log(`Image : ${file}`);
        }
        await page.close();
        continue;
      }

      const file = join(root, "out", `fove-${id}-${format}.mp4`);
      const ffmpeg = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
        "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-r", String(FPS), file], { stdio: ["pipe", "inherit", "inherit"] });
      const done = new Promise((ok, ko) => ffmpeg.on("close", (code) => (code === 0 ? ok() : ko(new Error(`ffmpeg a échoué (${code})`)))));

      const frames = Math.round(duration * FPS);
      for (let f = 0; f < frames; f++) {
        await page.evaluate((t) => window.__render(t), f / FPS);
        const png = await page.screenshot({ type: "png", optimizeForSpeed: true });
        if (!ffmpeg.stdin.write(png)) await new Promise((r) => ffmpeg.stdin.once("drain", r));
        if (f % FPS === 0) process.stdout.write(`\r${id} ${format} : ${Math.round((f / frames) * 100)} %   `);
      }
      ffmpeg.stdin.end();
      await done;
      console.log(`\r${id} ${format} : ${file}`);
      await page.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}
