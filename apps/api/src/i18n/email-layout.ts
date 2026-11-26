/**
 * Gabarit HTML des emails FOVE, à l'image de la marque : logo, couleurs (cobalt, tampon, encre),
 * carte blanche sur fond clair, bouton, code mis en valeur, pied de page. Tous les emails passent par
 * ici : ceux qui n'ont qu'un texte sont mis en page automatiquement (`textToBrandedHtml`).
 * Compatible avec les clients mail : tableaux, styles en ligne, aucune image en dehors du logo.
 */
import { loadConfig } from "../config";
import type { Locale } from "./locale";

/** Couleurs de la marque (apps/web/src/app/globals.css). */
export const BRAND = { cobalt: "#2C55F5", stamp: "#F5B82E", ink: "#14204A", ink2: "#4B5675", ink3: "#8A93AD", line: "#E6E9F2", bg: "#F4F6FB", soft: "#E6ECFF" };

export const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const FALLBACK: Record<Locale, string> = {
  fr: "Si le bouton ne fonctionne pas, copiez-collez l'adresse suivante dans votre navigateur :",
  en: "If the button doesn't work, copy and paste this address into your browser:",
  ar: "إذا لم يعمل الزر، انسخ العنوان التالي والصقه في متصفحك:",
  es: "Si el botón no funciona, copia y pega esta dirección en tu navegador:",
};

const TAGLINE: Record<Locale, string> = {
  fr: "La carte de fidélité dans le téléphone de vos clients.",
  en: "The loyalty card in your customers' phones.",
  ar: "بطاقة الولاء في هاتف عملائك.",
  es: "La tarjeta de fidelidad en el teléfono de tus clientes.",
};

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Texte en HTML sûr : échappement, liens cliquables, retours à la ligne. */
function richText(text: string, color: string): string {
  return escapeHtml(text)
    .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, `<a href="$1" style="color: ${color}; word-break: break-all;">$1</a>`)
    .replace(/\n/g, "<br>");
}

const paragraphHtml = (text: string, color: string) =>
  `<p style="font-size: 15px; line-height: 24px; color: ${BRAND.ink2}; margin: 0 0 16px;">${richText(text, color)}</p>`;

/** Code ou référence mis en valeur (code de connexion, référence de paiement). */
const codeHtml = (code: string, color: string) =>
  `<table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin: 4px 0 20px;"><tr><td dir="ltr" style="background: ${BRAND.soft}; border-radius: 12px; padding: 14px 22px; font-family: 'SFMono-Regular', Menlo, Consolas, monospace; font-size: 28px; font-weight: 700; letter-spacing: 6px; color: ${color};">${escapeHtml(code)}</td></tr></table>`;

const buttonHtml = (label: string, url: string, color: string) =>
  `<table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin: 8px 0 24px;"><tr><td align="center" bgcolor="${color}" style="border-radius: 10px;"><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" style="font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none; padding: 13px 26px; border-radius: 10px; display: inline-block;">${escapeHtml(label)}</a></td></tr></table>`;

/** Mise en page commune : en-tête au logo, carte, pied de page FOVE. `body` est du HTML déjà sûr. */
export function brandLayout(locale: Locale, p: { title: string; body: string; footer?: string; color?: string }): string {
  const dir = locale === "ar" ? "rtl" : "ltr";
  const align = locale === "ar" ? "right" : "left";
  const color = p.color ?? BRAND.cobalt;
  const appUrl = loadConfig().APP_URL;
  return `<!DOCTYPE html>
<html lang="${locale}" dir="${dir}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <title>${escapeHtml(p.title)}</title>
</head>
<body dir="${dir}" style="margin: 0; padding: 0; background-color: ${BRAND.bg}; font-family: ${FONT}; color: ${BRAND.ink}; text-align: ${align};">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: ${BRAND.bg};">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" dir="${dir}" style="max-width: 560px;">
          <tr>
            <td style="padding: 0 4px 20px; text-align: ${align};">
              <a href="${escapeHtml(appUrl)}" style="text-decoration: none;"><img src="${escapeHtml(appUrl)}/brand/fove-logo.png" width="120" height="40" alt="FOVE" style="display: block; border: 0; height: 40px; width: 120px;"></a>
            </td>
          </tr>
          <tr>
            <td style="background: #ffffff; border-radius: 16px; border: 1px solid ${BRAND.line}; overflow: hidden;">
              <div style="height: 4px; background: ${color}; line-height: 4px; font-size: 0;">&nbsp;</div>
              <div style="padding: 32px 32px 16px; text-align: ${align};">
                ${p.body}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 8px 0; text-align: ${align};">
              ${p.footer ? `<p style="font-size: 12px; line-height: 18px; color: ${BRAND.ink3}; margin: 0 0 8px;">${escapeHtml(p.footer)}</p>` : ""}
              <p style="font-size: 12px; line-height: 18px; color: ${BRAND.ink3}; margin: 0;"><strong style="color: ${BRAND.ink};">FOVE</strong> · ${escapeHtml(TAGLINE[locale])} · <a href="${escapeHtml(appUrl)}" style="color: ${BRAND.ink3};">${escapeHtml(appUrl.replace(/^https?:\/\//, ""))}</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Ligne seule qui est un code (6 chiffres) ou une référence de paiement : mise en valeur. */
const CODE_LINE = /^(\d{6}|FV-[A-Z0-9-]{6,})$/;

/** Email structuré : titre, paragraphes, code éventuel, bouton éventuel avec lien de secours. */
export function emailHtml(
  locale: Locale,
  p: { title: string; heading: string; paragraphs: string[]; code?: string; button?: { label: string; url: string }; footer: string; color?: string },
): string {
  const color = p.color ?? BRAND.cobalt;
  const body = [
    `<h1 style="font-size: 22px; line-height: 30px; font-weight: 700; margin: 0 0 16px; color: ${BRAND.ink};">${escapeHtml(p.heading)}</h1>`,
    // Un paragraphe qui n'est qu'un code ou une référence de paiement est mis en valeur.
    ...p.paragraphs.map((text) => (CODE_LINE.test(text.trim()) ? codeHtml(text.trim(), color) : paragraphHtml(text, color))),
    p.code ? codeHtml(p.code, color) : "",
    p.button ? buttonHtml(p.button.label, p.button.url, color) : "",
    p.button
      ? `<p style="font-size: 12px; line-height: 18px; color: ${BRAND.ink3}; margin: 0 0 6px;">${FALLBACK[locale]}</p><p dir="ltr" style="font-size: 12px; line-height: 18px; margin: 0 0 16px; word-break: break-all;"><a href="${escapeHtml(p.button.url)}" style="color: ${color};">${escapeHtml(p.button.url)}</a></p>`
      : "",
  ].join("\n");
  return brandLayout(locale, { title: p.title, body, footer: p.footer, color });
}

/**
 * Email sans version HTML : mis en page au gabarit FOVE à partir du texte (paragraphes, liens,
 * codes et références en valeur). La langue est déduite de l'écriture (arabe : de droite à gauche).
 */
export function textToBrandedHtml(text: string, subject: string, lang?: Locale): string {
  const locale: Locale = lang ?? (/[\u0600-\u06FF]/.test(text) ? "ar" : "fr");
  const blocks = text.trim().split(/\n{2,}/);
  const body = [
    `<h1 style="font-size: 20px; line-height: 28px; font-weight: 700; margin: 0 0 16px; color: ${BRAND.ink};">${escapeHtml(subject)}</h1>`,
    ...blocks.map((block) => (CODE_LINE.test(block.trim()) ? codeHtml(block.trim(), BRAND.cobalt) : paragraphHtml(block, BRAND.cobalt))),
  ].join("\n");
  return brandLayout(locale, { title: subject, body });
}
