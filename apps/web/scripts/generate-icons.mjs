// Génère l'icône de partage (256×256, fond plein) et les icônes PWA depuis le logo.
import sharp from "sharp";
import { writeFile } from "node:fs/promises";

const logo = (size, pad) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">
  <rect width="32" height="32" fill="#2C55F5"/>
  <g transform="translate(16 16) scale(${(32 - pad * 2) / 32}) translate(-16 -16)">
    <circle cx="16" cy="16" r="8.5" fill="none" stroke="#F5B82E" stroke-width="3.2"/>
    <circle cx="16" cy="16" r="3" fill="#F5B82E"/>
  </g>
</svg>`;

await sharp(Buffer.from(logo(256, 6))).png({ compressionLevel: 9 }).toFile("public/share-icon.png");
await sharp(Buffer.from(logo(192, 5))).png().toFile("public/icon-192.png");
await sharp(Buffer.from(logo(512, 5))).png().toFile("public/icon-512.png");
await sharp(Buffer.from(logo(180, 6))).png().toFile("public/apple-touch-icon.png");
await writeFile("src/app/icon.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="#2C55F5"/><circle cx="16" cy="16" r="8.5" fill="none" stroke="#F5B82E" stroke-width="3.2"/><circle cx="16" cy="16" r="3" fill="#F5B82E"/></svg>\n`);
console.log("Icônes générées");
