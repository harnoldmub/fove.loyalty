/**
 * Textes et explications de la carte de fidélité dans Apple Wallet et Google Wallet.
 * Inspiré du modèle Match Kwata : quelqu'un qui ouvre le verso de sa carte
 * ou consulte les détails Google Wallet doit comprendre tout de suite son fonctionnement.
 * Langue : celle du commerce (`tenantLocale`), le français par défaut.
 */
import { DEFAULT_LOCALE, INTL_LOCALE, plural, type Locale } from "../i18n/locale";

export const MORE_INFO_LABEL = "+ D'INFOS ICI";
export const MORE_INFO_ICON = "(•••)⤴";

type Forms = { one: string; other: string; two?: string; few?: string; many?: string; zero?: string };

export interface CardTexts {
  available: string;
  pts: string;
  visits: Forms;
  stamps: Forms;
  stampsEarned: Forms;
  club: (name: string) => string;
  welcomeTitle: (club: string) => string;
  welcomeBody: (tenant: string) => string;
  howTitle: string;
  howStamps: (targetStamps: string) => string[];
  howPoints: string[];
  perksTitle: string;
  perksLive: string[];
  perksDefault: string[];
  memberTitle: (club: string) => string;
  holder: string;
  balance: string;
  visitsUnit: string;
  pointsUnit: string;
  since: (date: string) => string;
  left: (stamps: string) => string;
  rewardReady: string;
  keepEarning: string;
  member: string;
  /** Libellés courts des cartes Wallet et de la carte image. */
  labels: {
    passages: string;
    points: string;
    message: string;
    merchantMessage: string;
    cardNumber: string;
    merchantPage: string;
    memberUpper: string;
    memberSinceUpper: string;
    onlineCard: string;
    onlineCardLive: string;
    loyaltyCard: string;
    recent: string;
    program: string;
  };
}

const TEXTS: Record<Locale, CardTexts> = {
  fr: {
    available: "Disponible",
    pts: "pts",
    visits: { one: "# passage", other: "# passages" },
    stamps: { one: "# tampon", other: "# tampons" },
    stampsEarned: { one: "# tampon obtenu", other: "# tampons obtenus" },
    club: (name) => `Club ${name}`,
    welcomeTitle: (club) => `BIENVENUE AU ${club.toUpperCase()}`,
    welcomeBody: (tenant) => `Votre carte de fidélité ${tenant} : chaque passage en boutique ou commande vous rapproche d'une récompense exclusive.`,
    howTitle: "COMMENT FONCTIONNE MA CARTE ?",
    howStamps: (target) => [
      "• À chaque passage en boutique, présentez votre carte et faites scanner le QR code.",
      "• Le passage s'ajoute automatiquement à votre carte (un par jour).",
      "• Les commandes payées en ligne sont également comptabilisées.",
      `• Dès ${target}, votre récompense est disponible en caisse !`,
      "• Une fois l'offre appliquée en boutique, votre carte revient à 0 pour entamer un nouveau cycle.",
    ],
    howPoints: [
      "• À chaque achat en boutique ou commande en ligne, présentez votre QR code.",
      "• Vos points s'accumulent automatiquement selon le montant dépensé.",
      "• Débloquez et utilisez vos récompenses en caisse quand vous le souhaitez.",
    ],
    perksTitle: "MES PRIVILÈGES",
    perksLive: [
      "• Les alertes et offres privées arrivent directement sur l'écran de votre téléphone.",
      "• Votre solde se met à jour en direct : aucun papier à garder, aucun oubli.",
    ],
    perksDefault: [
      "• Des cadeaux, réductions et privilèges réservés aux membres.",
      "• Les alertes et offres privées arrivent directement sur votre écran de téléphone.",
      "• Votre solde se met à jour en direct : aucun papier à garder, aucun oubli.",
    ],
    memberTitle: (club) => `MA CARTE ${club.toUpperCase()}`,
    holder: "Titulaire",
    balance: "Solde",
    visitsUnit: "passages",
    pointsUnit: "points",
    since: (date) => `Membre depuis ${date}`,
    left: (stamps) => `Plus que ${stamps} pour obtenir votre récompense.`,
    rewardReady: "Votre récompense est disponible : demandez-la en boutique (votre carte reviendra ensuite à 0).",
    keepEarning: "Cumulez des points pour débloquer vos prochaines récompenses.",
    member: "Membre",
    labels: {
      passages: "Passages",
      points: "Points",
      message: "MESSAGE",
      merchantMessage: "Message du commerce",
      cardNumber: "Numéro de carte",
      merchantPage: "Page du commerce",
      memberUpper: "MEMBRE",
      memberSinceUpper: "MEMBRE DEPUIS",
      onlineCard: "Ma carte en ligne",
      onlineCardLive: "Ma carte en ligne · solde à jour",
      loyaltyCard: "CARTE FIDÉLITÉ",
      recent: "RÉCENT",
      program: "PROGRAMME",
    },
  },
  en: {
    available: "Available",
    pts: "pts",
    visits: { one: "# visit", other: "# visits" },
    stamps: { one: "# stamp", other: "# stamps" },
    stampsEarned: { one: "# stamp", other: "# stamps" },
    club: (name) => `${name} Club`,
    welcomeTitle: (club) => `WELCOME TO ${club.toUpperCase()}`,
    welcomeBody: (tenant) => `Your ${tenant} loyalty card: every visit or order brings you closer to an exclusive reward.`,
    howTitle: "HOW DOES MY CARD WORK?",
    howStamps: (target) => [
      "• On every visit, show your card and have the QR code scanned.",
      "• The visit is added to your card automatically (one per day).",
      "• Orders paid online count too.",
      `• Once you reach ${target}, your reward is ready at the till!`,
      "• Once the reward is used in store, your card goes back to 0 for a new cycle.",
    ],
    howPoints: [
      "• Show your QR code with every purchase in store or online order.",
      "• Your points add up automatically based on what you spend.",
      "• Unlock and use your rewards at the till whenever you like.",
    ],
    perksTitle: "MY PERKS",
    perksLive: [
      "• Alerts and private offers arrive straight on your phone screen.",
      "• Your balance updates live: no paper to keep, nothing to forget.",
    ],
    perksDefault: [
      "• Gifts, discounts and perks reserved for members.",
      "• Alerts and private offers arrive straight on your phone screen.",
      "• Your balance updates live: no paper to keep, nothing to forget.",
    ],
    memberTitle: (club) => `MY ${club.toUpperCase()} CARD`,
    holder: "Holder",
    balance: "Balance",
    visitsUnit: "visits",
    pointsUnit: "points",
    since: (date) => `Member since ${date}`,
    left: (stamps) => `Only ${stamps} to go before your reward.`,
    rewardReady: "Your reward is ready: ask for it in store (your card then goes back to 0).",
    keepEarning: "Collect points to unlock your next rewards.",
    member: "Member",
    labels: {
      passages: "Visits",
      points: "Points",
      message: "MESSAGE",
      merchantMessage: "Message from the shop",
      cardNumber: "Card number",
      merchantPage: "Shop page",
      memberUpper: "MEMBER",
      memberSinceUpper: "MEMBER SINCE",
      onlineCard: "My card online",
      onlineCardLive: "My card online · live balance",
      loyaltyCard: "LOYALTY CARD",
      recent: "NEW",
      program: "PROGRAMME",
    },
  },
  ar: {
    available: "متاحة",
    pts: "نقطة",
    visits: { zero: "# زيارة", one: "زيارة واحدة", two: "زيارتان", few: "# زيارات", many: "# زيارة", other: "# زيارة" },
    stamps: { zero: "# طابع", one: "طابع واحد", two: "طابعان", few: "# طوابع", many: "# طابعًا", other: "# طابع" },
    stampsEarned: { zero: "# طابع", one: "طابع واحد", two: "طابعين", few: "# طوابع", many: "# طابعًا", other: "# طابع" },
    club: (name) => `نادي ${name}`,
    welcomeTitle: (club) => `مرحبًا بك في ${club}`,
    welcomeBody: (tenant) => `بطاقة الولاء الخاصة بك لدى ${tenant}: كل زيارة أو طلب يقرّبك من مكافأة حصرية.`,
    howTitle: "كيف تعمل بطاقتي؟",
    howStamps: (target) => [
      "• في كل زيارة للمتجر، اعرض بطاقتك وامسح رمز QR.",
      "• تُضاف الزيارة تلقائيًا إلى بطاقتك (زيارة واحدة في اليوم).",
      "• تُحتسب أيضًا الطلبات المدفوعة عبر الإنترنت.",
      `• عند جمع ${target}، تصبح مكافأتك متاحة عند الصندوق!`,
      "• بعد استخدام العرض في المتجر، تعود بطاقتك إلى 0 لتبدأ دورة جديدة.",
    ],
    howPoints: [
      "• اعرض رمز QR مع كل عملية شراء في المتجر أو طلب عبر الإنترنت.",
      "• تتراكم نقاطك تلقائيًا حسب المبلغ الذي تنفقه.",
      "• افتح مكافآتك واستخدمها عند الصندوق متى شئت.",
    ],
    perksTitle: "امتيازاتي",
    perksLive: [
      "• تصلك التنبيهات والعروض الخاصة مباشرة على شاشة هاتفك.",
      "• يُحدَّث رصيدك مباشرة: لا أوراق تحتفظ بها ولا شيء تنساه.",
    ],
    perksDefault: [
      "• هدايا وتخفيضات وامتيازات مخصّصة للأعضاء.",
      "• تصلك التنبيهات والعروض الخاصة مباشرة على شاشة هاتفك.",
      "• يُحدَّث رصيدك مباشرة: لا أوراق تحتفظ بها ولا شيء تنساه.",
    ],
    memberTitle: (club) => `بطاقتي في ${club}`,
    holder: "حامل البطاقة",
    balance: "الرصيد",
    visitsUnit: "زيارة",
    pointsUnit: "نقطة",
    since: (date) => `عضو منذ ${date}`,
    left: (stamps) => `بقي ${stamps} فقط للحصول على مكافأتك.`,
    rewardReady: "مكافأتك متاحة: اطلبها في المتجر (ستعود بطاقتك بعدها إلى 0).",
    keepEarning: "اجمع النقاط لفتح مكافآتك القادمة.",
    member: "عضو",
    labels: {
      passages: "الزيارات",
      points: "النقاط",
      message: "رسالة",
      merchantMessage: "رسالة من المتجر",
      cardNumber: "رقم البطاقة",
      merchantPage: "صفحة المتجر",
      memberUpper: "العضو",
      memberSinceUpper: "عضو منذ",
      onlineCard: "بطاقتي على الإنترنت",
      onlineCardLive: "بطاقتي على الإنترنت · رصيد محدَّث",
      loyaltyCard: "بطاقة الولاء",
      recent: "جديد",
      program: "البرنامج",
    },
  },
  es: {
    available: "Disponible",
    pts: "pts",
    visits: { one: "# visita", other: "# visitas" },
    stamps: { one: "# sello", other: "# sellos" },
    stampsEarned: { one: "# sello", other: "# sellos" },
    club: (name) => `Club ${name}`,
    welcomeTitle: (club) => `BIENVENIDO AL ${club.toUpperCase()}`,
    welcomeBody: (tenant) => `Tu tarjeta de fidelidad ${tenant}: cada visita o pedido te acerca a una recompensa exclusiva.`,
    howTitle: "¿CÓMO FUNCIONA MI TARJETA?",
    howStamps: (target) => [
      "• En cada visita a la tienda, muestra tu tarjeta y escanea el código QR.",
      "• La visita se suma automáticamente a tu tarjeta (una al día).",
      "• Los pedidos pagados en línea también cuentan.",
      `• Al llegar a ${target}, ¡tu recompensa te espera en caja!`,
      "• Una vez aplicada la oferta en tienda, tu tarjeta vuelve a 0 para empezar un nuevo ciclo.",
    ],
    howPoints: [
      "• Muestra tu código QR en cada compra en tienda o pedido en línea.",
      "• Tus puntos se acumulan automáticamente según lo que gastas.",
      "• Desbloquea y usa tus recompensas en caja cuando quieras.",
    ],
    perksTitle: "MIS VENTAJAS",
    perksLive: [
      "• Las alertas y ofertas privadas llegan directamente a la pantalla de tu teléfono.",
      "• Tu saldo se actualiza al instante: sin papeles que guardar ni olvidos.",
    ],
    perksDefault: [
      "• Regalos, descuentos y ventajas reservados a los miembros.",
      "• Las alertas y ofertas privadas llegan directamente a la pantalla de tu teléfono.",
      "• Tu saldo se actualiza al instante: sin papeles que guardar ni olvidos.",
    ],
    memberTitle: (club) => `MI TARJETA ${club.toUpperCase()}`,
    holder: "Titular",
    balance: "Saldo",
    visitsUnit: "visitas",
    pointsUnit: "puntos",
    since: (date) => `Miembro desde ${date}`,
    left: (stamps) => `Solo te faltan ${stamps} para conseguir tu recompensa.`,
    rewardReady: "Tu recompensa está disponible: pídela en la tienda (después tu tarjeta volverá a 0).",
    keepEarning: "Acumula puntos para desbloquear tus próximas recompensas.",
    member: "Miembro",
    labels: {
      passages: "Visitas",
      points: "Puntos",
      message: "MENSAJE",
      merchantMessage: "Mensaje de la tienda",
      cardNumber: "Número de tarjeta",
      merchantPage: "Página de la tienda",
      memberUpper: "MIEMBRO",
      memberSinceUpper: "MIEMBRO DESDE",
      onlineCard: "Mi tarjeta en línea",
      onlineCardLive: "Mi tarjeta en línea · saldo al día",
      loyaltyCard: "TARJETA DE FIDELIDAD",
      recent: "NUEVO",
      program: "PROGRAMA",
    },
  },
};

export const cardTexts = (locale: Locale = DEFAULT_LOCALE): CardTexts => TEXTS[locale] ?? TEXTS.fr;
export const cardLabels = (locale: Locale = DEFAULT_LOCALE) => cardTexts(locale).labels;

/** Nom du club : le nom du commerce s'il contient déjà « club ». */
export const clubName = (tenantName: string, locale: Locale = DEFAULT_LOCALE) =>
  /club|نادي/i.test(tenantName) ? tenantName : cardTexts(locale).club(tenantName);

/** « oct. 2026 » : mois et année d'inscription, dans la langue du commerce. */
export const memberSince = (date: Date, locale: Locale = DEFAULT_LOCALE) =>
  date.toLocaleDateString(INTL_LOCALE[locale], { month: "short", year: "numeric" });

/** Calcule les passages/tampons restants sans descendre sous zéro. */
export const visitsLeft = (balance: number, target: number) => Math.max(0, target - Math.max(0, balance));

/** Texte du prochain avantage (« 7 passages », « 1 passage », ou « Disponible »). */
export function nextRewardValue(balance: number, target: number, isStamps = true, locale: Locale = DEFAULT_LOCALE): string {
  const t = cardTexts(locale);
  if (!isStamps) return `${Math.max(0, balance)} ${t.pts}`;
  const left = visitsLeft(balance, target);
  return left > 0 ? plural(locale, left, t.visits) : t.available;
}

export interface CardSection {
  key: string;
  title: string;
  body: string;
}

/** Rubriques d'explications générales de la carte pour le commerce. */
export function getClubExplanations(
  tenantName: string,
  isStamps: boolean,
  target: number,
  rewardSummary?: string,
  locale: Locale = DEFAULT_LOCALE,
): CardSection[] {
  const t = cardTexts(locale);
  const club = clubName(tenantName, locale);
  return [
    { key: "welcome", title: t.welcomeTitle(club), body: t.welcomeBody(tenantName) },
    {
      key: "how",
      title: t.howTitle,
      body: (isStamps ? t.howStamps(plural(locale, target, t.stampsEarned)) : t.howPoints).join("\n"),
    },
    {
      key: "perks",
      title: t.perksTitle,
      body: (rewardSummary ? [rewardSummary, ...t.perksLive] : t.perksDefault).join("\n"),
    },
  ];
}

/** Récapitulatif personnel du membre sur le verso de la carte. */
export function getClubMemberSummary(params: {
  tenantName: string;
  holder: string;
  balance: number;
  isStamps: boolean;
  target: number;
  since: string;
  locale?: Locale;
}): CardSection {
  const locale = params.locale ?? DEFAULT_LOCALE;
  const t = cardTexts(locale);
  const left = visitsLeft(params.balance, params.target);
  const sep = locale === "fr" ? " : " : ": ";
  const displayBalance = params.isStamps ? Math.min(params.target, Math.max(0, params.balance)) : Math.max(0, params.balance);

  return {
    key: "member",
    title: t.memberTitle(clubName(params.tenantName, locale)),
    body: [
      `• ${t.holder}${sep}${params.holder}`,
      `• ${t.balance}${sep}${displayBalance}${params.isStamps ? `/${params.target} ${t.visitsUnit}` : ` ${t.pointsUnit}`}`,
      `• ${t.since(params.since)}`,
      `• ${params.isStamps ? (left > 0 ? t.left(plural(locale, left, t.stamps)) : t.rewardReady) : t.keepEarning}`,
    ].join("\n"),
  };
}
