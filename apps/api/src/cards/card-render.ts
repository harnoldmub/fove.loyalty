import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument, PDFName, PDFString } from "pdf-lib";
import QRCode from "qrcode";
import sharp from "sharp";

/**
 * Carte de fidélité téléchargeable (PNG, PDF) au format téléphone 9:16.
 *
 * Rendue côté serveur : satori transforme le texte en tracés (aucune police
 * système requise), sharp produit le PNG, pdf-lib l'emboîte dans un PDF où
 * l'adresse de la carte est cliquable. Le solde n'y figure pas : il change,
 * alors qu'un fichier téléchargé reste figé.
 */
export interface CardDesign {
  tenantName: string;
  /** Logo déjà chargé (PNG/JPEG/WebP), ou null pour l'initiale. */
  logo: Buffer | null;
  primaryColor: string;
  holder: string;
  cardNumber: string;
  /** Contenu du QR personnel (identique à celui lu par le scanner). */
  qrPayload: string;
  /** Adresse de la carte en ligne (solde à jour). */
  url: string;
  /** Règle courte du programme : « 10 tampons = Café offert ». */
  rule: string;
}

const WIDTH = 1080;
const HEIGHT = 1920;
/** Zone de l'adresse en bas de carte (px), rendue cliquable dans le PDF. */
const LINK_BOX = { top: 1690, height: 130 };
const INK = "#14204A";
const MUTED = "#6F7896";

type Node = { type: string; props: Record<string, unknown> };
function h(type: string, props: Record<string, unknown>, ...children: (Node | string | null)[]): Node {
  const kids = children.filter((c) => c !== null);
  return { type, props: { ...props, children: kids.length === 1 ? kids[0] : kids } };
}

let fonts: Promise<{ name: string; data: Buffer; weight: 400 | 600 | 700; style: "normal" }[]> | null = null;
function loadFonts() {
  const file = (pkg: string, name: string) => readFile(join(require.resolve(`${pkg}/package.json`), "..", "files", name));
  fonts ??= Promise.all([
    file("@fontsource/bricolage-grotesque", "bricolage-grotesque-latin-700-normal.woff").then((data) => ({ name: "Bricolage", data, weight: 700 as const, style: "normal" as const })),
    file("@fontsource/figtree", "figtree-latin-400-normal.woff").then((data) => ({ name: "Figtree", data, weight: 400 as const, style: "normal" as const })),
    file("@fontsource/figtree", "figtree-latin-600-normal.woff").then((data) => ({ name: "Figtree", data, weight: 600 as const, style: "normal" as const })),
  ]);
  return fonts;
}

function safeColor(color: string) {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#2C55F5";
}

function tree(design: CardDesign, logo: string | null, qr: string): Node {
  const color = safeColor(design.primaryColor);
  const center = { display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" };
  const shortUrl = design.url.replace(/^https?:\/\//, "");
  return h(
    "div",
    { style: { width: WIDTH, height: HEIGHT, display: "flex", flexDirection: "column", alignItems: "center", backgroundColor: "#FFFFFF", fontFamily: "Figtree", color: INK } },
    h("div", { style: { width: WIDTH, height: 30, backgroundColor: color } }),
    h(
      "div",
      { style: { ...center, marginTop: 100 } },
      logo
        ? h("img", { src: logo, width: 170, height: 170, style: { borderRadius: 85, objectFit: "cover" } })
        : h("div", { style: { width: 170, height: 170, borderRadius: 85, backgroundColor: color, color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Bricolage", fontSize: 90 } }, design.tenantName.slice(0, 1).toUpperCase()),
      h("div", { style: { marginTop: 44, fontSize: 36, fontWeight: 600, color } }, design.tenantName),
      h("div", { style: { marginTop: 20, maxWidth: 940, fontFamily: "Bricolage", fontSize: design.holder.length > 18 ? 66 : 86, lineHeight: 1.05 } }, design.holder),
      h("div", { style: { marginTop: 20, fontSize: 34, fontWeight: 600, letterSpacing: 5, color: MUTED } }, design.cardNumber),
    ),
    h("img", { src: qr, width: 620, height: 620, style: { marginTop: 64 } }),
    h(
      "div",
      { style: { marginTop: 56, display: "flex", alignItems: "center", backgroundColor: INK, color: "#FFFFFF", padding: "22px 40px", borderRadius: 18, fontSize: 36, fontWeight: 600 } },
      design.rule,
    ),
    h(
      "div",
      { style: { ...center, position: "absolute", left: 0, right: 0, top: LINK_BOX.top, height: LINK_BOX.height, justifyContent: "center" } },
      h("div", { style: { fontSize: 28, color: MUTED } }, "Ma carte en ligne"),
      h("div", { style: { marginTop: 8, fontSize: 28, fontWeight: 600 } }, shortUrl.length > 60 ? `${shortUrl.slice(0, 57)}…` : shortUrl),
    ),
  );
}

/** PNG de la carte (1080 × 1920 px). */
export async function renderCardPng(design: CardDesign): Promise<Buffer> {
  const { default: satori } = await import("satori");
  const [fontData, qrPng, logo] = await Promise.all([
    loadFonts(),
    QRCode.toBuffer(design.qrPayload, { errorCorrectionLevel: "M", width: 620, margin: 2, color: { dark: "#14204A", light: "#FFFFFF" } }),
    design.logo ? sharp(design.logo).resize(340, 340, { fit: "cover" }).png().toBuffer() : Promise.resolve(null),
  ]);
  const svg = await satori(
    tree(design, logo ? `data:image/png;base64,${logo.toString("base64")}` : null, `data:image/png;base64,${qrPng.toString("base64")}`) as never,
    { width: WIDTH, height: HEIGHT, fonts: fontData },
  );
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}

/** PDF d'une page (90 × 160 mm), adresse de la carte cliquable. */
export async function renderCardPdf(design: CardDesign): Promise<Buffer> {
  const png = await renderCardPng(design);
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Carte de fidélité ${design.tenantName}`);
  pdf.setCreator("FOVE");
  const width = (90 * 72) / 25.4;
  const height = (160 * 72) / 25.4;
  const page = pdf.addPage([width, height]);
  page.drawImage(await pdf.embedPng(png), { x: 0, y: 0, width, height });
  const scale = height / HEIGHT;
  const link = pdf.context.register(
    pdf.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [0, height - (LINK_BOX.top + LINK_BOX.height) * scale, width, height - LINK_BOX.top * scale],
      Border: [0, 0, 0],
      A: { Type: "Action", S: "URI", URI: PDFString.of(design.url) },
    }),
  );
  page.node.set(PDFName.of("Annots"), pdf.context.obj([link]));
  // Sans flux d’objets compressés : le lien reste lisible par tous les lecteurs PDF.
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}
