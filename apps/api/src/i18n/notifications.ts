/**
 * Messages courts envoyés aux clients d'un commerce (WhatsApp, lien de carte,
 * règle du programme, résumé des récompenses). Langue : celle du commerce.
 */
import { INTL_LOCALE, plural, type Locale } from "./locale";

interface RuleProgram {
  mode: string;
  stampsTarget: number;
  spendStep: { toString(): string };
  pointsPerStep: number;
  currency: string;
}

const T = {
  fr: {
    aReward: "une récompense",
    points: { one: "# point", other: "# points" },
    stamps: { one: "# tampon", other: "# tampons" },
    gift: "Cadeau",
    percentOff: (n: string) => `${n} % de réduction`,
    amountOff: (n: string, c: string) => `${n} ${c} de réduction`,
    shareIntro: (first: string | null) => (first ? `Bonjour ${first}, voici` : "Voici"),
    share: (intro: string, tenant: string, url: string, rule: string) =>
      `${intro} votre carte de fidélité ${tenant} : ${url}\nPrésentez son QR code à chaque passage. ${rule}.`,
    recover: (first: string | null, program: string, url: string) =>
      `${first ? `Bonjour ${first},\n\n` : ""}Voici le lien de votre carte ${program} :\n${url}\n\nAjoutez-la à l'écran d'accueil de votre téléphone ou téléchargez-la en image pour la présenter à chaque passage.`,
  },
  en: {
    aReward: "a reward",
    points: { one: "# point", other: "# points" },
    stamps: { one: "# stamp", other: "# stamps" },
    gift: "Gift",
    percentOff: (n: string) => `${n}% off`,
    amountOff: (n: string, c: string) => `${n} ${c} off`,
    shareIntro: (first: string | null) => (first ? `Hello ${first}, here is` : "Here is"),
    share: (intro: string, tenant: string, url: string, rule: string) =>
      `${intro} your ${tenant} loyalty card: ${url}\nShow its QR code on every visit. ${rule}.`,
    recover: (first: string | null, program: string, url: string) =>
      `${first ? `Hello ${first},\n\n` : ""}Here is the link to your ${program} card:\n${url}\n\nAdd it to your phone's home screen or download it as an image to show it on every visit.`,
  },
  ar: {
    aReward: "مكافأة",
    points: { zero: "# نقطة", one: "نقطة واحدة", two: "نقطتان", few: "# نقاط", many: "# نقطة", other: "# نقطة" },
    stamps: { zero: "# طابع", one: "طابع واحد", two: "طابعان", few: "# طوابع", many: "# طابعًا", other: "# طابع" },
    gift: "هدية",
    percentOff: (n: string) => `خصم ${n}٪`,
    amountOff: (n: string, c: string) => `خصم ${n} ${c}`,
    shareIntro: (first: string | null) => (first ? `مرحبًا ${first}، إليك` : "إليك"),
    share: (intro: string, tenant: string, url: string, rule: string) =>
      `${intro} بطاقة الولاء الخاصة بك لدى ${tenant}: ${url}\nاعرض رمز QR في كل زيارة. ${rule}.`,
    recover: (first: string | null, program: string, url: string) =>
      `${first ? `مرحبًا ${first}،\n\n` : ""}إليك رابط بطاقتك ${program}:\n${url}\n\nأضفها إلى الشاشة الرئيسية لهاتفك أو نزّلها كصورة لتعرضها في كل زيارة.`,
  },
  es: {
    aReward: "una recompensa",
    points: { one: "# punto", other: "# puntos" },
    stamps: { one: "# sello", other: "# sellos" },
    gift: "Regalo",
    percentOff: (n: string) => `${n} % de descuento`,
    amountOff: (n: string, c: string) => `${n} ${c} de descuento`,
    shareIntro: (first: string | null) => (first ? `Hola ${first}, aquí tienes` : "Aquí tienes"),
    share: (intro: string, tenant: string, url: string, rule: string) =>
      `${intro} tu tarjeta de fidelidad ${tenant}: ${url}\nMuestra su código QR en cada visita. ${rule}.`,
    recover: (first: string | null, program: string, url: string) =>
      `${first ? `Hola ${first}:\n\n` : ""}Este es el enlace de tu tarjeta ${program}:\n${url}\n\nAñádela a la pantalla de inicio de tu teléfono o descárgala como imagen para mostrarla en cada visita.`,
  },
} satisfies Record<Locale, unknown>;

const number = (locale: Locale, value: number, digits = 0) =>
  new Intl.NumberFormat(INTL_LOCALE[locale], { maximumFractionDigits: digits }).format(value);

/** Règle courte : « 10 tampons = Café offert » ou « 1 000 CDF = 1 point ». */
export function programRule(locale: Locale, program: RuleProgram, rewardName?: string): string {
  const t = T[locale];
  if (program.mode === "STAMPS") return `${plural(locale, program.stampsTarget, t.stamps)} = ${rewardName ?? t.aReward}`;
  const step = number(locale, Number(program.spendStep.toString()));
  return `${step} ${program.currency} = ${plural(locale, program.pointsPerStep, t.points)}`;
}

/** Valeur d'une récompense : « Cadeau », « 10 % de réduction », « 500 CDF de réduction ». */
export function rewardValueText(locale: Locale, reward: { kind: string; value: string | null }, currency: string): string {
  const t = T[locale];
  if (reward.kind === "GIFT" || reward.value === null) return t.gift;
  const n = number(locale, Number(reward.value), 2);
  return reward.kind === "PERCENTAGE" ? t.percentOff(n) : t.amountOff(n, currency);
}

/** Ligne du résumé des récompenses (verso Wallet) : « Café : Cadeau — 10 tampons ». */
export function rewardSummaryLine(
  locale: Locale,
  reward: { name: string; kind: string; value: string | null; cost: number },
  currency: string,
  isStamps: boolean,
): string {
  const t = T[locale];
  const value = reward.kind === "GIFT" ? "" : `${locale === "fr" ? " : " : ": "}${rewardValueText(locale, reward, currency)}`;
  return `${reward.name}${value} — ${plural(locale, reward.cost, isStamps ? t.stamps : t.points)}`;
}

/** Message WhatsApp qui accompagne le lien de la carte. */
export function shareCardMessage(locale: Locale, p: { firstName: string | null; tenantName: string; url: string; rule: string }): string {
  const t = T[locale];
  return t.share(t.shareIntro(p.firstName), p.tenantName, p.url, p.rule);
}

/** Message « Retrouver ma carte » (email et WhatsApp). */
export function recoverCardMessage(locale: Locale, p: { firstName: string | null; programName: string; url: string }): string {
  return T[locale].recover(p.firstName, p.programName, p.url);
}
