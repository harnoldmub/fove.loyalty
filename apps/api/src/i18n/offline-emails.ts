/**
 * Emails de l'encaissement hors ligne (docs/chantier-encaissement-hors-ligne.md), en 4 langues :
 * instructions de paiement, paiement reçu et accès provisoire expiré.
 */
import type { EmailMessage } from "../notifications/email.service";
import type { Locale } from "./locale";
import { emailHtml } from "./emails";

type Content = Omit<EmailMessage, "to">;

/** Coordonnées affichées dans l'email d'instructions (une ligne par information renseignée). */
export interface BankLines {
  beneficiary: string;
  bankName?: string | null;
  iban?: string | null;
  accountNumber?: string | null;
  swift?: string | null;
  instructions?: string | null;
}

const LABELS: Record<Locale, { beneficiary: string; bank: string; iban: string; account: string; swift: string }> = {
  fr: { beneficiary: "Bénéficiaire", bank: "Banque", iban: "IBAN", account: "Compte", swift: "BIC/SWIFT" },
  en: { beneficiary: "Beneficiary", bank: "Bank", iban: "IBAN", account: "Account", swift: "BIC/SWIFT" },
  ar: { beneficiary: "المستفيد", bank: "البنك", iban: "IBAN", account: "الحساب", swift: "BIC/SWIFT" },
  es: { beneficiary: "Beneficiario", bank: "Banco", iban: "IBAN", account: "Cuenta", swift: "BIC/SWIFT" },
};

export function bankText(locale: Locale, accounts: BankLines[]): string {
  const l = LABELS[locale];
  return accounts
    .map((a) =>
      [
        `${l.beneficiary} : ${a.beneficiary}`,
        a.bankName && `${l.bank} : ${a.bankName}`,
        a.iban && `${l.iban} : ${a.iban}`,
        a.accountNumber && `${l.account} : ${a.accountNumber}`,
        a.swift && `${l.swift} : ${a.swift}`,
        a.instructions,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
}

const T = {
  fr: {
    instructionsSubject: (ref: string) => `Votre abonnement FOVE : référence de paiement ${ref}`,
    instructions: (p: { plan: string; amount: string; ref: string; bank: string; provisional: string | null }) =>
      [
        `Bonjour,\n\nPour régler votre abonnement ${p.plan} (${p.amount}), effectuez un virement, un dépôt en espèces ou un paiement mobile money en indiquant obligatoirement cette référence dans le motif :\n\n${p.ref}`,
        p.bank,
        p.provisional ? `Votre offre est active dès maintenant, à titre provisoire, jusqu'au ${p.provisional}. Elle sera confirmée dès réception de votre paiement ; sans paiement à cette date, votre commerce reviendra à l'offre Gratuite (rien n'est supprimé).` : `Votre offre sera activée dès réception de votre paiement.`,
        `Un partenaire FOVE peut vous accompagner pour effectuer ce paiement.`,
      ].join("\n\n"),
    button: "Voir mon abonnement",
    paidSubject: (plan: string) => `Paiement reçu : votre abonnement ${plan} est actif`,
    paid: (p: { plan: string; amount: string; ref: string; until: string }) =>
      `Bonjour,\n\nNous avons bien reçu votre paiement de ${p.amount} (référence ${p.ref}). Votre abonnement ${p.plan} est actif jusqu'au ${p.until}.\n\nMerci de votre confiance !`,
    expiredSubject: "Votre accès provisoire FOVE a pris fin",
    expired: (p: { plan: string; ref: string }) =>
      `Bonjour,\n\nNous n'avons pas reçu le paiement de votre abonnement ${p.plan} (référence ${p.ref}). Votre commerce est revenu à l'offre Gratuite : vos clients gardent leurs cartes et rien n'est supprimé.\n\nSi vous avez déjà payé, répondez à cet email avec votre justificatif. Vous pouvez aussi souscrire à nouveau depuis votre espace.`,
    footer: "Vous recevez cet email au sujet de votre abonnement FOVE.",
  },
  en: {
    instructionsSubject: (ref: string) => `Your FOVE subscription: payment reference ${ref}`,
    instructions: (p: { plan: string; amount: string; ref: string; bank: string; provisional: string | null }) =>
      [
        `Hello,\n\nTo pay for your ${p.plan} subscription (${p.amount}), make a bank transfer, a cash deposit or a mobile money payment, and always include this reference in the payment description:\n\n${p.ref}`,
        p.bank,
        p.provisional ? `Your plan is active now, provisionally, until ${p.provisional}. It will be confirmed as soon as we receive your payment; without payment by that date, your business returns to the Free plan (nothing is deleted).` : `Your plan will be activated as soon as we receive your payment.`,
        `A FOVE partner can help you make this payment.`,
      ].join("\n\n"),
    button: "View my subscription",
    paidSubject: (plan: string) => `Payment received: your ${plan} subscription is active`,
    paid: (p: { plan: string; amount: string; ref: string; until: string }) =>
      `Hello,\n\nWe have received your payment of ${p.amount} (reference ${p.ref}). Your ${p.plan} subscription is active until ${p.until}.\n\nThank you for your trust!`,
    expiredSubject: "Your provisional FOVE access has ended",
    expired: (p: { plan: string; ref: string }) =>
      `Hello,\n\nWe did not receive the payment for your ${p.plan} subscription (reference ${p.ref}). Your business is back on the Free plan: your customers keep their cards and nothing is deleted.\n\nIf you have already paid, reply to this email with your proof of payment. You can also subscribe again from your space.`,
    footer: "You are receiving this email about your FOVE subscription.",
  },
  ar: {
    instructionsSubject: (ref: string) => `اشتراكك في FOVE: مرجع الدفع ${ref}`,
    instructions: (p: { plan: string; amount: string; ref: string; bank: string; provisional: string | null }) =>
      [
        `مرحبًا،\n\nلدفع اشتراكك ${p.plan} (${p.amount})، قم بتحويل بنكي أو إيداع نقدي أو دفع عبر الهاتف المحمول، مع ذكر هذا المرجع إلزاميًا في بيان الدفع:\n\n${p.ref}`,
        p.bank,
        p.provisional ? `باقتك مفعّلة الآن بصفة مؤقتة حتى ${p.provisional}. سيتم تأكيدها فور استلام دفعتك؛ وإذا لم تصل الدفعة حتى ذلك التاريخ، يعود متجرك إلى الباقة المجانية (لا يُحذف أي شيء).` : `ستُفعَّل باقتك فور استلام دفعتك.`,
        `يمكن لأحد شركاء FOVE مساعدتك في إجراء هذا الدفع.`,
      ].join("\n\n"),
    button: "عرض اشتراكي",
    paidSubject: (plan: string) => `تم استلام الدفعة: اشتراكك ${plan} مفعّل`,
    paid: (p: { plan: string; amount: string; ref: string; until: string }) =>
      `مرحبًا،\n\nاستلمنا دفعتك البالغة ${p.amount} (المرجع ${p.ref}). اشتراكك ${p.plan} مفعّل حتى ${p.until}.\n\nشكرًا لثقتك!`,
    expiredSubject: "انتهى وصولك المؤقت إلى FOVE",
    expired: (p: { plan: string; ref: string }) =>
      `مرحبًا،\n\nلم نستلم دفعة اشتراكك ${p.plan} (المرجع ${p.ref}). عاد متجرك إلى الباقة المجانية: يحتفظ عملاؤك ببطاقاتهم ولا يُحذف أي شيء.\n\nإذا كنت قد دفعت بالفعل، فردّ على هذا البريد مع إثبات الدفع. يمكنك أيضًا الاشتراك من جديد من مساحتك.`,
    footer: "تتلقى هذا البريد بخصوص اشتراكك في FOVE.",
  },
  es: {
    instructionsSubject: (ref: string) => `Tu suscripción a FOVE: referencia de pago ${ref}`,
    instructions: (p: { plan: string; amount: string; ref: string; bank: string; provisional: string | null }) =>
      [
        `Hola:\n\nPara pagar tu suscripción ${p.plan} (${p.amount}), haz una transferencia, un depósito en efectivo o un pago con dinero móvil indicando obligatoriamente esta referencia en el concepto:\n\n${p.ref}`,
        p.bank,
        p.provisional ? `Tu plan está activo desde ahora, de forma provisional, hasta el ${p.provisional}. Se confirmará en cuanto recibamos tu pago; sin pago en esa fecha, tu comercio volverá al plan Gratuito (no se borra nada).` : `Tu plan se activará en cuanto recibamos tu pago.`,
        `Un socio de FOVE puede ayudarte a realizar este pago.`,
      ].join("\n\n"),
    button: "Ver mi suscripción",
    paidSubject: (plan: string) => `Pago recibido: tu suscripción ${plan} está activa`,
    paid: (p: { plan: string; amount: string; ref: string; until: string }) =>
      `Hola:\n\nHemos recibido tu pago de ${p.amount} (referencia ${p.ref}). Tu suscripción ${p.plan} está activa hasta el ${p.until}.\n\n¡Gracias por tu confianza!`,
    expiredSubject: "Tu acceso provisional a FOVE ha terminado",
    expired: (p: { plan: string; ref: string }) =>
      `Hola:\n\nNo hemos recibido el pago de tu suscripción ${p.plan} (referencia ${p.ref}). Tu comercio ha vuelto al plan Gratuito: tus clientes conservan sus tarjetas y no se borra nada.\n\nSi ya has pagado, responde a este correo con tu justificante. También puedes volver a suscribirte desde tu espacio.`,
    footer: "Recibes este correo en relación con tu suscripción a FOVE.",
  },
} satisfies Record<Locale, unknown>;

function withButton(locale: Locale, subject: string, text: string, button: { label: string; url: string }): Content {
  const paragraphs = text.split("\n\n");
  return {
    subject,
    text: `${text}\n\n${button.label} : ${button.url}`,
    html: emailHtml(locale, { title: subject, heading: subject, paragraphs, button, footer: T[locale].footer }),
  };
}

export function offlineInstructionsMessage(locale: Locale, p: { plan: string; amount: string; reference: string; bank: string; provisionalUntil: string | null; billingUrl: string }): Content {
  const t = T[locale];
  return withButton(locale, t.instructionsSubject(p.reference), t.instructions({ plan: p.plan, amount: p.amount, ref: p.reference, bank: p.bank, provisional: p.provisionalUntil }), { label: t.button, url: p.billingUrl });
}

export function offlinePaidMessage(locale: Locale, p: { plan: string; amount: string; reference: string; until: string; billingUrl: string }): Content {
  const t = T[locale];
  return withButton(locale, t.paidSubject(p.plan), t.paid({ plan: p.plan, amount: p.amount, ref: p.reference, until: p.until }), { label: t.button, url: p.billingUrl });
}

export function offlineExpiredMessage(locale: Locale, p: { plan: string; reference: string; billingUrl: string }): Content {
  const t = T[locale];
  return withButton(locale, t.expiredSubject, t.expired({ plan: p.plan, ref: p.reference }), { label: t.button, url: p.billingUrl });
}
