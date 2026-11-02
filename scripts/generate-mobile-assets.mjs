/**
 * Génère les icônes et écrans de démarrage iOS / Android depuis la marque FOVE
 * (même dessin que apps/web/src/app/icon.svg). À relancer après `cap add`.
 *   node scripts/generate-mobile-assets.mjs
 */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sharp = createRequire(resolve(root, "apps/api/package.json"))("sharp");

const COBALT = "#2C55F5";
const GOLD = "#F5B82E";
const INK = "#14204A";

// Anneau FOVE centré ; `scale` = diamètre de l'anneau rapporté au côté.
const ring = (size, scale, background) => {
  const r = (size * scale) / 2;
  const c = size / 2;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    ${background ? `<rect width="${size}" height="${size}" fill="${background}"/>` : ""}
    <circle cx="${c}" cy="${c}" r="${r * 0.86}" fill="none" stroke="${GOLD}" stroke-width="${r * 0.32}"/>
    <circle cx="${c}" cy="${c}" r="${r * 0.3}" fill="${GOLD}"/>
  </svg>`);
};

// Tuile arrondie pour l'écran de démarrage (comme l'icône sur l'écran d'accueil).
const tile = (size) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect width="${size}" height="${size}" rx="${size * 0.225}" fill="${COBALT}"/>
  </svg>`);

async function png(svg, out, { round = false, opaque = false } = {}) {
  let img = opaque ? sharp(svg).flatten({ background: COBALT }).removeAlpha().png() : sharp(svg).png();
  if (round) {
    const { width } = await sharp(svg).metadata();
    const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${width}"><circle cx="${width / 2}" cy="${width / 2}" r="${width / 2}"/></svg>`);
    img = sharp(await img.toBuffer()).composite([{ input: mask, blend: "dest-in" }]).png();
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, await img.toBuffer());
}

async function splash(width, height, out, flatten = false) {
  const side = Math.round(Math.min(width, height) * 0.28);
  const logo = await sharp(tile(side)).composite([{ input: ring(side, 0.56) }]).png().toBuffer();
  let img = sharp({ create: { width, height, channels: 4, background: INK } }).composite([{ input: logo, gravity: "center" }]);
  let buf = await img.png().toBuffer();
  if (flatten) buf = await sharp(buf).flatten({ background: INK }).removeAlpha().png().toBuffer();
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, buf);
}

// iOS : une icône 1024 sans transparence (iOS arrondit lui-même les coins).
const ios = resolve(root, "ios/App/App/Assets.xcassets");
// L'App Store refuse une icône avec canal alpha.
await png(ring(1024, 0.56, COBALT), `${ios}/AppIcon.appiconset/AppIcon-512@2x.png`, { opaque: true });
for (const name of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]) {
  await splash(2732, 2732, `${ios}/Splash.imageset/${name}`, true);
}

// Android : icônes classiques, rondes et adaptatives (zone sûre de 66/108 dp).
const res = resolve(root, "android/app/src/main/res");
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(densities)) {
  await png(ring(48 * k, 0.56, COBALT), `${res}/mipmap-${d}/ic_launcher.png`);
  await png(ring(48 * k, 0.56, COBALT), `${res}/mipmap-${d}/ic_launcher_round.png`, { round: true });
  await png(ring(108 * k, 0.38), `${res}/mipmap-${d}/ic_launcher_foreground.png`);
}
writeFileSync(
  `${res}/values/ic_launcher_background.xml`,
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${COBALT}</color>\n</resources>\n`,
);

const portrait = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] };
for (const [d, [w, h]] of Object.entries(portrait)) {
  await splash(w, h, `${res}/drawable-port-${d}/splash.png`);
  await splash(h, w, `${res}/drawable-land-${d}/splash.png`);
}
await splash(480, 320, `${res}/drawable/splash.png`);

console.log("Icônes et écrans de démarrage générés.");
