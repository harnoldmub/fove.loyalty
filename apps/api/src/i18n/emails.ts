/**
 * Emails transactionnels traduits. Chaque fonction renvoie sujet, texte et,
 * pour les emails avec bouton, une version HTML (sens de lecture inversé pour l'arabe).
 * Les alertes internes à l'équipe FOVE restent en français et ne passent pas ici.
 */
import type { EmailMessage } from "../notifications/email.service";
import type { Locale } from "./locale";

type Content = Omit<EmailMessage, "to">;

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const FALLBACK: Record<Locale, string> = {
  fr: "Si le bouton ne fonctionne pas, copiez-collez l'adresse suivante dans votre navigateur :",
  en: "If the button doesn't work, copy and paste this address into your browser:",
  ar: "إذا لم يعمل الزر، انسخ العنوان التالي والصقه في متصفحك:",
  es: "Si el botón no funciona, copia y pega esta dirección en tu navegador:",
};

/** Gabarit HTML commun : titre, paragraphes, bouton, lien de secours et note de bas de page. */
export function emailHtml(
  locale: Locale,
  p: { title: string; heading: string; paragraphs: string[]; button: { label: string; url: string }; footer: string; color?: string },
): string {
  const dir = locale === "ar" ? "rtl" : "ltr";
  const align = locale === "ar" ? "right" : "left";
  const color = p.color ?? "#2C55F5";
  const url = escapeHtml(p.button.url);
  const paragraphs = p.paragraphs
    .map((text) => `<p style="font-size: 15px; line-height: 24px; color: #4b5563; margin-top: 0; margin-bottom: 16px;">${escapeHtml(text).replace(/\n/g, "<br>")}</p>`)
    .join("\n        ");
  return `<!DOCTYPE html>
<html lang="${locale}" dir="${dir}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(p.title)}</title>
</head>
<body dir="${dir}" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f9fafb; margin: 0; padding: 24px; color: #111827; text-align: ${align};">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" dir="${dir}" style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb; overflow: hidden;">
    <tr>
      <td style="padding: 32px 32px 24px; text-align: ${align};">
        <h2 style="font-size: 20px; font-weight: 700; margin-top: 0; margin-bottom: 16px; color: #0d1322;">${escapeHtml(p.heading)}</h2>
        ${paragraphs}
        <table border="0" cellspacing="0" cellpadding="0" style="margin: 8px 0 24px;">
          <tr>
            <td align="center" style="border-radius: 8px;" bgcolor="${color}">
              <a href="${url}" target="_blank" rel="noopener noreferrer" style="font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; display: inline-block;">${escapeHtml(p.button.label)}</a>
            </td>
          </tr>
        </table>
        <p style="font-size: 13px; line-height: 20px; color: #6b7280; margin-bottom: 8px;">${FALLBACK[locale]}</p>
        <p style="font-size: 12px; line-height: 18px; color: ${color}; word-break: break-all; margin-top: 0; margin-bottom: 24px;" dir="ltr">
          <a href="${url}" style="color: ${color};">${url}</a>
        </p>
        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 24px 0;">
        <p style="font-size: 12px; line-height: 18px; color: #9ca3af; margin: 0;">${escapeHtml(p.footer)}</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// --- Compte ------------------------------------------------------------------

const VERIFY = {
  fr: {
    subject: "Confirmez votre adresse email — FOVE",
    title: "Confirmez votre adresse email",
    heading: "Bienvenue sur FOVE",
    intro: "Bienvenue sur FOVE.",
    body: "Confirmez votre adresse email en cliquant sur le bouton ci-dessous pour activer toutes les fonctionnalités de votre commerce (valable 48 h) :",
    textBody: "Confirmez votre adresse en ouvrant ce lien (valable 48 h) :",
    button: "Confirmer mon adresse email",
    footer: "Si vous n'êtes pas à l'origine de cette inscription, vous pouvez ignorer cet email.",
    textFooter: "Si vous n'êtes pas à l'origine de cette inscription, ignorez ce message.",
  },
  en: {
    subject: "Confirm your email address — FOVE",
    title: "Confirm your email address",
    heading: "Welcome to FOVE",
    intro: "Welcome to FOVE.",
    body: "Confirm your email address with the button below to unlock every feature for your business (valid for 48 hours):",
    textBody: "Confirm your address by opening this link (valid for 48 hours):",
    button: "Confirm my email address",
    footer: "If you didn't sign up, you can ignore this email.",
    textFooter: "If you didn't sign up, ignore this message.",
  },
  ar: {
    subject: "أكّد عنوان بريدك الإلكتروني — FOVE",
    title: "أكّد عنوان بريدك الإلكتروني",
    heading: "مرحبًا بك في FOVE",
    intro: "مرحبًا بك في FOVE.",
    body: "أكّد عنوان بريدك الإلكتروني بالضغط على الزر أدناه لتفعيل جميع ميزات متجرك (صالح لمدة 48 ساعة):",
    textBody: "أكّد عنوانك بفتح هذا الرابط (صالح لمدة 48 ساعة):",
    button: "تأكيد بريدي الإلكتروني",
    footer: "إذا لم تقم بهذا التسجيل، يمكنك تجاهل هذه الرسالة.",
    textFooter: "إذا لم تقم بهذا التسجيل، تجاهل هذه الرسالة.",
  },
  es: {
    subject: "Confirma tu dirección de correo — FOVE",
    title: "Confirma tu dirección de correo",
    heading: "Bienvenido a FOVE",
    intro: "Bienvenido a FOVE.",
    body: "Confirma tu dirección de correo con el botón de abajo para activar todas las funciones de tu negocio (válido 48 h):",
    textBody: "Confirma tu dirección abriendo este enlace (válido 48 h):",
    button: "Confirmar mi correo",
    footer: "Si no te has registrado, puedes ignorar este correo.",
    textFooter: "Si no te has registrado, ignora este mensaje.",
  },
} satisfies Record<Locale, unknown>;

export function verifyEmailMessage(locale: Locale, link: string): Content {
  const t = VERIFY[locale];
  return {
    subject: t.subject,
    text: `${t.intro}\n\n${t.textBody}\n${link}\n\n${t.textFooter}`,
    html: emailHtml(locale, { title: t.title, heading: t.heading, paragraphs: [t.body], button: { label: t.button, url: link }, footer: t.footer }),
  };
}

const RESET = {
  fr: {
    subject: "Réinitialisation de votre mot de passe — FOVE",
    title: "Réinitialisation de votre mot de passe",
    heading: "Réinitialisation de mot de passe",
    hello: "Bonjour,",
    body: "Vous avez demandé à réinitialiser le mot de passe de votre compte FOVE. Cliquez sur le bouton ci-dessous pour choisir votre nouveau mot de passe (ce lien est valable 1 heure) :",
    textBody: "Vous avez demandé la réinitialisation de votre mot de passe pour votre compte FOVE.\n\nPour choisir un nouveau mot de passe, ouvrez ce lien (valable 1 heure) :",
    button: "Réinitialiser mon mot de passe",
    footer: "Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email. Votre mot de passe actuel reste inchangé.",
    textFooter: "Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email en toute sécurité.",
    sign: "L'équipe FOVE",
  },
  en: {
    subject: "Reset your password — FOVE",
    title: "Reset your password",
    heading: "Password reset",
    hello: "Hello,",
    body: "You asked to reset the password of your FOVE account. Use the button below to choose a new password (this link is valid for 1 hour):",
    textBody: "You asked to reset the password of your FOVE account.\n\nTo choose a new password, open this link (valid for 1 hour):",
    button: "Reset my password",
    footer: "If you didn't ask for this, you can ignore this email. Your current password stays the same.",
    textFooter: "If you didn't ask for this, you can safely ignore this email.",
    sign: "The FOVE team",
  },
  ar: {
    subject: "إعادة تعيين كلمة المرور — FOVE",
    title: "إعادة تعيين كلمة المرور",
    heading: "إعادة تعيين كلمة المرور",
    hello: "مرحبًا،",
    body: "طلبت إعادة تعيين كلمة مرور حسابك على FOVE. اضغط على الزر أدناه لاختيار كلمة مرور جديدة (الرابط صالح لمدة ساعة واحدة):",
    textBody: "طلبت إعادة تعيين كلمة مرور حسابك على FOVE.\n\nلاختيار كلمة مرور جديدة، افتح هذا الرابط (صالح لمدة ساعة واحدة):",
    button: "إعادة تعيين كلمة المرور",
    footer: "إذا لم تطلب ذلك، يمكنك تجاهل هذه الرسالة. تبقى كلمة مرورك الحالية دون تغيير.",
    textFooter: "إذا لم تطلب ذلك، يمكنك تجاهل هذه الرسالة بأمان.",
    sign: "فريق FOVE",
  },
  es: {
    subject: "Restablece tu contraseña — FOVE",
    title: "Restablece tu contraseña",
    heading: "Restablecer contraseña",
    hello: "Hola:",
    body: "Has pedido restablecer la contraseña de tu cuenta FOVE. Pulsa el botón de abajo para elegir una nueva contraseña (este enlace es válido 1 hora):",
    textBody: "Has pedido restablecer la contraseña de tu cuenta FOVE.\n\nPara elegir una nueva contraseña, abre este enlace (válido 1 hora):",
    button: "Restablecer mi contraseña",
    footer: "Si no lo has pedido tú, puedes ignorar este correo. Tu contraseña actual no cambia.",
    textFooter: "Si no lo has pedido tú, puedes ignorar este correo con total tranquilidad.",
    sign: "El equipo de FOVE",
  },
} satisfies Record<Locale, unknown>;

export function passwordResetMessage(locale: Locale, link: string): Content {
  const t = RESET[locale];
  return {
    subject: t.subject,
    text: `${t.hello}\n\n${t.textBody}\n${link}\n\n${t.textFooter}\n\n${t.sign}`,
    html: emailHtml(locale, { title: t.title, heading: t.heading, paragraphs: [t.hello, t.body], button: { label: t.button, url: link }, footer: t.footer }),
  };
}

const INVITE = {
  fr: {
    subject: (tenant: string) => `Invitation à rejoindre ${tenant} sur FOVE`,
    body: (tenant: string) => `Vous êtes invité(e) à rejoindre l'équipe ${tenant} sur FOVE.`,
    accept: "Acceptez l'invitation (valable 7 jours) :",
    button: "Accepter l'invitation",
    footer: "Si vous ne connaissez pas cette entreprise, ignorez ce message.",
  },
  en: {
    subject: (tenant: string) => `Invitation to join ${tenant} on FOVE`,
    body: (tenant: string) => `You've been invited to join the ${tenant} team on FOVE.`,
    accept: "Accept the invitation (valid for 7 days):",
    button: "Accept the invitation",
    footer: "If you don't know this business, ignore this message.",
  },
  ar: {
    subject: (tenant: string) => `دعوة للانضمام إلى ${tenant} على FOVE`,
    body: (tenant: string) => `تمت دعوتك للانضمام إلى فريق ${tenant} على FOVE.`,
    accept: "اقبل الدعوة (صالحة لمدة 7 أيام):",
    button: "قبول الدعوة",
    footer: "إذا كنت لا تعرف هذا النشاط التجاري، تجاهل هذه الرسالة.",
  },
  es: {
    subject: (tenant: string) => `Invitación para unirte a ${tenant} en FOVE`,
    body: (tenant: string) => `Te han invitado a unirte al equipo de ${tenant} en FOVE.`,
    accept: "Acepta la invitación (válida 7 días):",
    button: "Aceptar la invitación",
    footer: "Si no conoces este negocio, ignora este mensaje.",
  },
} satisfies Record<Locale, unknown>;

export function teamInviteMessage(locale: Locale, tenantName: string, link: string): Content {
  const t = INVITE[locale];
  return {
    subject: t.subject(tenantName),
    text: `${t.body(tenantName)}\n\n${t.accept}\n${link}`,
    html: emailHtml(locale, {
      title: t.subject(tenantName),
      heading: t.subject(tenantName),
      paragraphs: [t.body(tenantName), t.accept],
      button: { label: t.button, url: link },
      footer: t.footer,
    }),
  };
}

// --- Clients d'un commerce ---------------------------------------------------

const CUSTOMER = {
  fr: {
    cardSubject: (tenant: string) => `Votre carte de fidélité ${tenant}`,
    otpSubject: (tenant: string) => `Votre code de validation — ${tenant}`,
    otp: (code: string) => `Votre code de validation de carte de fidélité : ${code}\nIl expire dans 10 minutes.`,
  },
  en: {
    cardSubject: (tenant: string) => `Your ${tenant} loyalty card`,
    otpSubject: (tenant: string) => `Your verification code — ${tenant}`,
    otp: (code: string) => `Your loyalty card verification code: ${code}\nIt expires in 10 minutes.`,
  },
  ar: {
    cardSubject: (tenant: string) => `بطاقة الولاء الخاصة بك لدى ${tenant}`,
    otpSubject: (tenant: string) => `رمز التحقق الخاص بك — ${tenant}`,
    otp: (code: string) => `رمز التحقق من بطاقة الولاء: ${code}\nتنتهي صلاحيته خلال 10 دقائق.`,
  },
  es: {
    cardSubject: (tenant: string) => `Tu tarjeta de fidelidad ${tenant}`,
    otpSubject: (tenant: string) => `Tu código de verificación — ${tenant}`,
    otp: (code: string) => `Tu código de verificación de la tarjeta de fidelidad: ${code}\nCaduca en 10 minutos.`,
  },
} satisfies Record<Locale, unknown>;

export const cardLinkSubject = (locale: Locale, tenantName: string) => CUSTOMER[locale].cardSubject(tenantName);

export function otpMessage(locale: Locale, tenantName: string, code: string): Content {
  const t = CUSTOMER[locale];
  return { subject: t.otpSubject(tenantName), text: t.otp(code) };
}

// --- Offre et quotas (propriétaire du commerce) -------------------------------

const QUOTA = {
  fr: {
    blockedSubject: (tenant: string) => `Un client n'a pas pu rejoindre ${tenant}`,
    reachedSubject: (tenant: string, limit: number) => `${tenant} a atteint ${limit} clients`,
    blocked: (limit: number) =>
      `Un client vient d'essayer de rejoindre votre programme de fidélité, mais votre offre est limitée à ${limit} clients. Il a vu un message lui indiquant que les inscriptions sont momentanément fermées.`,
    reached: (limit: number) =>
      `Votre programme de fidélité compte désormais ${limit} clients, la limite de votre offre. Les prochaines inscriptions seront refusées.`,
    body: (situation: string, url: string) =>
      `Bonjour,\n\n${situation}\n\nVos clients actuels gardent leurs cartes et leurs points. Pour accueillir de nouveaux clients, passez à une offre supérieure : ${url}\n\nL'équipe FOVE`,
  },
  en: {
    blockedSubject: (tenant: string) => `A customer couldn't join ${tenant}`,
    reachedSubject: (tenant: string, limit: number) => `${tenant} has reached ${limit} customers`,
    blocked: (limit: number) =>
      `A customer just tried to join your loyalty programme, but your plan is limited to ${limit} customers. They saw a message saying sign-ups are temporarily closed.`,
    reached: (limit: number) => `Your loyalty programme now has ${limit} customers, the limit of your plan. New sign-ups will be refused.`,
    body: (situation: string, url: string) =>
      `Hello,\n\n${situation}\n\nYour current customers keep their cards and points. To welcome new customers, upgrade your plan: ${url}\n\nThe FOVE team`,
  },
  ar: {
    blockedSubject: (tenant: string) => `لم يتمكّن عميل من الانضمام إلى ${tenant}`,
    reachedSubject: (tenant: string, limit: number) => `بلغ ${tenant} حدّ ${limit} عميل`,
    blocked: (limit: number) =>
      `حاول عميل للتو الانضمام إلى برنامج الولاء الخاص بك، لكن باقتك محدودة بـ ${limit} عميل. ظهرت له رسالة تفيد بأن التسجيل مغلق مؤقتًا.`,
    reached: (limit: number) => `يضم برنامج الولاء الخاص بك الآن ${limit} عميل، وهو حدّ باقتك. سيتم رفض التسجيلات القادمة.`,
    body: (situation: string, url: string) =>
      `مرحبًا،\n\n${situation}\n\nيحتفظ عملاؤك الحاليون ببطاقاتهم ونقاطهم. لاستقبال عملاء جدد، انتقل إلى باقة أعلى: ${url}\n\nفريق FOVE`,
  },
  es: {
    blockedSubject: (tenant: string) => `Un cliente no ha podido unirse a ${tenant}`,
    reachedSubject: (tenant: string, limit: number) => `${tenant} ha alcanzado ${limit} clientes`,
    blocked: (limit: number) =>
      `Un cliente acaba de intentar unirse a tu programa de fidelidad, pero tu plan está limitado a ${limit} clientes. Ha visto un mensaje que indica que las inscripciones están cerradas temporalmente.`,
    reached: (limit: number) => `Tu programa de fidelidad tiene ya ${limit} clientes, el límite de tu plan. Se rechazarán las próximas inscripciones.`,
    body: (situation: string, url: string) =>
      `Hola:\n\n${situation}\n\nTus clientes actuales conservan sus tarjetas y sus puntos. Para recibir nuevos clientes, cambia a un plan superior: ${url}\n\nEl equipo de FOVE`,
  },
} satisfies Record<Locale, unknown>;

export function quotaAlertMessage(locale: Locale, p: { reason: "blocked" | "reached"; tenantName: string; limit: number; billingUrl: string }): Content {
  const t = QUOTA[locale];
  const blocked = p.reason === "blocked";
  return {
    subject: blocked ? t.blockedSubject(p.tenantName) : t.reachedSubject(p.tenantName, p.limit),
    text: t.body(blocked ? t.blocked(p.limit) : t.reached(p.limit), p.billingUrl),
  };
}

// --- Partenaires --------------------------------------------------------------

const PARTNER = {
  fr: {
    receivedSubject: "Candidature reçue · Programme Partenaires FOVE",
    received: (name: string, code: string) =>
      `Bonjour ${name},\n\nNous avons bien reçu votre candidature pour rejoindre le programme de partenaires commerciaux FOVE.\n\nNotre équipe examine votre dossier sous 24 à 48 heures. Dès validation, vous recevrez votre lien commercial personnalisé (${code}) et l'accès à votre espace de suivi.\n\nL'équipe FOVE\nhttps://fove.digital`,
    commissionSubject: (amount: string) => `Commission enregistrée · ${amount} générés`,
    commission: (name: string, amount: string, rate: string, days: number, url: string) =>
      `Félicitations ${name} !\n\nUne entreprise que vous avez recommandée vient de souscrire un abonnement payant sur FOVE.\n\nMontant de la commission : ${amount} (${rate}%).\nStatut : En cours de validation (délai de garantie de ${days} jours).\n\nRetrouvez le détail dans votre espace :\n${url}`,
    approvedSubject: "Félicitations · Votre partenariat FOVE est validé !",
    approvedHeading: "Votre partenariat est validé",
    approved: (name: string) => `Bonjour ${name},\n\nNous avons le plaisir de vous confirmer que votre candidature au programme Partenaires FOVE a été validée.`,
    approvedCode: (code: string, link: string) => `Votre code commercial : ${code}\nVotre lien : ${link}`,
    approvedCta: "Accédez à votre espace partenaire dès maintenant :",
    approvedButton: "Accéder à mon espace partenaire",
    sign: "L'équipe FOVE",
    rejectedSubject: "Mise à jour concernant votre candidature FOVE",
    rejected: (name: string, reason: string) =>
      `Bonjour ${name},\n\nAprès examen de votre dossier, nous ne sommes pas en mesure de valider votre candidature au programme de partenariat commercial FOVE à ce stade.\n\nMotif : ${reason}\n\nNous vous remercions de l'intérêt porté à FOVE.\nL'équipe FOVE`,
    payoutSubject: (amount: string) => `Virement effectué · ${amount}`,
    payout: (name: string, amount: string, reference: string) =>
      `Bonjour ${name},\n\nVotre virement de ${amount} a été effectué avec succès.\n\nRéférence de transaction : ${reference}\n\nMerci de votre partenariat avec FOVE !\nhttps://fove.digital/partner`,
    bankTransfer: "Règlement bancaire",
  },
  en: {
    receivedSubject: "Application received · FOVE Partner Programme",
    received: (name: string, code: string) =>
      `Hello ${name},\n\nWe've received your application to join the FOVE sales partner programme.\n\nOur team reviews applications within 24 to 48 hours. Once approved, you'll get your personal referral link (${code}) and access to your partner dashboard.\n\nThe FOVE team\nhttps://fove.digital`,
    commissionSubject: (amount: string) => `Commission recorded · ${amount} earned`,
    commission: (name: string, amount: string, rate: string, days: number, url: string) =>
      `Congratulations ${name}!\n\nA business you referred has just subscribed to a paid FOVE plan.\n\nCommission: ${amount} (${rate}%).\nStatus: pending validation (${days}-day guarantee period).\n\nSee the details in your dashboard:\n${url}`,
    approvedSubject: "Congratulations · Your FOVE partnership is approved!",
    approvedHeading: "Your partnership is approved",
    approved: (name: string) => `Hello ${name},\n\nWe're pleased to confirm that your application to the FOVE Partner Programme has been approved.`,
    approvedCode: (code: string, link: string) => `Your referral code: ${code}\nYour link: ${link}`,
    approvedCta: "Open your partner dashboard now:",
    approvedButton: "Open my partner dashboard",
    sign: "The FOVE team",
    rejectedSubject: "Update on your FOVE application",
    rejected: (name: string, reason: string) =>
      `Hello ${name},\n\nAfter reviewing your application, we're unable to approve it for the FOVE sales partner programme at this stage.\n\nReason: ${reason}\n\nThank you for your interest in FOVE.\nThe FOVE team`,
    payoutSubject: (amount: string) => `Payout sent · ${amount}`,
    payout: (name: string, amount: string, reference: string) =>
      `Hello ${name},\n\nYour payout of ${amount} has been sent.\n\nTransaction reference: ${reference}\n\nThank you for partnering with FOVE!\nhttps://fove.digital/partner`,
    bankTransfer: "Bank transfer",
  },
  ar: {
    receivedSubject: "تم استلام طلبك · برنامج شركاء FOVE",
    received: (name: string, code: string) =>
      `مرحبًا ${name}،\n\nاستلمنا طلبك للانضمام إلى برنامج الشركاء التجاريين لـ FOVE.\n\nيراجع فريقنا ملفك خلال 24 إلى 48 ساعة. بعد الموافقة، ستحصل على رابطك التجاري الخاص (${code}) وعلى الوصول إلى مساحة المتابعة.\n\nفريق FOVE\nhttps://fove.digital`,
    commissionSubject: (amount: string) => `تم تسجيل عمولة · ${amount}`,
    commission: (name: string, amount: string, rate: string, days: number, url: string) =>
      `تهانينا ${name}!\n\nاشترك للتو نشاط تجاري أوصيت به في باقة مدفوعة على FOVE.\n\nمبلغ العمولة: ${amount} (${rate}%).\nالحالة: قيد التحقق (فترة ضمان مدتها ${days} يومًا).\n\nاطّلع على التفاصيل في مساحتك:\n${url}`,
    approvedSubject: "تهانينا · تمت الموافقة على شراكتك مع FOVE!",
    approvedHeading: "تمت الموافقة على شراكتك",
    approved: (name: string) => `مرحبًا ${name}،\n\nيسعدنا أن نؤكد لك الموافقة على طلبك للانضمام إلى برنامج شركاء FOVE.`,
    approvedCode: (code: string, link: string) => `رمزك التجاري: ${code}\nرابطك: ${link}`,
    approvedCta: "ادخل إلى مساحة الشريك الآن:",
    approvedButton: "الدخول إلى مساحة الشريك",
    sign: "فريق FOVE",
    rejectedSubject: "مستجدات بخصوص طلبك لدى FOVE",
    rejected: (name: string, reason: string) =>
      `مرحبًا ${name}،\n\nبعد دراسة ملفك، لا يمكننا الموافقة على طلبك للانضمام إلى برنامج الشراكة التجارية لـ FOVE في الوقت الحالي.\n\nالسبب: ${reason}\n\nنشكرك على اهتمامك بـ FOVE.\nفريق FOVE`,
    payoutSubject: (amount: string) => `تم التحويل · ${amount}`,
    payout: (name: string, amount: string, reference: string) =>
      `مرحبًا ${name}،\n\nتم تحويل مبلغ ${amount} بنجاح.\n\nمرجع العملية: ${reference}\n\nشكرًا لشراكتك مع FOVE!\nhttps://fove.digital/partner`,
    bankTransfer: "تحويل بنكي",
  },
  es: {
    receivedSubject: "Solicitud recibida · Programa de Socios FOVE",
    received: (name: string, code: string) =>
      `Hola ${name}:\n\nHemos recibido tu solicitud para unirte al programa de socios comerciales de FOVE.\n\nNuestro equipo revisa tu expediente en 24 a 48 horas. Una vez aprobada, recibirás tu enlace comercial personal (${code}) y el acceso a tu panel de seguimiento.\n\nEl equipo de FOVE\nhttps://fove.digital`,
    commissionSubject: (amount: string) => `Comisión registrada · ${amount} generados`,
    commission: (name: string, amount: string, rate: string, days: number, url: string) =>
      `¡Enhorabuena, ${name}!\n\nUna empresa que recomendaste acaba de contratar un plan de pago en FOVE.\n\nImporte de la comisión: ${amount} (${rate}%).\nEstado: pendiente de validación (periodo de garantía de ${days} días).\n\nConsulta el detalle en tu panel:\n${url}`,
    approvedSubject: "Enhorabuena · ¡Tu alianza con FOVE está aprobada!",
    approvedHeading: "Tu alianza está aprobada",
    approved: (name: string) => `Hola ${name}:\n\nNos complace confirmarte que tu solicitud al Programa de Socios FOVE ha sido aprobada.`,
    approvedCode: (code: string, link: string) => `Tu código comercial: ${code}\nTu enlace: ${link}`,
    approvedCta: "Accede ya a tu panel de socio:",
    approvedButton: "Acceder a mi panel de socio",
    sign: "El equipo de FOVE",
    rejectedSubject: "Novedades sobre tu solicitud en FOVE",
    rejected: (name: string, reason: string) =>
      `Hola ${name}:\n\nTras revisar tu expediente, por ahora no podemos aprobar tu solicitud al programa de socios comerciales de FOVE.\n\nMotivo: ${reason}\n\nGracias por tu interés en FOVE.\nEl equipo de FOVE`,
    payoutSubject: (amount: string) => `Transferencia realizada · ${amount}`,
    payout: (name: string, amount: string, reference: string) =>
      `Hola ${name}:\n\nTu transferencia de ${amount} se ha realizado correctamente.\n\nReferencia de la operación: ${reference}\n\n¡Gracias por colaborar con FOVE!\nhttps://fove.digital/partner`,
    bankTransfer: "Transferencia bancaria",
  },
} satisfies Record<Locale, unknown>;

export const partnerEmails = (locale: Locale) => PARTNER[locale];

export function partnerApprovedMessage(locale: Locale, p: { name: string; code: string; publicLink: string; dashboardUrl: string }): Content {
  const t = PARTNER[locale];
  const intro = t.approved(p.name);
  const code = t.approvedCode(p.code, p.publicLink);
  return {
    subject: t.approvedSubject,
    text: `${intro}\n\n${code}\n\n${t.approvedCta}\n${p.dashboardUrl}\n\n${t.sign}`,
    html: emailHtml(locale, {
      title: t.approvedSubject,
      heading: t.approvedHeading,
      paragraphs: [intro, code, t.approvedCta],
      button: { label: t.approvedButton, url: p.dashboardUrl },
      footer: t.sign,
      color: "#000000",
    }),
  };
}
