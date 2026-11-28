/**
 * Textes par défaut des messages automatiques (relances, anniversaire), dans la langue du commerce
 * (docs/chantier-relances-anniversaire.md). Le commerçant peut les remplacer ; les variables entre
 * accolades sont remplies à l'envoi : {prénom}, {commerce}, {solde}, {récompense}, {reste}, {cadeau}, {date}.
 */
import type { AutomationRuleKind } from "@fove/database";
import type { Locale } from "./locale";

export interface MessageText {
  title: string;
  body: string;
}

type Texts = Record<Exclude<AutomationRuleKind, "BIRTHDAY">, MessageText> & { BIRTHDAY_SOON: MessageText; BIRTHDAY_DAY: MessageText };

const TEXTS: Record<Locale, Texts> = {
  fr: {
    NEAR_REWARD: { title: "Plus qu'un passage !", body: "{prénom}, plus que {reste} pour {récompense} chez {commerce}." },
    REWARD_WAITING: { title: "Votre récompense vous attend", body: "{prénom}, {récompense} vous attend chez {commerce}. À très vite !" },
    AT_RISK: { title: "On garde votre place", body: "Vous avez {solde} chez {commerce}. Plus que {reste} pour {récompense} !" },
    DORMANT: { title: "Vous nous manquez !", body: "{prénom}, toute l'équipe de {commerce} serait ravie de vous revoir. Votre carte vous attend." },
    BIRTHDAY_SOON: { title: "Votre anniversaire approche", body: "{prénom}, {commerce} vous offre {cadeau} pour votre anniversaire, valable jusqu'au {date}." },
    BIRTHDAY_DAY: { title: "Joyeux anniversaire !", body: "Joyeux anniversaire {prénom} ! N'oubliez pas : {cadeau} vous attend chez {commerce} jusqu'au {date}." },
  },
  en: {
    NEAR_REWARD: { title: "Just one more visit!", body: "{prénom}, only {reste} to go for {récompense} at {commerce}." },
    REWARD_WAITING: { title: "Your reward is waiting", body: "{prénom}, {récompense} is waiting for you at {commerce}. See you soon!" },
    AT_RISK: { title: "We're keeping your spot", body: "You have {solde} at {commerce}. Only {reste} to go for {récompense}!" },
    DORMANT: { title: "We miss you!", body: "{prénom}, the whole {commerce} team would love to see you again. Your card is waiting." },
    BIRTHDAY_SOON: { title: "Your birthday is coming up", body: "{prénom}, {commerce} is giving you {cadeau} for your birthday, valid until {date}." },
    BIRTHDAY_DAY: { title: "Happy birthday!", body: "Happy birthday {prénom}! Don't forget: {cadeau} is waiting for you at {commerce} until {date}." },
  },
  ar: {
    NEAR_REWARD: { title: "زيارة واحدة فقط!", body: "{prénom}، تبقّى {reste} فقط للحصول على {récompense} لدى {commerce}." },
    REWARD_WAITING: { title: "مكافأتك بانتظارك", body: "{prénom}، {récompense} بانتظارك لدى {commerce}. إلى اللقاء قريبًا!" },
    AT_RISK: { title: "مكانك محفوظ", body: "لديك {solde} لدى {commerce}. تبقّى {reste} فقط للحصول على {récompense}!" },
    DORMANT: { title: "اشتقنا إليك!", body: "{prénom}، يسعد فريق {commerce} أن يراك من جديد. بطاقتك بانتظارك." },
    BIRTHDAY_SOON: { title: "عيد ميلادك يقترب", body: "{prénom}، يقدّم لك {commerce} {cadeau} بمناسبة عيد ميلادك، صالحة حتى {date}." },
    BIRTHDAY_DAY: { title: "عيد ميلاد سعيد!", body: "عيد ميلاد سعيد {prénom}! لا تنسَ: {cadeau} بانتظارك لدى {commerce} حتى {date}." },
  },
  es: {
    NEAR_REWARD: { title: "¡Solo una visita más!", body: "{prénom}, solo te falta {reste} para {récompense} en {commerce}." },
    REWARD_WAITING: { title: "Tu recompensa te espera", body: "{prénom}, {récompense} te espera en {commerce}. ¡Hasta pronto!" },
    AT_RISK: { title: "Te guardamos el sitio", body: "Tienes {solde} en {commerce}. ¡Solo te falta {reste} para {récompense}!" },
    DORMANT: { title: "¡Te echamos de menos!", body: "{prénom}, a todo el equipo de {commerce} le encantaría volver a verte. Tu tarjeta te espera." },
    BIRTHDAY_SOON: { title: "Se acerca tu cumpleaños", body: "{prénom}, {commerce} te regala {cadeau} por tu cumpleaños, válido hasta el {date}." },
    BIRTHDAY_DAY: { title: "¡Feliz cumpleaños!", body: "¡Feliz cumpleaños, {prénom}! No lo olvides: {cadeau} te espera en {commerce} hasta el {date}." },
  },
};

export function defaultAutomationText(locale: Locale, key: keyof Texts): MessageText {
  return TEXTS[locale][key];
}

/** Unité du solde : « 7 tampons », « 120 points ». */
const UNITS: Record<Locale, { stamp: [string, string]; point: [string, string] }> = {
  fr: { stamp: ["tampon", "tampons"], point: ["point", "points"] },
  en: { stamp: ["stamp", "stamps"], point: ["point", "points"] },
  ar: { stamp: ["طابع", "طوابع"], point: ["نقطة", "نقاط"] },
  es: { stamp: ["sello", "sellos"], point: ["punto", "puntos"] },
};

export function formatUnits(locale: Locale, count: number, mode: "STAMPS" | "POINTS"): string {
  const [one, many] = UNITS[locale][mode === "STAMPS" ? "stamp" : "point"];
  return `${count} ${count === 1 ? one : many}`;
}

/** Remplit les variables ({prénom} ou {prenom}…) ; une variable inconnue reste telle quelle. */
export function fillTemplate(template: string, values: Record<string, string>): string {
  const normalized: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) normalized[k.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()] = v;
  return template.replace(/\{([^{}]{1,20})\}/g, (match, name: string) => normalized[name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()] ?? match);
}
