// Copie dans src/assets tout ce dont les compositions ont besoin, pour qu'elles
// tournent sans réseau : polices, logo officiel, badges Wallet et QR code réel.
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(root, "../..");
const out = join(root, "src/assets");
await mkdir(out, { recursive: true });

const copies = [
  ["node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2", "bricolage-grotesque.woff2"],
  ["node_modules/@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2", "figtree.woff2"],
  [join(repo, "apps/web/public/brand/fove-logo.png"), "fove-logo.png"],
  [join(repo, "apps/web/src/app/icon.svg"), "fove-icon.svg"],
  [join(repo, "apps/web/public/wallet/add-to-apple-wallet.svg"), "add-to-apple-wallet.svg"],
  [join(repo, "apps/web/public/wallet/add-to-google-wallet.svg"), "add-to-google-wallet.svg"],
];
for (const [from, to] of copies) {
  await copyFile(from.startsWith("/") ? from : join(root, from), join(out, to));
}

// Vrai QR code : un spectateur qui le scanne arrive sur fove.digital.
const qr = await QRCode.toString("https://fove.digital", { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#14204A", light: "#0000" } });
await writeFile(join(out, "qr-fove-digital.svg"), qr);
console.log(`Assets prêts dans ${out}`);
