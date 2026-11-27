/**
 * Emails de suivi envoyés aux clients de FOVE (commerçants, partenaires), en 4 langues, au
 * gabarit de la marque : vie de l'abonnement, échéances, parrainage, partenaires, bienvenue.
 * Les notifications internes à l'équipe FOVE ont leur propre gabarit (email-layout.ts, teamHtml).
 */
import type { EmailMessage } from "../notifications/email.service";
import type { Locale } from "./locale";
import { emailHtml } from "./email-layout";

type Content = Omit<EmailMessage, "to">;

/** Contenu d'un email : objet, paragraphes, libellé du bouton. */
interface Draft {
  subject: string;
  paragraphs: string[];
  button: string;
}

type Footer = "billing" | "partner" | "referral" | "welcome";

const FOOTERS: Record<Locale, Record<Footer, string>> = {
  fr: {
    billing: "Vous recevez cet email au sujet de votre abonnement FOVE.",
    partner: "Vous recevez cet email en tant que partenaire FOVE.",
    referral: "Vous recevez cet email au sujet du parrainage FOVE.",
    welcome: "Vous recevez cet email car vous venez de créer votre commerce sur FOVE.",
  },
  en: {
    billing: "You are receiving this email about your FOVE subscription.",
    partner: "You are receiving this email as a FOVE partner.",
    referral: "You are receiving this email about the FOVE referral programme.",
    welcome: "You are receiving this email because you just created your business on FOVE.",
  },
  ar: {
    billing: "تتلقى هذا البريد بخصوص اشتراكك في FOVE.",
    partner: "تتلقى هذا البريد بصفتك شريكًا لـ FOVE.",
    referral: "تتلقى هذا البريد بخصوص برنامج الإحالة في FOVE.",
    welcome: "تتلقى هذا البريد لأنك أنشأت نشاطك التجاري على FOVE.",
  },
  es: {
    billing: "Recibes este correo en relación con tu suscripción a FOVE.",
    partner: "Recibes este correo como socio de FOVE.",
    referral: "Recibes este correo en relación con el programa de recomendación de FOVE.",
    welcome: "Recibes este correo porque acabas de crear tu negocio en FOVE.",
  },
};

function build(locale: Locale, footer: Footer, draft: Draft, url: string): Content {
  const footerText = FOOTERS[locale][footer];
  return {
    locale,
    subject: draft.subject,
    text: `${draft.paragraphs.join("\n\n")}\n\n${draft.button} : ${url}`,
    html: emailHtml(locale, { title: draft.subject, heading: draft.subject, paragraphs: draft.paragraphs, button: { label: draft.button, url }, footer: footerText }),
  };
}

// --- Abonnement -------------------------------------------------------------------------------

const BILLING = {
  fr: {
    activated: (p: { plan: string; until: string }): Draft => ({
      subject: `Votre abonnement ${p.plan} est actif`,
      paragraphs: ["Bonjour,", `Merci ! Votre abonnement ${p.plan} est actif. Il se renouvelle le ${p.until}.`, "Toutes les fonctions de votre offre sont disponibles dès maintenant. Vos factures sont dans la page Abonnement."],
      button: "Voir mon abonnement",
    }),
    upgraded: (p: { from: string; to: string }): Draft => ({
      subject: `Vous êtes passé à l'offre ${p.to}`,
      paragraphs: ["Bonjour,", `Votre abonnement passe de ${p.from} à ${p.to}, dès maintenant. La différence, calculée au prorata de la période restante, est facturée aujourd'hui.`],
      button: "Voir mon abonnement",
    }),
    downgradeScheduled: (p: { from: string; to: string; date: string }): Draft => ({
      subject: `Passage à l'offre ${p.to} le ${p.date}`,
      paragraphs: ["Bonjour,", `Votre demande est enregistrée : vous gardez l'offre ${p.from} jusqu'au ${p.date}, puis vous passerez à l'offre ${p.to}.`, "Vous pouvez annuler ce changement à tout moment d'ici là, depuis la page Abonnement."],
      button: "Voir mon abonnement",
    }),
    cancelRequested: (p: { plan: string; date: string }): Draft => ({
      subject: `Résiliation enregistrée : ${p.plan} jusqu'au ${p.date}`,
      paragraphs: ["Bonjour,", `Votre résiliation est enregistrée. Vous gardez l'offre ${p.plan} jusqu'au ${p.date}. Votre commerce passera ensuite à l'offre Gratuite : vos clients, cartes et historiques sont conservés.`, "Vous avez changé d'avis ? Reprenez votre abonnement d'un clic avant cette date."],
      button: "Voir mon abonnement",
    }),
    paymentFailed: (p: { plan: string; date: string }): Draft => ({
      subject: "Paiement refusé : mettez à jour votre carte",
      paragraphs: ["Bonjour,", `Le paiement de votre abonnement ${p.plan} a été refusé par votre banque.`, `Votre offre reste active jusqu'au ${p.date}. Sans paiement d'ici là, votre commerce passera à l'offre Gratuite (rien n'est supprimé). Mettez à jour votre moyen de paiement depuis la page Abonnement.`],
      button: "Mettre à jour ma carte",
    }),
    ended: (p: { plan: string; unpaid: boolean }): Draft => ({
      subject: `Votre offre ${p.plan} est terminée`,
      paragraphs: [
        "Bonjour,",
        p.unpaid
          ? `Faute de paiement, votre offre ${p.plan} a pris fin. Votre commerce est passé à l'offre Gratuite.`
          : `Votre offre ${p.plan} est arrivée à échéance. Votre commerce est passé à l'offre Gratuite.`,
        "Vos clients, cartes et historiques sont conservés. Les fonctions de l'offre payante sont suspendues, et les nouvelles inscriptions sont limitées à celles de l'offre Gratuite. Vous pouvez reprendre un abonnement à tout moment.",
      ],
      button: "Reprendre un abonnement",
    }),
    renewal: (p: { plan: string; date: string; days: number }): Draft => ({
      subject: `Votre abonnement ${p.plan} se termine le ${p.date}`,
      paragraphs: [
        "Bonjour,",
        `Votre abonnement ${p.plan} se termine dans ${p.days} jours, le ${p.date}. Il ne se renouvelle pas tout seul.`,
        "Pour continuer sans interruption, réglez l'année suivante depuis la page Abonnement : par virement avec votre référence de paiement, ou par carte. Sans renouvellement, votre commerce passera à l'offre Gratuite (rien n'est supprimé).",
      ],
      button: "Renouveler mon abonnement",
    }),
    provisional: (p: { plan: string; date: string; reference: string }): Draft => ({
      subject: `Votre accès provisoire se termine le ${p.date}`,
      paragraphs: [
        "Bonjour,",
        `Nous n'avons pas encore reçu votre paiement pour l'offre ${p.plan}. Votre accès provisoire se termine le ${p.date}.`,
        "Pensez à indiquer cette référence dans le motif du virement :",
        p.reference,
        "Vous avez déjà payé ? Rien à faire : votre paiement sera rapproché à réception. Vous pouvez aussi régler par carte depuis la page Abonnement.",
      ],
      button: "Voir mon abonnement",
    }),
  },
  en: {
    activated: (p: { plan: string; until: string }): Draft => ({
      subject: `Your ${p.plan} subscription is active`,
      paragraphs: ["Hello,", `Thank you! Your ${p.plan} subscription is active. It renews on ${p.until}.`, "Every feature of your plan is available now. Your invoices are on the Subscription page."],
      button: "View my subscription",
    }),
    upgraded: (p: { from: string; to: string }): Draft => ({
      subject: `You moved to the ${p.to} plan`,
      paragraphs: ["Hello,", `Your subscription moves from ${p.from} to ${p.to}, starting now. The difference, prorated over the remaining period, is invoiced today.`],
      button: "View my subscription",
    }),
    downgradeScheduled: (p: { from: string; to: string; date: string }): Draft => ({
      subject: `Moving to the ${p.to} plan on ${p.date}`,
      paragraphs: ["Hello,", `Your request is recorded: you keep the ${p.from} plan until ${p.date}, then you will move to the ${p.to} plan.`, "You can cancel this change at any time before then, from the Subscription page."],
      button: "View my subscription",
    }),
    cancelRequested: (p: { plan: string; date: string }): Draft => ({
      subject: `Cancellation recorded: ${p.plan} until ${p.date}`,
      paragraphs: ["Hello,", `Your cancellation is recorded. You keep the ${p.plan} plan until ${p.date}. Your business will then move to the Free plan: your customers, cards and history are kept.`, "Changed your mind? Resume your subscription in one click before that date."],
      button: "View my subscription",
    }),
    paymentFailed: (p: { plan: string; date: string }): Draft => ({
      subject: "Payment declined: update your card",
      paragraphs: ["Hello,", `The payment for your ${p.plan} subscription was declined by your bank.`, `Your plan stays active until ${p.date}. Without payment by then, your business will move to the Free plan (nothing is deleted). Update your payment method from the Subscription page.`],
      button: "Update my card",
    }),
    ended: (p: { plan: string; unpaid: boolean }): Draft => ({
      subject: `Your ${p.plan} plan has ended`,
      paragraphs: [
        "Hello,",
        p.unpaid ? `As no payment was received, your ${p.plan} plan has ended. Your business has moved to the Free plan.` : `Your ${p.plan} plan has reached its end date. Your business has moved to the Free plan.`,
        "Your customers, cards and history are kept. Paid features are paused, and new sign-ups are limited to those of the Free plan. You can subscribe again at any time.",
      ],
      button: "Subscribe again",
    }),
    renewal: (p: { plan: string; date: string; days: number }): Draft => ({
      subject: `Your ${p.plan} subscription ends on ${p.date}`,
      paragraphs: [
        "Hello,",
        `Your ${p.plan} subscription ends in ${p.days} days, on ${p.date}. It does not renew automatically.`,
        "To continue without interruption, pay for the next year from the Subscription page: by bank transfer with your payment reference, or by card. Without renewal, your business will move to the Free plan (nothing is deleted).",
      ],
      button: "Renew my subscription",
    }),
    provisional: (p: { plan: string; date: string; reference: string }): Draft => ({
      subject: `Your temporary access ends on ${p.date}`,
      paragraphs: [
        "Hello,",
        `We have not received your payment for the ${p.plan} plan yet. Your temporary access ends on ${p.date}.`,
        "Remember to include this reference in the transfer description:",
        p.reference,
        "Already paid? Nothing to do: your payment will be matched when it arrives. You can also pay by card from the Subscription page.",
      ],
      button: "View my subscription",
    }),
  },
  ar: {
    activated: (p: { plan: string; until: string }): Draft => ({
      subject: `اشتراكك ${p.plan} مفعّل`,
      paragraphs: ["مرحبًا،", `شكرًا لك! اشتراكك ${p.plan} مفعّل، ويتجدد في ${p.until}.`, "جميع ميزات باقتك متاحة الآن. تجد فواتيرك في صفحة الاشتراك."],
      button: "عرض اشتراكي",
    }),
    upgraded: (p: { from: string; to: string }): Draft => ({
      subject: `انتقلت إلى باقة ${p.to}`,
      paragraphs: ["مرحبًا،", `ينتقل اشتراكك من ${p.from} إلى ${p.to} ابتداءً من الآن. يُفوتَر الفرق، محسوبًا بالتناسب مع المدة المتبقية، اليوم.`],
      button: "عرض اشتراكي",
    }),
    downgradeScheduled: (p: { from: string; to: string; date: string }): Draft => ({
      subject: `الانتقال إلى باقة ${p.to} في ${p.date}`,
      paragraphs: ["مرحبًا،", `تم تسجيل طلبك: تحتفظ بباقة ${p.from} حتى ${p.date}، ثم تنتقل إلى باقة ${p.to}.`, "يمكنك إلغاء هذا التغيير في أي وقت قبل ذلك من صفحة الاشتراك."],
      button: "عرض اشتراكي",
    }),
    cancelRequested: (p: { plan: string; date: string }): Draft => ({
      subject: `تم تسجيل الإلغاء: ${p.plan} حتى ${p.date}`,
      paragraphs: ["مرحبًا،", `تم تسجيل إلغائك. تحتفظ بباقة ${p.plan} حتى ${p.date}، ثم ينتقل نشاطك إلى الباقة المجانية مع الاحتفاظ بعملائك وبطاقاتك وسجلّاتك.`, "غيّرت رأيك؟ استأنف اشتراكك بنقرة واحدة قبل هذا التاريخ."],
      button: "عرض اشتراكي",
    }),
    paymentFailed: (p: { plan: string; date: string }): Draft => ({
      subject: "رُفض الدفع: حدّث بطاقتك",
      paragraphs: ["مرحبًا،", `رفض بنكك دفع اشتراكك ${p.plan}.`, `تبقى باقتك مفعّلة حتى ${p.date}. إن لم يتم الدفع قبل ذلك، سينتقل نشاطك إلى الباقة المجانية (لا يُحذف شيء). حدّث وسيلة الدفع من صفحة الاشتراك.`],
      button: "تحديث بطاقتي",
    }),
    ended: (p: { plan: string; unpaid: boolean }): Draft => ({
      subject: `انتهت باقتك ${p.plan}`,
      paragraphs: [
        "مرحبًا،",
        p.unpaid ? `لعدم استلام الدفع، انتهت باقتك ${p.plan} وانتقل نشاطك إلى الباقة المجانية.` : `بلغت باقتك ${p.plan} تاريخ انتهائها وانتقل نشاطك إلى الباقة المجانية.`,
        "عملاؤك وبطاقاتك وسجلّاتك محفوظة. الميزات المدفوعة معلّقة، والتسجيلات الجديدة محدودة بحدود الباقة المجانية. يمكنك الاشتراك من جديد في أي وقت.",
      ],
      button: "الاشتراك من جديد",
    }),
    renewal: (p: { plan: string; date: string; days: number }): Draft => ({
      subject: `ينتهي اشتراكك ${p.plan} في ${p.date}`,
      paragraphs: [
        "مرحبًا،",
        `ينتهي اشتراكك ${p.plan} بعد ${p.days} يومًا، في ${p.date}، ولا يتجدد تلقائيًا.`,
        "للاستمرار دون انقطاع، ادفع السنة التالية من صفحة الاشتراك: بتحويل بنكي مع مرجع الدفع الخاص بك، أو بالبطاقة. دون تجديد، سينتقل نشاطك إلى الباقة المجانية (لا يُحذف شيء).",
      ],
      button: "تجديد اشتراكي",
    }),
    provisional: (p: { plan: string; date: string; reference: string }): Draft => ({
      subject: `ينتهي وصولك المؤقت في ${p.date}`,
      paragraphs: [
        "مرحبًا،",
        `لم نستلم بعد دفعتك لباقة ${p.plan}. ينتهي وصولك المؤقت في ${p.date}.`,
        "لا تنس ذكر هذا المرجع في بيان التحويل:",
        p.reference,
        "هل دفعت بالفعل؟ لا شيء عليك: ستتم مطابقة دفعتك عند وصولها. يمكنك أيضًا الدفع بالبطاقة من صفحة الاشتراك.",
      ],
      button: "عرض اشتراكي",
    }),
  },
  es: {
    activated: (p: { plan: string; until: string }): Draft => ({
      subject: `Tu suscripción ${p.plan} está activa`,
      paragraphs: ["Hola:", `¡Gracias! Tu suscripción ${p.plan} está activa. Se renueva el ${p.until}.`, "Todas las funciones de tu plan están disponibles desde ya. Tus facturas están en la página Suscripción."],
      button: "Ver mi suscripción",
    }),
    upgraded: (p: { from: string; to: string }): Draft => ({
      subject: `Has pasado al plan ${p.to}`,
      paragraphs: ["Hola:", `Tu suscripción pasa de ${p.from} a ${p.to} desde ahora. La diferencia, prorrateada sobre el periodo restante, se factura hoy.`],
      button: "Ver mi suscripción",
    }),
    downgradeScheduled: (p: { from: string; to: string; date: string }): Draft => ({
      subject: `Cambio al plan ${p.to} el ${p.date}`,
      paragraphs: ["Hola:", `Tu solicitud está registrada: mantienes el plan ${p.from} hasta el ${p.date} y luego pasarás al plan ${p.to}.`, "Puedes anular este cambio en cualquier momento antes de esa fecha, desde la página Suscripción."],
      button: "Ver mi suscripción",
    }),
    cancelRequested: (p: { plan: string; date: string }): Draft => ({
      subject: `Cancelación registrada: ${p.plan} hasta el ${p.date}`,
      paragraphs: ["Hola:", `Tu cancelación está registrada. Mantienes el plan ${p.plan} hasta el ${p.date}. Después, tu negocio pasará al plan Gratuito: tus clientes, tarjetas e historial se conservan.`, "¿Has cambiado de opinión? Reanuda tu suscripción con un clic antes de esa fecha."],
      button: "Ver mi suscripción",
    }),
    paymentFailed: (p: { plan: string; date: string }): Draft => ({
      subject: "Pago rechazado: actualiza tu tarjeta",
      paragraphs: ["Hola:", `Tu banco ha rechazado el pago de tu suscripción ${p.plan}.`, `Tu plan sigue activo hasta el ${p.date}. Sin pago antes de esa fecha, tu negocio pasará al plan Gratuito (no se borra nada). Actualiza tu medio de pago desde la página Suscripción.`],
      button: "Actualizar mi tarjeta",
    }),
    ended: (p: { plan: string; unpaid: boolean }): Draft => ({
      subject: `Tu plan ${p.plan} ha terminado`,
      paragraphs: [
        "Hola:",
        p.unpaid ? `Al no recibir el pago, tu plan ${p.plan} ha terminado. Tu negocio ha pasado al plan Gratuito.` : `Tu plan ${p.plan} ha llegado a su vencimiento. Tu negocio ha pasado al plan Gratuito.`,
        "Tus clientes, tarjetas e historial se conservan. Las funciones de pago quedan en pausa y las nuevas altas se limitan a las del plan Gratuito. Puedes volver a suscribirte en cualquier momento.",
      ],
      button: "Volver a suscribirme",
    }),
    renewal: (p: { plan: string; date: string; days: number }): Draft => ({
      subject: `Tu suscripción ${p.plan} termina el ${p.date}`,
      paragraphs: [
        "Hola:",
        `Tu suscripción ${p.plan} termina dentro de ${p.days} días, el ${p.date}. No se renueva sola.`,
        "Para continuar sin interrupción, paga el año siguiente desde la página Suscripción: por transferencia con tu referencia de pago, o con tarjeta. Sin renovación, tu negocio pasará al plan Gratuito (no se borra nada).",
      ],
      button: "Renovar mi suscripción",
    }),
    provisional: (p: { plan: string; date: string; reference: string }): Draft => ({
      subject: `Tu acceso provisional termina el ${p.date}`,
      paragraphs: [
        "Hola:",
        `Todavía no hemos recibido tu pago del plan ${p.plan}. Tu acceso provisional termina el ${p.date}.`,
        "Recuerda indicar esta referencia en el concepto de la transferencia:",
        p.reference,
        "¿Ya has pagado? No tienes que hacer nada: tu pago se conciliará al recibirlo. También puedes pagar con tarjeta desde la página Suscripción.",
      ],
      button: "Ver mi suscripción",
    }),
  },
} satisfies Record<Locale, unknown>;

type BillingKey = "activated" | "upgraded" | "downgradeScheduled" | "cancelRequested" | "paymentFailed" | "ended" | "renewal" | "provisional";
type BillingParams<K extends BillingKey> = Parameters<(typeof BILLING)["fr"][K]>[0];

/** Email d'abonnement au commerçant ; `url` : page Abonnement. */
export function billingMessage<K extends BillingKey>(locale: Locale, key: K, params: BillingParams<K>, url: string): Content {
  const draft = (BILLING[locale][key] as (p: BillingParams<K>) => Draft)(params);
  return build(locale, "billing", draft, url);
}

// --- Partenaires --------------------------------------------------------------------------------

const PARTNER = {
  fr: {
    leadRegistered: (p: { name: string; business: string }): Draft => ({
      subject: `${p.business} s'est inscrit avec votre lien`,
      paragraphs: [`Bonjour ${p.name},`, `${p.business} vient de créer son commerce sur FOVE avec votre lien. Il est maintenant rattaché à vous.`, "Accompagnez-le jusqu'au paiement de son abonnement (carte ou virement avec sa référence) : votre commission naît dès que FOVE reçoit le paiement."],
      button: "Voir mes clients",
    }),
    commissionCancelled: (p: { name: string; amount: string }): Draft => ({
      subject: `Commission annulée · ${p.amount}`,
      paragraphs: [`Bonjour ${p.name},`, `Le paiement à l'origine d'une commission de ${p.amount} a été remboursé pendant le délai de garantie. Cette commission est donc annulée.`, "Le détail de vos commissions est dans votre espace partenaire."],
      button: "Voir mes commissions",
    }),
    payoutRejected: (p: { name: string; amount: string; reason: string }): Draft => ({
      subject: `Versement non effectué · ${p.amount}`,
      paragraphs: [`Bonjour ${p.name},`, `Votre versement de ${p.amount} n'a pas pu être effectué.`, `Motif : ${p.reason}`, "Vérifiez vos coordonnées bancaires dans votre espace partenaire. Les commissions concernées restent acquises et seront reprises dans le versement du mois prochain."],
      button: "Vérifier mes coordonnées",
    }),
    payoutInfoMissing: (p: { name: string; amount: string }): Draft => ({
      subject: "Ajoutez vos coordonnées bancaires pour recevoir vos commissions",
      paragraphs: [`Bonjour ${p.name},`, `Vous avez ${p.amount} de commissions prêtes à être versées, mais nous n'avons pas encore vos coordonnées bancaires.`, "Renseignez-les dans votre espace partenaire : le versement partira au prochain cycle mensuel (le 1er du mois, payé avant le 10)."],
      button: "Ajouter mes coordonnées",
    }),
  },
  en: {
    leadRegistered: (p: { name: string; business: string }): Draft => ({
      subject: `${p.business} signed up with your link`,
      paragraphs: [`Hello ${p.name},`, `${p.business} has just created their business on FOVE with your link. It is now attributed to you.`, "Help them through to paying for their subscription (by card or by transfer with their reference): your commission is created as soon as FOVE receives the payment."],
      button: "View my clients",
    }),
    commissionCancelled: (p: { name: string; amount: string }): Draft => ({
      subject: `Commission cancelled · ${p.amount}`,
      paragraphs: [`Hello ${p.name},`, `The payment behind a ${p.amount} commission was refunded during the guarantee period, so this commission is cancelled.`, "Your commission details are in your partner space."],
      button: "View my commissions",
    }),
    payoutRejected: (p: { name: string; amount: string; reason: string }): Draft => ({
      subject: `Payout not sent · ${p.amount}`,
      paragraphs: [`Hello ${p.name},`, `Your payout of ${p.amount} could not be sent.`, `Reason: ${p.reason}`, "Please check your bank details in your partner space. The commissions involved remain yours and will be included in next month's payout."],
      button: "Check my bank details",
    }),
    payoutInfoMissing: (p: { name: string; amount: string }): Draft => ({
      subject: "Add your bank details to receive your commissions",
      paragraphs: [`Hello ${p.name},`, `You have ${p.amount} in commissions ready to be paid, but we don't have your bank details yet.`, "Add them in your partner space: the payout will go out in the next monthly cycle (on the 1st, paid before the 10th)."],
      button: "Add my bank details",
    }),
  },
  ar: {
    leadRegistered: (p: { name: string; business: string }): Draft => ({
      subject: `سجّل ${p.business} عبر رابطك`,
      paragraphs: [`مرحبًا ${p.name}،`, `أنشأ ${p.business} للتو نشاطه على FOVE عبر رابطك، وأصبح منسوبًا إليك.`, "رافقه حتى دفع اشتراكه (بالبطاقة أو بتحويل مع مرجعه): تُحتسب عمولتك فور استلام FOVE للدفع."],
      button: "عرض عملائي",
    }),
    commissionCancelled: (p: { name: string; amount: string }): Draft => ({
      subject: `أُلغيت عمولة · ${p.amount}`,
      paragraphs: [`مرحبًا ${p.name}،`, `استُرد الدفع الذي نشأت عنه عمولة بقيمة ${p.amount} خلال فترة الضمان، لذلك أُلغيت هذه العمولة.`, "تفاصيل عمولاتك في مساحة الشريك."],
      button: "عرض عمولاتي",
    }),
    payoutRejected: (p: { name: string; amount: string; reason: string }): Draft => ({
      subject: `لم يتم الدفع · ${p.amount}`,
      paragraphs: [`مرحبًا ${p.name}،`, `تعذّر تنفيذ دفعتك بقيمة ${p.amount}.`, `السبب: ${p.reason}`, "تحقق من بياناتك البنكية في مساحة الشريك. تبقى العمولات المعنية من حقك وستُضاف إلى دفعة الشهر المقبل."],
      button: "التحقق من بياناتي",
    }),
    payoutInfoMissing: (p: { name: string; amount: string }): Draft => ({
      subject: "أضف بياناتك البنكية لاستلام عمولاتك",
      paragraphs: [`مرحبًا ${p.name}،`, `لديك ${p.amount} من العمولات الجاهزة للدفع، لكننا لا نملك بياناتك البنكية بعد.`, "أضفها في مساحة الشريك: ستُرسل الدفعة في الدورة الشهرية التالية (في الأول من الشهر، وتُدفع قبل العاشر)."],
      button: "إضافة بياناتي",
    }),
  },
  es: {
    leadRegistered: (p: { name: string; business: string }): Draft => ({
      subject: `${p.business} se ha registrado con tu enlace`,
      paragraphs: [`Hola ${p.name}:`, `${p.business} acaba de crear su negocio en FOVE con tu enlace. Ahora está vinculado a ti.`, "Acompáñalo hasta el pago de su suscripción (con tarjeta o por transferencia con su referencia): tu comisión se genera en cuanto FOVE recibe el pago."],
      button: "Ver mis clientes",
    }),
    commissionCancelled: (p: { name: string; amount: string }): Draft => ({
      subject: `Comisión anulada · ${p.amount}`,
      paragraphs: [`Hola ${p.name}:`, `El pago que originó una comisión de ${p.amount} se reembolsó durante el periodo de garantía, por lo que esta comisión queda anulada.`, "El detalle de tus comisiones está en tu espacio de socio."],
      button: "Ver mis comisiones",
    }),
    payoutRejected: (p: { name: string; amount: string; reason: string }): Draft => ({
      subject: `Pago no realizado · ${p.amount}`,
      paragraphs: [`Hola ${p.name}:`, `No se ha podido realizar tu pago de ${p.amount}.`, `Motivo: ${p.reason}`, "Revisa tus datos bancarios en tu espacio de socio. Las comisiones afectadas siguen siendo tuyas y se incluirán en el pago del mes que viene."],
      button: "Revisar mis datos",
    }),
    payoutInfoMissing: (p: { name: string; amount: string }): Draft => ({
      subject: "Añade tus datos bancarios para recibir tus comisiones",
      paragraphs: [`Hola ${p.name}:`, `Tienes ${p.amount} en comisiones listas para pagar, pero todavía no tenemos tus datos bancarios.`, "Añádelos en tu espacio de socio: el pago saldrá en el próximo ciclo mensual (el día 1, pagado antes del 10)."],
      button: "Añadir mis datos",
    }),
  },
} satisfies Record<Locale, unknown>;

type PartnerKey = "leadRegistered" | "commissionCancelled" | "payoutRejected" | "payoutInfoMissing";
type PartnerParams<K extends PartnerKey> = Parameters<(typeof PARTNER)["fr"][K]>[0];

/** Email au partenaire ; `url` : son espace partenaire. */
export function partnerMessage<K extends PartnerKey>(locale: Locale, key: K, params: PartnerParams<K>, url: string): Content {
  const draft = (PARTNER[locale][key] as (p: PartnerParams<K>) => Draft)(params);
  return build(locale, "partner", draft, url);
}

// --- Parrainage ---------------------------------------------------------------------------------

const REFERRAL = {
  fr: {
    pending: (p: { referee: string; amount: string; date: string }): Draft => ({
      subject: `${p.referee} s'est abonné grâce à vous`,
      paragraphs: ["Bonjour,", `Bonne nouvelle : ${p.referee}, que vous avez parrainé, vient de payer son abonnement.`, `Votre crédit de ${p.amount} sera acquis le ${p.date}, à la fin du délai de garantie. Il sera ensuite déduit automatiquement de vos prochaines factures.`],
      button: "Voir mon parrainage",
    }),
    earned: (p: { amount: string; expires: string }): Draft => ({
      subject: `Crédit de parrainage acquis · ${p.amount}`,
      paragraphs: ["Bonjour,", `Votre crédit de parrainage de ${p.amount} est acquis. Il sera déduit automatiquement de vos prochaines factures FOVE, jusqu'au ${p.expires}.`, "Merci de faire connaître FOVE !"],
      button: "Voir mon parrainage",
    }),
  },
  en: {
    pending: (p: { referee: string; amount: string; date: string }): Draft => ({
      subject: `${p.referee} subscribed thanks to you`,
      paragraphs: ["Hello,", `Good news: ${p.referee}, whom you referred, has just paid for their subscription.`, `Your ${p.amount} credit will be confirmed on ${p.date}, at the end of the guarantee period. It will then be deducted automatically from your next invoices.`],
      button: "View my referrals",
    }),
    earned: (p: { amount: string; expires: string }): Draft => ({
      subject: `Referral credit confirmed · ${p.amount}`,
      paragraphs: ["Hello,", `Your ${p.amount} referral credit is confirmed. It will be deducted automatically from your next FOVE invoices, until ${p.expires}.`, "Thank you for spreading the word about FOVE!"],
      button: "View my referrals",
    }),
  },
  ar: {
    pending: (p: { referee: string; amount: string; date: string }): Draft => ({
      subject: `اشترك ${p.referee} بفضلك`,
      paragraphs: ["مرحبًا،", `خبر سار: دفع ${p.referee}، الذي أحلته، اشتراكه للتو.`, `سيُثبَّت رصيدك البالغ ${p.amount} في ${p.date} عند انتهاء فترة الضمان، ثم يُخصم تلقائيًا من فواتيرك القادمة.`],
      button: "عرض الإحالات",
    }),
    earned: (p: { amount: string; expires: string }): Draft => ({
      subject: `تم تثبيت رصيد الإحالة · ${p.amount}`,
      paragraphs: ["مرحبًا،", `تم تثبيت رصيد الإحالة البالغ ${p.amount}. سيُخصم تلقائيًا من فواتيرك القادمة في FOVE حتى ${p.expires}.`, "شكرًا لتعريفك الآخرين بـ FOVE!"],
      button: "عرض الإحالات",
    }),
  },
  es: {
    pending: (p: { referee: string; amount: string; date: string }): Draft => ({
      subject: `${p.referee} se ha suscrito gracias a ti`,
      paragraphs: ["Hola:", `Buenas noticias: ${p.referee}, a quien recomendaste, acaba de pagar su suscripción.`, `Tu crédito de ${p.amount} quedará confirmado el ${p.date}, al final del periodo de garantía. Después se descontará automáticamente de tus próximas facturas.`],
      button: "Ver mis recomendaciones",
    }),
    earned: (p: { amount: string; expires: string }): Draft => ({
      subject: `Crédito de recomendación confirmado · ${p.amount}`,
      paragraphs: ["Hola:", `Tu crédito de recomendación de ${p.amount} está confirmado. Se descontará automáticamente de tus próximas facturas de FOVE, hasta el ${p.expires}.`, "¡Gracias por dar a conocer FOVE!"],
      button: "Ver mis recomendaciones",
    }),
  },
} satisfies Record<Locale, unknown>;

export function referralPendingMessage(locale: Locale, p: { referee: string; amount: string; date: string }, url: string): Content {
  return build(locale, "referral", REFERRAL[locale].pending(p), url);
}

export function referralEarnedMessage(locale: Locale, p: { amount: string; expires: string }, url: string): Content {
  return build(locale, "referral", REFERRAL[locale].earned(p), url);
}

// --- Bienvenue ----------------------------------------------------------------------------------

const WELCOME = {
  fr: (p: { business: string }): Draft => ({
    subject: `Bienvenue sur FOVE, ${p.business} !`,
    paragraphs: [
      "Bonjour,",
      `Votre commerce ${p.business} est créé. Trois étapes suffisent pour accueillir vos premiers clients fidèles :`,
      "1. Réglez votre programme : la récompense et le nombre de passages pour l'obtenir.\n2. Affichez votre QR d'inscription en caisse ou en vitrine.\n3. Scannez la carte de votre premier client à son prochain passage.",
      "Vous pouvez inviter votre équipe depuis la page Équipe. Une question ? Répondez simplement à cet email.",
    ],
    button: "Ouvrir mon espace",
  }),
  en: (p: { business: string }): Draft => ({
    subject: `Welcome to FOVE, ${p.business}!`,
    paragraphs: [
      "Hello,",
      `Your business ${p.business} is set up. Three steps are enough to welcome your first loyal customers:`,
      "1. Set up your programme: the reward and the number of visits to earn it.\n2. Display your sign-up QR code at the till or in your window.\n3. Scan your first customer's card on their next visit.",
      "You can invite your team from the Team page. Any questions? Just reply to this email.",
    ],
    button: "Open my dashboard",
  }),
  ar: (p: { business: string }): Draft => ({
    subject: `مرحبًا بك في FOVE، ${p.business}!`,
    paragraphs: [
      "مرحبًا،",
      `تم إنشاء نشاطك ${p.business}. ثلاث خطوات تكفي لاستقبال أول عملائك الأوفياء:`,
      "1. اضبط برنامجك: المكافأة وعدد الزيارات اللازمة للحصول عليها.\n2. اعرض رمز QR الخاص بالتسجيل عند الصندوق أو في الواجهة.\n3. امسح بطاقة أول عميل لك في زيارته القادمة.",
      "يمكنك دعوة فريقك من صفحة الفريق. هل لديك سؤال؟ ما عليك إلا الرد على هذا البريد.",
    ],
    button: "فتح مساحتي",
  }),
  es: (p: { business: string }): Draft => ({
    subject: `¡Bienvenido a FOVE, ${p.business}!`,
    paragraphs: [
      "Hola:",
      `Tu negocio ${p.business} está creado. Bastan tres pasos para recibir a tus primeros clientes fieles:`,
      "1. Configura tu programa: la recompensa y el número de visitas para conseguirla.\n2. Coloca tu QR de registro en la caja o en el escaparate.\n3. Escanea la tarjeta de tu primer cliente en su próxima visita.",
      "Puedes invitar a tu equipo desde la página Equipo. ¿Alguna pregunta? Responde simplemente a este correo.",
    ],
    button: "Abrir mi espacio",
  }),
} satisfies Record<Locale, unknown>;

export function merchantWelcomeMessage(locale: Locale, p: { business: string }, url: string): Content {
  return build(locale, "welcome", WELCOME[locale](p), url);
}
