/**
 * Emails transactionnels traduits. Chaque fonction renvoie sujet, texte et,
 * pour les emails avec bouton, une version HTML (sens de lecture inversé pour l'arabe).
 * Les notifications internes à l'équipe FOVE ont leur propre gabarit (TeamAlertService, teamHtml).
 */
import type { EmailMessage } from "../notifications/email.service";
import type { Locale } from "./locale";
import { emailHtml, textToBrandedHtml } from "./email-layout";

export { emailHtml, escapeHtml } from "./email-layout";

type Content = Omit<EmailMessage, "to">;

// --- Compte ------------------------------------------------------------------

/** Code de connexion à l'espace FOVE (commerçants, équipes, admin, partenaires) : aucun mot de passe. */
const LOGIN_CODE = {
  fr: {
    subject: (code: string) => `${code} : votre code de connexion FOVE`,
    text: (code: string) =>
      `Bonjour,\n\nVoici votre code de connexion à FOVE :\n\n${code}\n\nIl est valable 10 minutes. Si vous n'avez rien demandé, ignorez ce message : personne ne peut se connecter sans ce code.\n\nL'équipe FOVE`,
  },
  en: {
    subject: (code: string) => `${code}: your FOVE sign-in code`,
    text: (code: string) =>
      `Hello,\n\nHere is your FOVE sign-in code:\n\n${code}\n\nIt is valid for 10 minutes. If you didn't ask for it, ignore this message: nobody can sign in without this code.\n\nThe FOVE team`,
  },
  ar: {
    subject: (code: string) => `${code}: رمز الدخول إلى FOVE`,
    text: (code: string) =>
      `مرحبًا،\n\nإليك رمز الدخول إلى FOVE:\n\n${code}\n\nالرمز صالح لمدة 10 دقائق. إذا لم تطلبه، تجاهل هذه الرسالة: لا يمكن لأحد الدخول دون هذا الرمز.\n\nفريق FOVE`,
  },
  es: {
    subject: (code: string) => `${code}: tu código de acceso a FOVE`,
    text: (code: string) =>
      `Hola:\n\nEste es tu código de acceso a FOVE:\n\n${code}\n\nEs válido durante 10 minutos. Si no lo has pedido, ignora este mensaje: nadie puede entrar sin este código.\n\nEl equipo de FOVE`,
  },
} satisfies Record<Locale, unknown>;

export function userLoginCodeMessage(locale: Locale, code: string): Content {
  const t = LOGIN_CODE[locale];
  return { subject: t.subject(code), text: t.text(code), html: textToBrandedHtml(t.text(code), t.subject(code), locale) };
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
  return { locale, subject: t.otpSubject(tenantName), text: t.otp(code) };
}

// --- Compte client FOVE -------------------------------------------------------

const CLIENT_ACCOUNT = {
  fr: {
    subject: "Votre code de connexion FOVE",
    text: (code: string) =>
      `Votre code de connexion à votre compte FOVE : ${code}\nIl expire dans 10 minutes.\n\nSi vous n'avez pas demandé ce code, ignorez cet email : personne ne peut se connecter sans lui.`,
  },
  en: {
    subject: "Your FOVE sign-in code",
    text: (code: string) =>
      `Your FOVE account sign-in code: ${code}\nIt expires in 10 minutes.\n\nIf you didn't request this code, ignore this email: nobody can sign in without it.`,
  },
  ar: {
    subject: "رمز تسجيل الدخول إلى FOVE",
    text: (code: string) =>
      `رمز تسجيل الدخول إلى حسابك في FOVE: ${code}\nتنتهي صلاحيته خلال 10 دقائق.\n\nإذا لم تطلب هذا الرمز، فتجاهل هذه الرسالة: لا يمكن لأحد تسجيل الدخول بدونه.`,
  },
  es: {
    subject: "Tu código de acceso a FOVE",
    text: (code: string) =>
      `Tu código de acceso a tu cuenta FOVE: ${code}\nCaduca en 10 minutos.\n\nSi no has pedido este código, ignora este correo: nadie puede iniciar sesión sin él.`,
  },
} satisfies Record<Locale, unknown>;

const CLIENT_CONFIRM = {
  fr: {
    subject: "Confirmez votre email — FOVE",
    heading: "Votre carte est prête",
    body: "Confirmez votre adresse email pour retrouver toutes vos cartes FOVE, même sur un autre téléphone.",
    code: (code: string) => `Votre code de confirmation : ${code} (valable 10 minutes).`,
    button: "Confirmer mon email",
    footer: "Si vous n'avez pas créé de carte de fidélité, ignorez cet email : rien ne sera rattaché à votre adresse sans ce code.",
  },
  en: {
    subject: "Confirm your email — FOVE",
    heading: "Your card is ready",
    body: "Confirm your email address to find all your FOVE cards, even on another phone.",
    code: (code: string) => `Your confirmation code: ${code} (valid for 10 minutes).`,
    button: "Confirm my email",
    footer: "If you didn't create a loyalty card, ignore this email: nothing will be linked to your address without this code.",
  },
  ar: {
    subject: "أكّد بريدك الإلكتروني — FOVE",
    heading: "بطاقتك جاهزة",
    body: "أكّد عنوان بريدك الإلكتروني لتجد جميع بطاقاتك في FOVE، حتى على هاتف آخر.",
    code: (code: string) => `رمز التأكيد: ${code} (صالح لمدة 10 دقائق).`,
    button: "تأكيد بريدي الإلكتروني",
    footer: "إذا لم تُنشئ بطاقة ولاء، فتجاهل هذه الرسالة: لن يُربط أي شيء بعنوانك بدون هذا الرمز.",
  },
  es: {
    subject: "Confirma tu correo — FOVE",
    heading: "Tu tarjeta está lista",
    body: "Confirma tu dirección de correo para encontrar todas tus tarjetas FOVE, incluso en otro teléfono.",
    code: (code: string) => `Tu código de confirmación: ${code} (válido durante 10 minutos).`,
    button: "Confirmar mi correo",
    footer: "Si no has creado ninguna tarjeta de fidelidad, ignora este correo: no se vinculará nada a tu dirección sin este código.",
  },
} satisfies Record<Locale, unknown>;

/** Bienvenue après une inscription au scan : code à saisir, ou bouton qui le saisit à la place du client. */
export function clientConfirmMessage(locale: Locale, code: string, link: string): Content {
  const t = CLIENT_CONFIRM[locale];
  return {
    subject: t.subject,
    text: `${t.heading}\n\n${t.body}\n${t.code(code)}\n\n${link}\n\n${t.footer}`,
    html: emailHtml(locale, { title: t.subject, heading: t.heading, paragraphs: [t.body, t.code(code)], button: { label: t.button, url: link }, footer: t.footer }),
  };
}

const PARTNER_INVITE = {
  fr: {
    subject: (reached: boolean) => (reached ? "Plafond de parrainage atteint : devenez partenaire FOVE" : "Vous approchez de votre plafond de parrainage"),
    heading: "Vous recommandez FOVE avec succès",
    body: (reached: boolean, tenant: string) =>
      reached
        ? `${tenant} a atteint son plafond de crédit de parrainage pour cette année. Vos prochains filleuls gardent leur remise, mais vous ne gagnez plus de crédit avant le 1er janvier.`
        : `${tenant} approche de son plafond de crédit de parrainage pour cette année.`,
    offer: "Rejoignez le programme partenaires FOVE : vous toucherez une commission sur chaque abonnement de vos recommandations, sans plafond. Votre candidature est pré-remplie depuis votre page Parrainage.",
    button: "Devenir partenaire",
    footer: "Vous recevez cet email parce que votre commerce participe au programme de parrainage FOVE.",
  },
  en: {
    subject: (reached: boolean) => (reached ? "Referral cap reached: become a FOVE partner" : "You're approaching your referral cap"),
    heading: "You're successfully recommending FOVE",
    body: (reached: boolean, tenant: string) =>
      reached
        ? `${tenant} has reached its referral credit cap for this year. Your next referrals keep their discount, but you won't earn more credit before 1 January.`
        : `${tenant} is approaching its referral credit cap for this year.`,
    offer: "Join the FOVE partner programme: you'll earn a commission on every subscription you bring in, with no cap. Your application is pre-filled from your Referrals page.",
    button: "Become a partner",
    footer: "You're receiving this email because your business takes part in the FOVE referral programme.",
  },
  ar: {
    subject: (reached: boolean) => (reached ? "تم بلوغ سقف الإحالة: كن شريكًا لـ FOVE" : "أنت تقترب من سقف الإحالة"),
    heading: "أنت توصي بـ FOVE بنجاح",
    body: (reached: boolean, tenant: string) =>
      reached
        ? `بلغ ${tenant} سقف رصيد الإحالة لهذا العام. يحتفظ المُحالون القادمون بخصمهم، لكنك لن تربح رصيدًا إضافيًا قبل 1 يناير.`
        : `يقترب ${tenant} من سقف رصيد الإحالة لهذا العام.`,
    offer: "انضم إلى برنامج شركاء FOVE: ستحصل على عمولة عن كل اشتراك تجلبه، دون سقف. طلبك معبأ مسبقًا من صفحة الإحالة.",
    button: "كن شريكًا",
    footer: "تتلقى هذه الرسالة لأن متجرك يشارك في برنامج الإحالة من FOVE.",
  },
  es: {
    subject: (reached: boolean) => (reached ? "Límite de recomendaciones alcanzado: hazte socio de FOVE" : "Te acercas a tu límite de recomendaciones"),
    heading: "Estás recomendando FOVE con éxito",
    body: (reached: boolean, tenant: string) =>
      reached
        ? `${tenant} ha alcanzado su límite de crédito por recomendación de este año. Tus próximos recomendados conservan su descuento, pero no ganas más crédito antes del 1 de enero.`
        : `${tenant} se acerca a su límite de crédito por recomendación de este año.`,
    offer: "Únete al programa de socios de FOVE: cobrarás una comisión por cada suscripción que aportes, sin límite. Tu solicitud está rellenada desde tu página de Recomendaciones.",
    button: "Hacerme socio",
    footer: "Recibes este correo porque tu comercio participa en el programa de recomendación de FOVE.",
  },
} satisfies Record<Locale, unknown>;

/** Invitation au programme partenaires quand un parrain approche (80 %) ou atteint son plafond annuel. */
export function partnerInviteMessage(locale: Locale, p: { tenantName: string; reached: boolean; link: string }): Content {
  const t = PARTNER_INVITE[locale];
  return {
    subject: t.subject(p.reached),
    text: `${t.heading}\n\n${t.body(p.reached, p.tenantName)}\n${t.offer}\n\n${p.link}\n\n${t.footer}`,
    html: emailHtml(locale, { title: t.subject(p.reached), heading: t.heading, paragraphs: [t.body(p.reached, p.tenantName), t.offer], button: { label: t.button, url: p.link }, footer: t.footer }),
  };
}

const CLIENT_REMIND = {
  fr: {
    subject: "Confirmez votre email pour garder vos cartes partout — FOVE",
    heading: "Votre compte FOVE attend sa confirmation",
    body: "Confirmez votre adresse email pour retrouver toutes vos cartes de fidélité sur n'importe quel téléphone, et en ajouter chez d'autres commerces.",
    how: "Un geste suffit : continuez avec Google, ou recevez un code à 6 chiffres.",
    button: "Confirmer mon email",
    footer: "Vous n'avez pas créé de carte FOVE ? Ignorez cet email : rien ne sera rattaché à votre adresse sans confirmation.",
  },
  en: {
    subject: "Confirm your email to keep your cards everywhere — FOVE",
    heading: "Your FOVE account is waiting for confirmation",
    body: "Confirm your email address to find all your loyalty cards on any phone, and add cards at other businesses.",
    how: "It takes one step: continue with Google, or get a 6-digit code.",
    button: "Confirm my email",
    footer: "Didn't create a FOVE card? Ignore this email: nothing will be linked to your address without confirmation.",
  },
  ar: {
    subject: "أكّد بريدك الإلكتروني للاحتفاظ ببطاقاتك في كل مكان — FOVE",
    heading: "حسابك في FOVE بانتظار التأكيد",
    body: "أكّد عنوان بريدك الإلكتروني لتجد جميع بطاقات الولاء الخاصة بك على أي هاتف، ولإضافة بطاقات لدى متاجر أخرى.",
    how: "تكفي خطوة واحدة: تابع باستخدام Google، أو استلم رمزًا من 6 أرقام.",
    button: "تأكيد بريدي الإلكتروني",
    footer: "لم تُنشئ بطاقة FOVE؟ تجاهل هذه الرسالة: لن يُربط أي شيء بعنوانك بدون تأكيد.",
  },
  es: {
    subject: "Confirma tu correo para tener tus tarjetas en todas partes — FOVE",
    heading: "Tu cuenta FOVE espera su confirmación",
    body: "Confirma tu dirección de correo para encontrar todas tus tarjetas de fidelidad en cualquier teléfono y añadir tarjetas en otros comercios.",
    how: "Basta un paso: continúa con Google o recibe un código de 6 cifras.",
    button: "Confirmar mi correo",
    footer: "¿No has creado ninguna tarjeta FOVE? Ignora este correo: no se vinculará nada a tu dirección sin confirmación.",
  },
} satisfies Record<Locale, unknown>;

/** Relance d'un compte client non confirmé : bouton vers la connexion (Google ou nouveau code). */
export function clientConfirmReminderMessage(locale: Locale, link: string): Content {
  const t = CLIENT_REMIND[locale];
  return {
    subject: t.subject,
    text: `${t.heading}\n\n${t.body}\n${t.how}\n\n${link}\n\n${t.footer}`,
    html: emailHtml(locale, { title: t.subject, heading: t.heading, paragraphs: [t.body, t.how], button: { label: t.button, url: link }, footer: t.footer }),
  };
}

const CLIENT_INACTIVE = {
  fr: {
    subject: "Votre compte FOVE sera supprimé dans 30 jours",
    heading: "Vous voulez garder votre compte FOVE ?",
    body: (date: string) =>
      `Votre compte FOVE n'a pas été utilisé depuis longtemps : il sera supprimé le ${date}. Pour le garder, il suffit de vous connecter avant cette date.`,
    cards: "Vos cartes de fidélité ne seront pas supprimées : elles restent chez chaque commerce, avec vos points.",
    button: "Garder mon compte",
    footer: "Vous pouvez aussi ignorer cet email : votre compte sera alors supprimé automatiquement.",
  },
  en: {
    subject: "Your FOVE account will be deleted in 30 days",
    heading: "Do you want to keep your FOVE account?",
    body: (date: string) => `Your FOVE account hasn't been used for a long time: it will be deleted on ${date}. To keep it, just sign in before that date.`,
    cards: "Your loyalty cards will not be deleted: they stay with each business, with your points.",
    button: "Keep my account",
    footer: "You can also ignore this email: your account will then be deleted automatically.",
  },
  ar: {
    subject: "سيُحذف حسابك في FOVE خلال 30 يومًا",
    heading: "هل تريد الاحتفاظ بحسابك في FOVE؟",
    body: (date: string) => `لم يُستخدم حسابك في FOVE منذ مدة طويلة: سيُحذف بتاريخ ${date}. للاحتفاظ به، يكفي أن تسجّل الدخول قبل هذا التاريخ.`,
    cards: "لن تُحذف بطاقات الولاء الخاصة بك: تبقى لدى كل متجر مع نقاطك.",
    button: "الاحتفاظ بحسابي",
    footer: "يمكنك أيضًا تجاهل هذه الرسالة: سيُحذف حسابك عندها تلقائيًا.",
  },
  es: {
    subject: "Tu cuenta FOVE se eliminará dentro de 30 días",
    heading: "¿Quieres conservar tu cuenta FOVE?",
    body: (date: string) => `Tu cuenta FOVE lleva mucho tiempo sin usarse: se eliminará el ${date}. Para conservarla, basta con que inicies sesión antes de esa fecha.`,
    cards: "Tus tarjetas de fidelidad no se eliminarán: siguen en cada comercio, con tus puntos.",
    button: "Conservar mi cuenta",
    footer: "También puedes ignorar este correo: tu cuenta se eliminará automáticamente.",
  },
} satisfies Record<Locale, unknown>;

/** Prévenance avant suppression d'un compte client inactif. `date` est déjà formatée dans la langue. */
export function clientInactivityMessage(locale: Locale, date: string, link: string): Content {
  const t = CLIENT_INACTIVE[locale];
  return {
    subject: t.subject,
    text: `${t.heading}\n\n${t.body(date)}\n${t.cards}\n\n${link}\n\n${t.footer}`,
    html: emailHtml(locale, { title: t.subject, heading: t.heading, paragraphs: [t.body(date), t.cards], button: { label: t.button, url: link }, footer: t.footer }),
  };
}

export function clientLoginCodeMessage(locale: Locale, code: string): Content {
  const t = CLIENT_ACCOUNT[locale];
  return { subject: t.subject, text: t.text(code), html: textToBrandedHtml(t.text(code), t.subject, locale) };
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
    locale,
    subject: blocked ? t.blockedSubject(p.tenantName) : t.reachedSubject(p.tenantName, p.limit),
    text: t.body(blocked ? t.blocked(p.limit) : t.reached(p.limit), p.billingUrl),
  };
}

const UNVERIFIED_LIMIT = {
  fr: {
    subject: (tenant: string) => `Un client n'a pas pu rejoindre ${tenant}`,
    body: (limit: number, url: string) =>
      `Bonjour,\n\nUn client vient d'essayer de rejoindre votre programme de fidélité, mais votre commerce compte déjà ${limit} clients et votre adresse email n'est pas encore confirmée. Il a vu un message lui indiquant que les inscriptions sont momentanément fermées.\n\nConfirmez votre adresse email (lien reçu à l'inscription, ou bouton « Renvoyer l'email » dans votre espace) pour accueillir de nouveaux clients : ${url}\n\nVos clients actuels gardent leurs cartes et leurs points.\n\nL'équipe FOVE`,
  },
  en: {
    subject: (tenant: string) => `A customer couldn't join ${tenant}`,
    body: (limit: number, url: string) =>
      `Hello,\n\nA customer just tried to join your loyalty programme, but your business already has ${limit} customers and your email address isn't confirmed yet. They saw a message saying sign-ups are temporarily closed.\n\nConfirm your email address (link received at sign-up, or the "Resend email" button in your space) to welcome new customers: ${url}\n\nYour current customers keep their cards and points.\n\nThe FOVE team`,
  },
  ar: {
    subject: (tenant: string) => `لم يتمكّن عميل من الانضمام إلى ${tenant}`,
    body: (limit: number, url: string) =>
      `مرحبًا،\n\nحاول عميل للتو الانضمام إلى برنامج الولاء الخاص بك، لكن متجرك يضم بالفعل ${limit} عميل ولم يتم تأكيد بريدك الإلكتروني بعد. ظهرت له رسالة تفيد بأن التسجيل مغلق مؤقتًا.\n\nأكّد بريدك الإلكتروني (الرابط المستلم عند التسجيل، أو زر «إعادة إرسال البريد» في مساحتك) لاستقبال عملاء جدد: ${url}\n\nيحتفظ عملاؤك الحاليون ببطاقاتهم ونقاطهم.\n\nفريق FOVE`,
  },
  es: {
    subject: (tenant: string) => `Un cliente no ha podido unirse a ${tenant}`,
    body: (limit: number, url: string) =>
      `Hola:\n\nUn cliente acaba de intentar unirse a tu programa de fidelidad, pero tu comercio ya tiene ${limit} clientes y tu correo aún no está confirmado. Ha visto un mensaje que indica que las inscripciones están cerradas temporalmente.\n\nConfirma tu correo (enlace recibido al registrarte, o el botón «Reenviar el correo» en tu espacio) para recibir nuevos clientes: ${url}\n\nTus clientes actuales conservan sus tarjetas y sus puntos.\n\nEl equipo de FOVE`,
  },
} satisfies Record<Locale, unknown>;

/** Inscription refusée par la limite douce : le propriétaire n'a pas confirmé son email. */
export function unverifiedLimitMessage(locale: Locale, p: { tenantName: string; limit: number; appUrl: string }): Content {
  const t = UNVERIFIED_LIMIT[locale];
  return { locale, subject: t.subject(p.tenantName), text: t.body(p.limit, p.appUrl) };
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
    approvedCta: "Connectez-vous avec cette adresse email (un code vous est envoyé, aucun mot de passe) pour ouvrir votre espace partenaire :",
    approvedButton: "Accéder à mon espace partenaire",
    sign: "L'équipe FOVE",
    rejectedSubject: "Mise à jour concernant votre candidature FOVE",
    rejected: (name: string, reason: string) =>
      `Bonjour ${name},\n\nAprès examen de votre dossier, nous ne sommes pas en mesure de valider votre candidature au programme de partenariat commercial FOVE à ce stade.\n\nMotif : ${reason}\n\nNous vous remercions de l'intérêt porté à FOVE.\nL'équipe FOVE`,
    payoutSubject: (amount: string) => `Virement effectué · ${amount}`,
    payout: (name: string, amount: string, reference: string) =>
      `Bonjour ${name},\n\nVotre virement de ${amount} a été effectué avec succès.\n\nRéférence de transaction : ${reference}\n\nMerci de votre partenariat avec FOVE !\nhttps://fove.digital/partner`,
    bankTransfer: "Règlement bancaire",
    scheduledSubject: (amount: string) => `Votre versement du mois · ${amount}`,
    scheduled: (name: string, amount: string, lines: string, url: string) =>
      `Bonjour ${name},\n\nVos commissions devenues disponibles le mois dernier ont été regroupées en un versement de ${amount}, que vous recevrez avant le 10 du mois (frais de transfert pris en charge par FOVE).\n\n${lines}\n\nDétail et historique dans votre espace :\n${url}\n\nL'équipe FOVE`,
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
    approvedCta: "Sign in with this email address (a code is sent to you, no password) to open your partner space:",
    approvedButton: "Open my partner dashboard",
    sign: "The FOVE team",
    rejectedSubject: "Update on your FOVE application",
    rejected: (name: string, reason: string) =>
      `Hello ${name},\n\nAfter reviewing your application, we're unable to approve it for the FOVE sales partner programme at this stage.\n\nReason: ${reason}\n\nThank you for your interest in FOVE.\nThe FOVE team`,
    payoutSubject: (amount: string) => `Payout sent · ${amount}`,
    payout: (name: string, amount: string, reference: string) =>
      `Hello ${name},\n\nYour payout of ${amount} has been sent.\n\nTransaction reference: ${reference}\n\nThank you for partnering with FOVE!\nhttps://fove.digital/partner`,
    bankTransfer: "Bank transfer",
    scheduledSubject: (amount: string) => `Your payout this month · ${amount}`,
    scheduled: (name: string, amount: string, lines: string, url: string) =>
      `Hello ${name},\n\nThe commissions that became available last month have been grouped into a payout of ${amount}, which you will receive before the 10th of the month (transfer fees covered by FOVE).\n\n${lines}\n\nDetails and history in your space:\n${url}\n\nThe FOVE team`,
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
    approvedCta: "سجّل الدخول بهذا البريد الإلكتروني (يُرسل إليك رمز، دون كلمة مرور) لفتح مساحة الشريك:",
    approvedButton: "الدخول إلى مساحة الشريك",
    sign: "فريق FOVE",
    rejectedSubject: "مستجدات بخصوص طلبك لدى FOVE",
    rejected: (name: string, reason: string) =>
      `مرحبًا ${name}،\n\nبعد دراسة ملفك، لا يمكننا الموافقة على طلبك للانضمام إلى برنامج الشراكة التجارية لـ FOVE في الوقت الحالي.\n\nالسبب: ${reason}\n\nنشكرك على اهتمامك بـ FOVE.\nفريق FOVE`,
    payoutSubject: (amount: string) => `تم التحويل · ${amount}`,
    payout: (name: string, amount: string, reference: string) =>
      `مرحبًا ${name}،\n\nتم تحويل مبلغ ${amount} بنجاح.\n\nمرجع العملية: ${reference}\n\nشكرًا لشراكتك مع FOVE!\nhttps://fove.digital/partner`,
    bankTransfer: "تحويل بنكي",
    scheduledSubject: (amount: string) => `دفعتك لهذا الشهر · ${amount}`,
    scheduled: (name: string, amount: string, lines: string, url: string) =>
      `مرحبًا ${name}،\n\nجُمعت عمولاتك التي أصبحت متاحة الشهر الماضي في دفعة بقيمة ${amount}، ستصلك قبل اليوم العاشر من الشهر (رسوم التحويل على حساب FOVE).\n\n${lines}\n\nالتفاصيل والسجل في مساحتك:\n${url}\n\nفريق FOVE`,
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
    approvedCta: "Inicia sesión con esta dirección de correo (te enviamos un código, sin contraseña) para abrir tu espacio de socio:",
    approvedButton: "Acceder a mi panel de socio",
    sign: "El equipo de FOVE",
    rejectedSubject: "Novedades sobre tu solicitud en FOVE",
    rejected: (name: string, reason: string) =>
      `Hola ${name}:\n\nTras revisar tu expediente, por ahora no podemos aprobar tu solicitud al programa de socios comerciales de FOVE.\n\nMotivo: ${reason}\n\nGracias por tu interés en FOVE.\nEl equipo de FOVE`,
    payoutSubject: (amount: string) => `Transferencia realizada · ${amount}`,
    payout: (name: string, amount: string, reference: string) =>
      `Hola ${name}:\n\nTu transferencia de ${amount} se ha realizado correctamente.\n\nReferencia de la operación: ${reference}\n\n¡Gracias por colaborar con FOVE!\nhttps://fove.digital/partner`,
    bankTransfer: "Transferencia bancaria",
    scheduledSubject: (amount: string) => `Tu pago de este mes · ${amount}`,
    scheduled: (name: string, amount: string, lines: string, url: string) =>
      `Hola ${name}:\n\nLas comisiones que pasaron a estar disponibles el mes pasado se han agrupado en un pago de ${amount}, que recibirás antes del día 10 del mes (gastos de transferencia a cargo de FOVE).\n\n${lines}\n\nDetalle e historial en tu espacio:\n${url}\n\nEl equipo de FOVE`,
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
    }),
  };
}
