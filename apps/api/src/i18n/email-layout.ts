/**
 * Gabarit HTML des emails FOVE, à l'image de la marque (design d'Arnold, 7e5eac6) : en-tête bleu nuit,
 * liseré jaune, carte blanche sur fond clair, bouton, code mis en valeur, pied de page. Tous les emails passent par
 * ici : ceux qui n'ont qu'un texte sont mis en page automatiquement (`textToBrandedHtml`).
 * Compatible avec les clients mail : tableaux, styles en ligne, aucune image (le nom FOVE est du texte).
 */
import type { Locale } from "./locale";

/** Couleurs de la marque (apps/web/src/app/globals.css). */
export const BRAND = { cobalt: "#2C55F5", stamp: "#F5B82E", ink: "#14204A", ink2: "#4A5579", ink3: "#7A849F", line: "#DCE1EC", bg: "#F6F7FB", soft: "#E6ECFF" };

/** Couleur d'accent sûre : la couleur d'un commerce n'est utilisée que si c'est bien un code #RRGGBB. */
const safeColor = (color: string | undefined) => (color && /^#[0-9a-f]{6}$/i.test(color) ? color : BRAND.cobalt);

export const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const FALLBACK: Record<Locale, string> = {
  fr: "Si le bouton ne fonctionne pas, copiez-collez l'adresse suivante dans votre navigateur :",
  en: "If the button doesn't work, copy and paste this address into your browser:",
  ar: "إذا لم يعمل الزر، انسخ العنوان التالي والصقه في متصفحك:",
  es: "Si el botón no funciona, copia y pega esta dirección en tu navegador:",
};

const BRAND_FOOTER: Record<Locale, string> = {
  fr: "FOVE · La fidélité qui rapproche",
  en: "FOVE · Loyalty that brings people closer",
  ar: "FOVE · ولاء يجمعنا",
  es: "FOVE · La fidelidad que nos acerca",
};

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Texte en HTML sûr : échappement, liens cliquables, retours à la ligne. */
function richText(text: string, color: string): string {
  // Un lien s'arrête aux caractères échappés (<, >, guillemets) : un texte saisi ne peut pas prolonger une adresse.
  return escapeHtml(text)
    .replace(/https?:\/\/(?:(?!&(?:lt|gt|quot|#39);)[^\s<])+/g, (match) => {
      const url = match.replace(/[.,;:!?)]+$/, "");
      return `<a href="${url}" style="color: ${color}; word-break: break-all;">${url}</a>${match.slice(url.length)}`;
    })
    .replace(/\n/g, "<br>");
}

const paragraphHtml = (text: string, color: string) =>
  `<p style="font-size: 16px; line-height: 26px; color: ${BRAND.ink2}; margin: 0 0 16px;">${richText(text, color)}</p>`;

/** Code ou référence mis en valeur (code de connexion, référence de paiement). */
const codeHtml = (code: string, color: string) =>
  `<table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin: 4px 0 20px;"><tr><td dir="ltr" style="background: ${BRAND.soft}; border-radius: 12px; padding: 14px 22px; font-family: 'SFMono-Regular', Menlo, Consolas, monospace; font-size: 28px; font-weight: 700; letter-spacing: 6px; color: ${color};">${escapeHtml(code)}</td></tr></table>`;

const buttonHtml = (label: string, url: string, color: string) =>
  `<table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin: 10px 0 28px;"><tr><td align="center" bgcolor="${color}" style="border-radius: 10px; box-shadow: 0 6px 16px rgba(44, 85, 245, 0.22);"><a class="fove-button" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" style="font-size: 15px; line-height: 20px; font-weight: 700; color: #ffffff; text-decoration: none; padding: 14px 24px; border: 1px solid ${color}; border-radius: 10px; display: inline-block;">${escapeHtml(label)}</a></td></tr></table>`;

/**
 * Mise en page commune (identité visuelle FOVE) : en-tête bleu nuit au nom FOVE et liseré jaune,
 * carte blanche, texte d'aperçu caché, adaptation mobile, pied de page. `body` est du HTML déjà sûr ;
 * `preheader` est le texte d'aperçu affiché par les messageries.
 */
export function brandLayout(locale: Locale, p: { title: string; preheader?: string; body: string; footer?: string; color?: string }): string {
  const dir = locale === "ar" ? "rtl" : "ltr";
  const align = locale === "ar" ? "right" : "left";
  return `<!DOCTYPE html>
<html lang="${locale}" dir="${dir}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(p.title)}</title>
  <style>
    @media only screen and (max-width: 620px) {
      .fove-page { padding: 16px 10px !important; }
      .fove-content { padding: 30px 22px 26px !important; }
      .fove-header { padding: 22px !important; }
      .fove-button { display: block !important; text-align: center !important; }
    }
  </style>
</head>
<body dir="${dir}" style="font-family: ${FONT}; background-color: ${BRAND.bg}; margin: 0; padding: 0; color: ${BRAND.ink}; text-align: ${align}; -webkit-text-size-adjust: 100%;">
  <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent; mso-hide: all;">${escapeHtml(p.preheader ?? p.title)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" bgcolor="${BRAND.bg}">
    <tr>
      <td class="fove-page" style="padding: 32px 16px;">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" dir="${dir}" style="width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid ${BRAND.line}; border-radius: 18px; overflow: hidden; box-shadow: 0 12px 32px rgba(20, 32, 74, 0.08);">
          <tr>
            <td class="fove-header" bgcolor="${BRAND.ink}" style="padding: 24px 34px; text-align: ${align}; border-bottom: 4px solid ${BRAND.stamp};">
              <span style="display: inline-block; font-size: 22px; line-height: 26px; font-weight: 800; letter-spacing: 3px; color: #ffffff;">FOVE</span>
            </td>
          </tr>
          <tr>
            <td class="fove-content" style="padding: 38px 34px 30px; text-align: ${align};">
              ${p.body}
              ${p.footer ? `<div style="height: 1px; line-height: 1px; background-color: #E5E8F0; margin: 28px 0 20px;">&nbsp;</div><p style="font-size: 12px; line-height: 19px; color: ${BRAND.ink3}; margin: 0;">${escapeHtml(p.footer)}</p>` : ""}
            </td>
          </tr>
        </table>
        <p style="font-size: 11px; line-height: 17px; color: #8B94AA; text-align: center; margin: 16px 0 0;">${escapeHtml(BRAND_FOOTER[locale])}</p>
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
  const color = safeColor(p.color);
  const body = [
    `<h1 style="font-size: 25px; line-height: 32px; font-weight: 700; margin: 0 0 20px; color: ${BRAND.ink}; letter-spacing: -0.3px;">${escapeHtml(p.heading)}</h1>`,
    // Un paragraphe qui n'est qu'un code ou une référence de paiement est mis en valeur.
    ...p.paragraphs.map((text) => (CODE_LINE.test(text.trim()) ? codeHtml(text.trim(), color) : paragraphHtml(text, color))),
    p.code ? codeHtml(p.code, color) : "",
    p.button ? buttonHtml(p.button.label, p.button.url, color) : "",
    p.button
      ? `<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: ${BRAND.bg}; border-radius: 10px;"><tr><td style="padding: 15px 17px;"><p style="font-size: 12px; line-height: 18px; color: #687394; margin: 0 0 6px;">${FALLBACK[locale]}</p><p style="font-size: 12px; line-height: 18px; word-break: break-all; margin: 0;" dir="ltr"><a href="${escapeHtml(p.button.url)}" style="color: ${color}; text-decoration: underline;">${escapeHtml(p.button.url)}</a></p></td></tr></table>`
      : "",
  ].join("\n");
  return brandLayout(locale, { title: p.title, preheader: p.heading, body, footer: p.footer, color });
}

/**
 * Email sans version HTML : mis en page au gabarit FOVE à partir du texte (paragraphes, liens,
 * codes et références en valeur). La langue est déduite de l'écriture (arabe : de droite à gauche).
 */
export function textToBrandedHtml(text: string, subject: string, lang?: Locale): string {
  const locale: Locale = lang ?? (/[\u0600-\u06FF]/.test(text) ? "ar" : "fr");
  const blocks = text.trim().split(/\n{2,}/);
  const body = [
    `<h1 style="font-size: 23px; line-height: 30px; font-weight: 700; margin: 0 0 20px; color: ${BRAND.ink}; letter-spacing: -0.3px;">${escapeHtml(subject)}</h1>`,
    ...blocks.map((block) => (CODE_LINE.test(block.trim()) ? codeHtml(block.trim(), BRAND.cobalt) : paragraphHtml(block, BRAND.cobalt))),
  ].join("\n");
  return brandLayout(locale, { title: subject, body });
}

// --- Notifications internes à l'équipe FOVE ---------------------------------------------------

/** Rubriques des notifications internes : une couleur par rubrique, pour trier d'un coup d'œil. */
export const TEAM_TOPICS = {
  partners: { label: "Partenaires", color: "#7C3AED" },
  contact: { label: "Contact", color: "#2C55F5" },
  billing: { label: "Encaissements", color: "#12936B" },
  watch: { label: "À surveiller", color: "#C2410C" },
  digest: { label: "Récapitulatif", color: "#14204A" },
} as const;
export type TeamTopic = keyof typeof TEAM_TOPICS;

/** Ligne d'une section : texte seul, ou texte cliquable vers une page de l'administration. */
export type TeamRow = string | { text: string; url: string };

export interface TeamSection {
  title: string;
  /** Lignes déjà rédigées ; vide : la section affiche « Rien à signaler ». */
  rows: TeamRow[];
}

const rowText = (row: TeamRow) => (typeof row === "string" ? row : `${row.text} (${row.url})`);

export interface TeamMessage {
  topic: TeamTopic;
  /** Objet de l'email, sans le préfixe de rubrique. */
  subject: string;
  heading: string;
  intro?: string;
  /** Paires libellé / valeur (les valeurs vides sont ignorées). */
  fields?: Array<[string, string | null | undefined]>;
  sections?: TeamSection[];
  button?: { label: string; url: string };
}

const TEAM = { bg: "#EEF0F4", card: "#FFFFFF", ink: "#14204A", muted: "#5B6582", line: "#E2E6EE", mono: "'SFMono-Regular', Menlo, Consolas, monospace" };

/** Objet d'une notification interne : préfixe de rubrique pour filtrer la boîte de réception. */
export const teamSubject = (m: Pick<TeamMessage, "topic" | "subject">) => `[FOVE · ${TEAM_TOPICS[m.topic].label}] ${m.subject}`;

/** Version texte d'une notification interne. */
export function teamText(m: TeamMessage): string {
  const fields = (m.fields ?? []).filter(([, v]) => v).map(([k, v]) => `${k} : ${v}`);
  const sections = (m.sections ?? []).map((s) => `${s.title}\n${s.rows.length ? s.rows.map((r) => `- ${rowText(r)}`).join("\n") : "- Rien à signaler"}`);
  return [m.heading, m.intro, fields.join("\n"), ...sections, m.button ? `${m.button.label} : ${m.button.url}` : null].filter(Boolean).join("\n\n");
}

/**
 * Gabarit des notifications internes, volontairement distinct des emails envoyés aux clients :
 * fond gris, carte sobre à liseré de couleur de rubrique, étiquette « Équipe FOVE », tableau
 * libellé / valeur, bouton vers l'administration. En français uniquement.
 */
export function teamHtml(m: TeamMessage, recipient: string): string {
  const topic = TEAM_TOPICS[m.topic];
  const fields = (m.fields ?? []).filter(([, v]) => v);
  const fieldRows = fields
    .map(
      ([k, v]) =>
        `<tr><td style="padding: 7px 12px 7px 0; width: 150px; vertical-align: top; font-size: 13px; color: ${TEAM.muted};">${escapeHtml(k)}</td><td style="padding: 7px 0; font-size: 14px; color: ${TEAM.ink}; word-break: break-word;">${richText(v!, topic.color)}</td></tr>`,
    )
    .join("");
  const sections = (m.sections ?? [])
    .map(
      (s) =>
        `<p style="margin: 22px 0 8px; font-size: 12px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: ${TEAM.muted};">${escapeHtml(s.title)} <span style="color: ${topic.color};">(${s.rows.length})</span></p>` +
        (s.rows.length
          ? `<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">${s.rows.map((r) => `<tr><td style="padding: 6px 0; border-top: 1px solid ${TEAM.line}; font-size: 14px; color: ${TEAM.ink};">${typeof r === "string" ? richText(r, topic.color) : `<a href="${escapeHtml(r.url)}" style="color: ${TEAM.ink}; text-decoration: underline;">${escapeHtml(r.text)}</a>`}</td></tr>`).join("")}</table>`
          : `<p style="margin: 0; font-size: 13px; color: ${TEAM.muted};">Rien à signaler</p>`),
    )
    .join("");
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(teamSubject(m))}</title></head>
<body style="margin: 0; padding: 0; background-color: ${TEAM.bg}; font-family: ${FONT}; color: ${TEAM.ink};">
  <div style="display: none; max-height: 0; overflow: hidden;">${escapeHtml(m.heading)}</div>
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" bgcolor="${TEAM.bg}">
    <tr><td style="padding: 24px 12px;">
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 640px; margin: 0 auto;">
        <tr><td style="padding: 0 4px 10px; font-family: ${TEAM.mono}; font-size: 11px; letter-spacing: 1.5px; color: ${TEAM.muted};">
          FOVE · ÉQUIPE &nbsp;<span style="display: inline-block; padding: 2px 8px; border-radius: 4px; background-color: ${topic.color}; color: #ffffff; letter-spacing: 1px;">${escapeHtml(topic.label.toUpperCase())}</span>
        </td></tr>
        <tr><td style="background-color: ${TEAM.card}; border: 1px solid ${TEAM.line}; border-left: 4px solid ${topic.color}; border-radius: 6px; padding: 22px 24px;">
          <h1 style="margin: 0 0 6px; font-size: 19px; line-height: 26px; font-weight: 700; color: ${TEAM.ink};">${escapeHtml(m.heading)}</h1>
          ${m.intro ? `<p style="margin: 0 0 12px; font-size: 14px; line-height: 21px; color: ${TEAM.muted};">${richText(m.intro, topic.color)}</p>` : ""}
          ${fieldRows ? `<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 8px; border-top: 1px solid ${TEAM.line};">${fieldRows}</table>` : ""}
          ${sections}
          ${m.button ? `<table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin-top: 22px;"><tr><td bgcolor="${TEAM.ink}" style="border-radius: 6px;"><a href="${escapeHtml(m.button.url)}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 10px 18px; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none;">${escapeHtml(m.button.label)} →</a></td></tr></table>` : ""}
        </td></tr>
        <tr><td style="padding: 12px 4px 0; font-size: 11px; line-height: 16px; color: ${TEAM.muted};">Notification interne envoyée automatiquement à ${escapeHtml(recipient)}. Ne pas transférer à un client.</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
