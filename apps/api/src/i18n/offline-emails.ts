/**
 * Emails de l'encaissement hors ligne (docs/chantier-encaissement-hors-ligne.md), en 4 langues :
 * instructions de virement, paiement reçu, accès provisoire expiré, confirmation d'un encaissement
 * par un partenaire (avec lien « signaler un problème ») et relevé mensuel d'un partenaire.
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
        `Vous pouvez aussi régler auprès d'un partenaire FOVE en lui donnant cette référence.`,
      ].join("\n\n"),
    button: "Voir mon abonnement",
    paidSubject: (plan: string) => `Paiement reçu : votre abonnement ${plan} est actif`,
    paid: (p: { plan: string; amount: string; ref: string; until: string }) =>
      `Bonjour,\n\nNous avons bien reçu votre paiement de ${p.amount} (référence ${p.ref}). Votre abonnement ${p.plan} est actif jusqu'au ${p.until}.\n\nMerci de votre confiance !`,
    expiredSubject: "Votre accès provisoire FOVE a pris fin",
    expired: (p: { plan: string; ref: string }) =>
      `Bonjour,\n\nNous n'avons pas reçu le paiement de votre abonnement ${p.plan} (référence ${p.ref}). Votre commerce est revenu à l'offre Gratuite : vos clients gardent leurs cartes et rien n'est supprimé.\n\nSi vous avez déjà payé, répondez à cet email avec votre justificatif. Vous pouvez aussi souscrire à nouveau depuis votre espace.`,
    collectedSubject: (amount: string) => `Confirmation de votre paiement de ${amount}`,
    collected: (p: { amount: string; partner: string; date: string; plan: string; until: string }) =>
      `Bonjour,\n\nVous avez payé ${p.amount} à ${p.partner}, partenaire FOVE, le ${p.date}, pour votre abonnement ${p.plan}, actif jusqu'au ${p.until}.\n\nSi ce n'est pas exact (montant, date, ou paiement que vous n'avez pas fait), signalez-le-nous avec le bouton ci-dessous.`,
    report: "Signaler un problème",
    statementSubject: (ref: string) => `Votre relevé FOVE ${ref}`,
    statementOwe: (p: { period: string; collected: string; deducted: string; balance: string; ref: string; due: string; bank: string }) =>
      `Bonjour,\n\nVoici votre relevé pour ${p.period}.\n\nEncaissé pour FOVE : ${p.collected}\nVos commissions et frais : ${p.deducted}\nSolde à verser à FOVE : ${p.balance}\n\nMerci de le verser avant le ${p.due} en indiquant obligatoirement la référence ${p.ref} dans le motif.\n\n${p.bank}\n\nSans paiement 30 jours après l'émission du relevé, les nouveaux encaissements sont suspendus.`,
    statementCredit: (p: { period: string; collected: string; deducted: string; balance: string }) =>
      `Bonjour,\n\nVoici votre relevé pour ${p.period}.\n\nEncaissé pour FOVE : ${p.collected}\nVos commissions et frais : ${p.deducted}\nSolde en votre faveur : ${p.balance}\n\nCe montant vous sera versé par FOVE avec vos prochains versements.`,
    footer: "Vous recevez cet email au sujet de votre abonnement FOVE.",
  },
  en: {
    instructionsSubject: (ref: string) => `Your FOVE subscription: payment reference ${ref}`,
    instructions: (p: { plan: string; amount: string; ref: string; bank: string; provisional: string | null }) =>
      [
        `Hello,\n\nTo pay for your ${p.plan} subscription (${p.amount}), make a bank transfer, a cash deposit or a mobile money payment, and always include this reference in the payment description:\n\n${p.ref}`,
        p.bank,
        p.provisional ? `Your plan is active now, provisionally, until ${p.provisional}. It will be confirmed as soon as we receive your payment; without payment by that date, your business returns to the Free plan (nothing is deleted).` : `Your plan will be activated as soon as we receive your payment.`,
        `You can also pay a FOVE partner by giving them this reference.`,
      ].join("\n\n"),
    button: "View my subscription",
    paidSubject: (plan: string) => `Payment received: your ${plan} subscription is active`,
    paid: (p: { plan: string; amount: string; ref: string; until: string }) =>
      `Hello,\n\nWe have received your payment of ${p.amount} (reference ${p.ref}). Your ${p.plan} subscription is active until ${p.until}.\n\nThank you for your trust!`,
    expiredSubject: "Your provisional FOVE access has ended",
    expired: (p: { plan: string; ref: string }) =>
      `Hello,\n\nWe did not receive the payment for your ${p.plan} subscription (reference ${p.ref}). Your business is back on the Free plan: your customers keep their cards and nothing is deleted.\n\nIf you have already paid, reply to this email with your proof of payment. You can also subscribe again from your space.`,
    collectedSubject: (amount: string) => `Confirmation of your ${amount} payment`,
    collected: (p: { amount: string; partner: string; date: string; plan: string; until: string }) =>
      `Hello,\n\nYou paid ${p.amount} to ${p.partner}, a FOVE partner, on ${p.date}, for your ${p.plan} subscription, active until ${p.until}.\n\nIf this is not correct (amount, date, or a payment you did not make), let us know with the button below.`,
    report: "Report a problem",
    statementSubject: (ref: string) => `Your FOVE statement ${ref}`,
    statementOwe: (p: { period: string; collected: string; deducted: string; balance: string; ref: string; due: string; bank: string }) =>
      `Hello,\n\nHere is your statement for ${p.period}.\n\nCollected for FOVE: ${p.collected}\nYour commissions and fees: ${p.deducted}\nBalance to pay FOVE: ${p.balance}\n\nPlease pay it before ${p.due}, always including the reference ${p.ref} in the payment description.\n\n${p.bank}\n\nWithout payment 30 days after the statement is issued, new collections are suspended.`,
    statementCredit: (p: { period: string; collected: string; deducted: string; balance: string }) =>
      `Hello,\n\nHere is your statement for ${p.period}.\n\nCollected for FOVE: ${p.collected}\nYour commissions and fees: ${p.deducted}\nBalance in your favour: ${p.balance}\n\nFOVE will pay you this amount with your next payouts.`,
    footer: "You are receiving this email about your FOVE subscription.",
  },
  ar: {
    instructionsSubject: (ref: string) => `اشتراكك في FOVE: مرجع الدفع ${ref}`,
    instructions: (p: { plan: string; amount: string; ref: string; bank: string; provisional: string | null }) =>
      [
        `مرحبًا،\n\nلدفع اشتراكك ${p.plan} (${p.amount})، قم بتحويل بنكي أو إيداع نقدي أو دفع عبر الهاتف المحمول، مع ذكر هذا المرجع إلزاميًا في بيان الدفع:\n\n${p.ref}`,
        p.bank,
        p.provisional ? `باقتك مفعّلة الآن بصفة مؤقتة حتى ${p.provisional}. سيتم تأكيدها فور استلام دفعتك؛ وإذا لم تصل الدفعة حتى ذلك التاريخ، يعود متجرك إلى الباقة المجانية (لا يُحذف أي شيء).` : `ستُفعَّل باقتك فور استلام دفعتك.`,
        `يمكنك أيضًا الدفع لدى أحد شركاء FOVE بإعطائه هذا المرجع.`,
      ].join("\n\n"),
    button: "عرض اشتراكي",
    paidSubject: (plan: string) => `تم استلام الدفعة: اشتراكك ${plan} مفعّل`,
    paid: (p: { plan: string; amount: string; ref: string; until: string }) =>
      `مرحبًا،\n\nاستلمنا دفعتك البالغة ${p.amount} (المرجع ${p.ref}). اشتراكك ${p.plan} مفعّل حتى ${p.until}.\n\nشكرًا لثقتك!`,
    expiredSubject: "انتهى وصولك المؤقت إلى FOVE",
    expired: (p: { plan: string; ref: string }) =>
      `مرحبًا،\n\nلم نستلم دفعة اشتراكك ${p.plan} (المرجع ${p.ref}). عاد متجرك إلى الباقة المجانية: يحتفظ عملاؤك ببطاقاتهم ولا يُحذف أي شيء.\n\nإذا كنت قد دفعت بالفعل، فردّ على هذا البريد مع إثبات الدفع. يمكنك أيضًا الاشتراك من جديد من مساحتك.`,
    collectedSubject: (amount: string) => `تأكيد دفعتك البالغة ${amount}`,
    collected: (p: { amount: string; partner: string; date: string; plan: string; until: string }) =>
      `مرحبًا،\n\nدفعت ${p.amount} إلى ${p.partner}، شريك FOVE، في ${p.date}، مقابل اشتراكك ${p.plan} المفعّل حتى ${p.until}.\n\nإذا كان هذا غير صحيح (المبلغ أو التاريخ، أو دفعة لم تقم بها)، فأبلغنا عبر الزر أدناه.`,
    report: "الإبلاغ عن مشكلة",
    statementSubject: (ref: string) => `كشف حسابك لدى FOVE ${ref}`,
    statementOwe: (p: { period: string; collected: string; deducted: string; balance: string; ref: string; due: string; bank: string }) =>
      `مرحبًا،\n\nإليك كشف حسابك عن ${p.period}.\n\nالمبالغ المحصّلة لصالح FOVE: ${p.collected}\nعمولاتك ورسومك: ${p.deducted}\nالرصيد الواجب دفعه إلى FOVE: ${p.balance}\n\nيُرجى دفعه قبل ${p.due} مع ذكر المرجع ${p.ref} إلزاميًا في بيان الدفع.\n\n${p.bank}\n\nإذا لم يُدفع بعد 30 يومًا من إصدار الكشف، تُعلَّق عمليات التحصيل الجديدة.`,
    statementCredit: (p: { period: string; collected: string; deducted: string; balance: string }) =>
      `مرحبًا،\n\nإليك كشف حسابك عن ${p.period}.\n\nالمبالغ المحصّلة لصالح FOVE: ${p.collected}\nعمولاتك ورسومك: ${p.deducted}\nالرصيد لصالحك: ${p.balance}\n\nستدفع لك FOVE هذا المبلغ مع دفعاتك القادمة.`,
    footer: "تتلقى هذا البريد بخصوص اشتراكك في FOVE.",
  },
  es: {
    instructionsSubject: (ref: string) => `Tu suscripción a FOVE: referencia de pago ${ref}`,
    instructions: (p: { plan: string; amount: string; ref: string; bank: string; provisional: string | null }) =>
      [
        `Hola:\n\nPara pagar tu suscripción ${p.plan} (${p.amount}), haz una transferencia, un depósito en efectivo o un pago con dinero móvil indicando obligatoriamente esta referencia en el concepto:\n\n${p.ref}`,
        p.bank,
        p.provisional ? `Tu plan está activo desde ahora, de forma provisional, hasta el ${p.provisional}. Se confirmará en cuanto recibamos tu pago; sin pago en esa fecha, tu comercio volverá al plan Gratuito (no se borra nada).` : `Tu plan se activará en cuanto recibamos tu pago.`,
        `También puedes pagar a un socio de FOVE dándole esta referencia.`,
      ].join("\n\n"),
    button: "Ver mi suscripción",
    paidSubject: (plan: string) => `Pago recibido: tu suscripción ${plan} está activa`,
    paid: (p: { plan: string; amount: string; ref: string; until: string }) =>
      `Hola:\n\nHemos recibido tu pago de ${p.amount} (referencia ${p.ref}). Tu suscripción ${p.plan} está activa hasta el ${p.until}.\n\n¡Gracias por tu confianza!`,
    expiredSubject: "Tu acceso provisional a FOVE ha terminado",
    expired: (p: { plan: string; ref: string }) =>
      `Hola:\n\nNo hemos recibido el pago de tu suscripción ${p.plan} (referencia ${p.ref}). Tu comercio ha vuelto al plan Gratuito: tus clientes conservan sus tarjetas y no se borra nada.\n\nSi ya has pagado, responde a este correo con tu justificante. También puedes volver a suscribirte desde tu espacio.`,
    collectedSubject: (amount: string) => `Confirmación de tu pago de ${amount}`,
    collected: (p: { amount: string; partner: string; date: string; plan: string; until: string }) =>
      `Hola:\n\nHas pagado ${p.amount} a ${p.partner}, socio de FOVE, el ${p.date}, por tu suscripción ${p.plan}, activa hasta el ${p.until}.\n\nSi no es correcto (importe, fecha o un pago que no has hecho), avísanos con el botón de abajo.`,
    report: "Señalar un problema",
    statementSubject: (ref: string) => `Tu extracto de FOVE ${ref}`,
    statementOwe: (p: { period: string; collected: string; deducted: string; balance: string; ref: string; due: string; bank: string }) =>
      `Hola:\n\nEste es tu extracto de ${p.period}.\n\nCobrado para FOVE: ${p.collected}\nTus comisiones y gastos: ${p.deducted}\nSaldo a pagar a FOVE: ${p.balance}\n\nPágalo antes del ${p.due} indicando obligatoriamente la referencia ${p.ref} en el concepto.\n\n${p.bank}\n\nSin pago 30 días después de la emisión del extracto, se suspenden los nuevos cobros.`,
    statementCredit: (p: { period: string; collected: string; deducted: string; balance: string }) =>
      `Hola:\n\nEste es tu extracto de ${p.period}.\n\nCobrado para FOVE: ${p.collected}\nTus comisiones y gastos: ${p.deducted}\nSaldo a tu favor: ${p.balance}\n\nFOVE te pagará este importe con tus próximos pagos.`,
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

export function collectionConfirmMessage(locale: Locale, p: { amount: string; partner: string; date: string; plan: string; until: string; reportUrl: string }): Content {
  const t = T[locale];
  return withButton(locale, t.collectedSubject(p.amount), t.collected(p), { label: t.report, url: p.reportUrl });
}

export function statementMessage(
  locale: Locale,
  p: { reference: string; period: string; collected: string; deducted: string; balance: string; owes: boolean; due: string; bank: string },
): Content {
  const t = T[locale];
  return { subject: t.statementSubject(p.reference), text: p.owes ? t.statementOwe({ ...p, ref: p.reference }) : t.statementCredit(p) };
}
