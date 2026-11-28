/**
 * Traduction des messages d'erreur de l'API. Le code (`error.code`) ne change
 * jamais ; seul le texte lisible suit la langue de la requête. Les messages
 * sont écrits en français dans le code : ce catalogue les retrouve tels quels
 * (ou par motif pour ceux qui contiennent une valeur). Un message absent du
 * catalogue reste en français.
 */
import type { Locale } from "./locale";

type Tr = [en: string, ar: string, es: string];
const IDX = { en: 0, ar: 1, es: 2 } as const;

const EXACT: Record<string, Tr> = {
  // Génériques
  "Action non autorisée": ["Action not allowed", "إجراء غير مسموح به", "Acción no permitida"],
  "Authentification requise": ["Authentication required", "يلزم تسجيل الدخول", "Se requiere autenticación"],
  "Trop de requêtes, réessayez dans un instant.": ["Too many requests, please try again shortly.", "طلبات كثيرة جدًا، أعد المحاولة بعد قليل.", "Demasiadas solicitudes, inténtalo de nuevo en un momento."],
  "Erreur interne": ["Internal error", "خطأ داخلي", "Error interno"],
  "Données invalides": ["Invalid data", "بيانات غير صالحة", "Datos no válidos"],
  // Comptes et accès
  "Vous n'êtes pas membre de cette entreprise": ["You are not a member of this business", "لست عضوًا في هذا النشاط التجاري", "No eres miembro de esta empresa"],
  "Patientez une minute avant de redemander un code": ["Wait a minute before requesting a new code", "انتظر دقيقة قبل طلب رمز جديد", "Espera un minuto antes de pedir un nuevo código"],
  "Fonction indisponible sur une caisse": ["Not available on a till", "غير متاح على الصندوق", "No disponible en una caja"],
  "Caisse verrouillée : saisissez votre code": ["Till locked: enter your code", "الصندوق مقفل: أدخل رمزك", "Caja bloqueada: escribe tu código"],
  "Le code caisse fait 4 chiffres": ["The till code has 4 digits", "رمز الصندوق من 4 أرقام", "El código de caja tiene 4 cifras"],
  "Choisissez un code moins facile à deviner": ["Choose a code that's harder to guess", "اختر رمزًا يصعب تخمينه", "Elige un código más difícil de adivinar"],
  "Trop d'essais : code bloqué 15 minutes": ["Too many attempts: code blocked for 15 minutes", "محاولات كثيرة: الرمز محظور لمدة 15 دقيقة", "Demasiados intentos: código bloqueado 15 minutos"],
  "Cet appareil n'est pas une caisse": ["This device is not a till", "هذا الجهاز ليس صندوقًا", "Este dispositivo no es una caja"],
  "Réservé au propriétaire et aux gérants": ["Owner and managers only", "مخصص للمالك والمديرين", "Solo para el propietario y los gerentes"],
  "Trop de codes demandés aujourd'hui : réessayez demain": ["Too many codes requested today: try again tomorrow", "طلبت رموزًا كثيرة اليوم: أعد المحاولة غدًا", "Demasiados códigos solicitados hoy: inténtalo mañana"],
  "Trop de candidatures envoyées depuis cette connexion : réessayez demain": ["Too many applications sent from this connection: try again tomorrow", "أُرسلت طلبات كثيرة من هذا الاتصال: أعد المحاولة غدًا", "Demasiadas solicitudes enviadas desde esta conexión: inténtalo mañana"],
  "Candidature en cours d'examen par l'équipe FOVE": ["Application under review by the FOVE team", "الطلب قيد المراجعة من فريق FOVE", "Solicitud en revisión por el equipo de FOVE"],
  "Espace partenaire suspendu : contactez l'équipe FOVE": ["Partner space suspended: contact the FOVE team", "مساحة الشريك معلّقة: تواصل مع فريق FOVE", "Espacio de socio suspendido: contacta con el equipo de FOVE"],
  "Invitation invalide": ["Invalid invitation", "دعوة غير صالحة", "Invitación no válida"],
  "Invitation invalide ou expirée": ["Invalid or expired invitation", "دعوة غير صالحة أو منتهية الصلاحية", "Invitación no válida o caducada"],
  "Invitation déjà utilisée": ["Invitation already used", "تم استخدام الدعوة بالفعل", "Invitación ya utilizada"],
  "Connectez-vous avec l'adresse invitée pour accepter": ["Sign in with the invited address to accept", "سجّل الدخول بالعنوان المدعو لقبول الدعوة", "Inicia sesión con la dirección invitada para aceptar"],
  "Nom requis": ["Name required", "الاسم مطلوب", "Nombre obligatorio"],
  "Code à 6 chiffres": ["6-digit code", "رمز من 6 أرقام", "Código de 6 cifras"],
  "Compte suspendu": ["Account suspended", "الحساب موقوف", "Cuenta suspendida"],
  "Compte suspendu : contactez le support FOVE": ["Account suspended: contact FOVE support", "الحساب موقوف: تواصل مع دعم FOVE", "Cuenta suspendida: contacta con el soporte de FOVE"],
  "Vérifiez votre adresse email pour accéder à cette fonction": ["Verify your email address to use this feature", "أكّد بريدك الإلكتروني للوصول إلى هذه الميزة", "Verifica tu correo para acceder a esta función"],
  "En-tête anti-CSRF manquant": ["Missing anti-CSRF header", "ترويسة الحماية من CSRF مفقودة", "Falta la cabecera anti-CSRF"],
  "Aucune entreprise sélectionnée": ["No business selected", "لم يتم اختيار أي نشاط تجاري", "Ninguna empresa seleccionada"],
  "Accès support en lecture seule": ["Support access is read-only", "وصول الدعم للقراءة فقط", "El acceso de soporte es de solo lectura"],
  "Accès support expiré": ["Support access expired", "انتهت صلاحية وصول الدعم", "El acceso de soporte ha caducado"],
  "Aucun accès support en cours": ["No active support access", "لا يوجد وصول دعم نشط", "No hay ningún acceso de soporte activo"],
  "Seul un propriétaire peut modifier un propriétaire": ["Only an owner can change an owner", "لا يمكن تعديل مالك إلا من قِبل مالك", "Solo un propietario puede modificar a un propietario"],
  "L'entreprise doit garder au moins un propriétaire": ["The business must keep at least one owner", "يجب أن يحتفظ النشاط التجاري بمالك واحد على الأقل", "La empresa debe conservar al menos un propietario"],
  "Vous ne pouvez pas modifier votre propre accès": ["You can't change your own access", "لا يمكنك تعديل صلاحياتك الخاصة", "No puedes modificar tu propio acceso"],
  "Cette personne fait déjà partie de l'équipe": ["This person is already on the team", "هذا الشخص عضو في الفريق بالفعل", "Esta persona ya forma parte del equipo"],
  "Établissement inconnu": ["Unknown location", "فرع غير معروف", "Establecimiento desconocido"],
  "Établissement hors de votre périmètre": ["Location outside your scope", "الفرع خارج نطاق صلاحياتك", "Establecimiento fuera de tu ámbito"],
  "Précisez l'établissement de l'opération": ["Specify the location for this operation", "حدّد فرع العملية", "Indica el establecimiento de la operación"],
  "Ce sous-domaine est déjà pris, choisissez-en un autre": ["This subdomain is taken, choose another one", "هذا النطاق الفرعي مستخدم، اختر غيره", "Este subdominio ya está en uso, elige otro"],
  "Cette adresse est déjà prise, choisissez-en une autre": ["This address is taken, choose another one", "هذا العنوان مستخدم، اختر غيره", "Esta dirección ya está en uso, elige otra"],
  // Clés API, webhooks, widget
  "Clé API invalide": ["Invalid API key", "مفتاح API غير صالح", "Clave API no válida"],
  "Clé API secrète requise (Authorization: Bearer fove_sk_…)": ["Secret API key required (Authorization: Bearer fove_sk_…)", "مفتاح API السري مطلوب (Authorization: Bearer fove_sk_…)", "Se requiere la clave API secreta (Authorization: Bearer fove_sk_…)"],
  "Clé publique invalide": ["Invalid public key", "مفتاح عام غير صالح", "Clave pública no válida"],
  "Clé publique requise": ["Public key required", "المفتاح العام مطلوب", "Se requiere la clave pública"],
  "Domaine non autorisé pour cette clé": ["Domain not allowed for this key", "النطاق غير مسموح به لهذا المفتاح", "Dominio no autorizado para esta clave"],
  "Choisissez au moins un scope": ["Choose at least one scope", "اختر نطاق صلاحية واحدًا على الأقل", "Elige al menos un scope"],
  "Une clé publique n'a aucun scope": ["A public key has no scopes", "المفتاح العام لا يملك أي نطاق صلاحية", "Una clave pública no tiene scopes"],
  "Indiquez les domaines autorisés du widget": ["Enter the widget's allowed domains", "أدخل النطاقات المسموح بها للأداة", "Indica los dominios autorizados del widget"],
  "Clé d'idempotence déjà utilisée pour une autre opération": ["Idempotency key already used for another operation", "مفتاح عدم التكرار مستخدم لعملية أخرى", "Clave de idempotencia ya usada en otra operación"],
  "En-tête Idempotency-Key requis (8 à 120 caractères)": ["Idempotency-Key header required (8 to 120 characters)", "ترويسة Idempotency-Key مطلوبة (من 8 إلى 120 حرفًا)", "Se requiere la cabecera Idempotency-Key (de 8 a 120 caracteres)"],
  "Clé déjà utilisée avec une autre requête": ["Key already used with another request", "المفتاح مستخدم مع طلب آخر", "Clave ya usada con otra solicitud"],
  "externalId, email ou phone requis": ["externalId, email or phone required", "يلزم externalId أو email أو phone", "Se requiere externalId, email o phone"],
  "HTTPS requis": ["HTTPS required", "يلزم HTTPS", "Se requiere HTTPS"],
  "Signature invalide": ["Invalid signature", "توقيع غير صالح", "Firma no válida"],
  "Signature manquante": ["Missing signature", "التوقيع مفقود", "Falta la firma"],
  // Offre et facturation
  "Cette fonction n'est pas incluse dans votre offre": ["This feature isn't included in your plan", "هذه الميزة غير مشمولة في باقتك", "Esta función no está incluida en tu plan"],
  "L'API n'est pas incluse dans votre offre": ["The API isn't included in your plan", "واجهة API غير مشمولة في باقتك", "La API no está incluida en tu plan"],
  "Cette offre ne s'achète pas en ligne": ["This plan can't be bought online", "لا يمكن شراء هذه الباقة عبر الإنترنت", "Este plan no se puede comprar en línea"],
  "Les nouvelles souscriptions sont annuelles.": ["New subscriptions are yearly.", "الاشتراكات الجديدة سنوية.", "Las nuevas suscripciones son anuales."],
  "Vous êtes déjà sur cette offre": ["You're already on this plan", "أنت مشترك في هذه الباقة بالفعل", "Ya tienes este plan"],
  "Aucun abonnement payant à résilier": ["No paid subscription to cancel", "لا يوجد اشتراك مدفوع لإلغائه", "No hay ninguna suscripción de pago que cancelar"],
  "Aucune résiliation en cours à annuler": ["No pending cancellation to undo", "لا يوجد إلغاء جارٍ للتراجع عنه", "No hay ninguna cancelación en curso que deshacer"],
  "Aucun changement d’offre programmé": ["No scheduled plan change", "لا يوجد تغيير باقة مجدول", "No hay ningún cambio de plan programado"],
  "Votre abonnement est géré par l’équipe FOVE : contactez-nous pour le modifier.": ["Your subscription is managed by the FOVE team: contact us to change it.", "يدير فريق FOVE اشتراكك: تواصل معنا لتعديله.", "Tu suscripción la gestiona el equipo de FOVE: contáctanos para modificarla."],
  "Le paiement n’est pas encore disponible. Contactez FOVE.": ["Payment isn't available yet. Contact FOVE.", "الدفع غير متاح بعد. تواصل مع FOVE.", "El pago aún no está disponible. Contacta con FOVE."],
  "Stripe non configuré": ["Stripe not configured", "Stripe غير مهيأ", "Stripe no configurado"],
  "Tarif Stripe non configuré pour cette offre": ["Stripe price not set for this plan", "لم يتم ضبط سعر Stripe لهذه الباقة", "Precio de Stripe no configurado para este plan"],
  "Portail de facturation indisponible en mode simulé": ["Billing portal unavailable in simulated mode", "بوابة الفوترة غير متاحة في وضع المحاكاة", "Portal de facturación no disponible en modo simulado"],
  "Seul un paiement réussi peut être remboursé.": ["Only a successful payment can be refunded.", "لا يمكن استرداد إلا دفعة ناجحة.", "Solo se puede reembolsar un pago correcto."],
  "Cette entreprise est déjà inscrite sur la plateforme.": ["This business is already registered on the platform.", "هذا النشاط التجاري مسجّل بالفعل على المنصة.", "Esta empresa ya está registrada en la plataforma."],
  // Clients et cartes
  "Ce client a déjà une carte pour ce programme": ["This customer already has a card for this programme", "لدى هذا العميل بطاقة لهذا البرنامج بالفعل", "Este cliente ya tiene una tarjeta para este programa"],
  "Carte non active : opération impossible": ["Card not active: operation not possible", "البطاقة غير نشطة: لا يمكن تنفيذ العملية", "Tarjeta no activa: operación imposible"],
  "Client anonymisé : modification impossible": ["Anonymised customer: cannot be changed", "عميل مجهول الهوية: لا يمكن التعديل", "Cliente anonimizado: no se puede modificar"],
  "Email ou téléphone requis pour créer le client": ["Email or phone required to create the customer", "يلزم البريد الإلكتروني أو الهاتف لإنشاء العميل", "Se requiere correo o teléfono para crear el cliente"],
  "Téléphone ou email requis": ["Phone or email required", "الهاتف أو البريد الإلكتروني مطلوب", "Teléfono o correo obligatorio"],
  "Le téléphone appartient à un autre client : rattachement manuel requis": ["The phone belongs to another customer: manual linking required", "رقم الهاتف يخص عميلًا آخر: يلزم الربط يدويًا", "El teléfono pertenece a otro cliente: vinculación manual necesaria"],
  "Ces coordonnées appartiennent déjà à un autre client": ["These contact details already belong to another customer", "بيانات الاتصال هذه تخص عميلًا آخر بالفعل", "Estos datos ya pertenecen a otro cliente"],
  "Un client existe déjà avec ce téléphone, cet email ou cette référence": ["A customer already exists with this phone, email or reference", "يوجد عميل بهذا الهاتف أو البريد أو المرجع بالفعل", "Ya existe un cliente con este teléfono, correo o referencia"],
  "Un client existe déjà avec ces coordonnées": ["A customer already exists with these details", "يوجد عميل بهذه البيانات بالفعل", "Ya existe un cliente con estos datos"],
  "Numéro de téléphone invalide": ["Invalid phone number", "رقم هاتف غير صالح", "Número de teléfono no válido"],
  "Une adresse email est nécessaire pour valider votre carte": ["An email address is needed to verify your card", "يلزم عنوان بريد إلكتروني للتحقق من بطاقتك", "Se necesita un correo para validar tu tarjeta"],
  "Vous êtes déjà inscrit(e).": ["You're already signed up.", "أنت مسجّل بالفعل.", "Ya estás inscrito."],
  "Vous êtes déjà inscrit(e). Utilisez « Retrouver ma carte » ou demandez au commerçant.": ["You're already signed up. Use “Find my card” or ask the shop.", "أنت مسجّل بالفعل. استخدم «استعادة بطاقتي» أو اسأل المتجر.", "Ya estás inscrito. Usa «Recuperar mi tarjeta» o pregunta en la tienda."],
  "Les inscriptions sont momentanément fermées. Demandez votre carte directement au commerçant.": ["Sign-ups are temporarily closed. Ask the shop for your card directly.", "التسجيل مغلق مؤقتًا. اطلب بطاقتك مباشرة من المتجر.", "Las inscripciones están cerradas temporalmente. Pide tu tarjeta directamente en la tienda."],
  "Inscription refusée": ["Sign-up refused", "تم رفض التسجيل", "Inscripción rechazada"],
  "Envoi refusé": ["Submission refused", "تم رفض الإرسال", "Envío rechazado"],
  "Aucune validation en attente": ["No verification pending", "لا يوجد تحقق معلّق", "No hay ninguna validación pendiente"],
  "Code expiré : demandez-en un nouveau": ["Code expired: request a new one", "انتهت صلاحية الرمز: اطلب رمزًا جديدًا", "Código caducado: pide uno nuevo"],
  "Code incorrect": ["Incorrect code", "رمز غير صحيح", "Código incorrecto"],
  "Ce parrainage est déjà clos": ["This referral is already closed", "هذه الإحالة مغلقة بالفعل", "Esta recomendación ya está cerrada"],
  "Confirmez votre email pour inscrire plus de 50 clients": ["Confirm your email to sign up more than 50 customers", "أكّد بريدك الإلكتروني لتسجيل أكثر من 50 عميلًا", "Confirma tu correo para inscribir a más de 50 clientes"],
  "Adresse de webhook non autorisée : utilisez une adresse HTTPS publique": ["Webhook address not allowed: use a public HTTPS address", "عنوان webhook غير مسموح به: استخدم عنوان HTTPS عامًا", "Dirección de webhook no permitida: usa una dirección HTTPS pública"],
  "Confirmez votre email pour ouvrir « Mes cartes »": ["Confirm your email to open “My cards”", "أكّد بريدك الإلكتروني لفتح «بطاقاتي»", "Confirma tu correo para abrir «Mis tarjetas»"],
  "Vous avez déjà une carte rattachée chez ce commerce": ["You already have a card linked at this business", "لديك بالفعل بطاقة مرتبطة لدى هذا المتجر", "Ya tienes una tarjeta vinculada en este comercio"],
  "Confirmez votre email pour ajouter cette carte": ["Confirm your email to add this card", "أكّد بريدك الإلكتروني لإضافة هذه البطاقة", "Confirma tu correo para añadir esta tarjeta"],
  "Indiquez votre prénom": ["Enter your first name", "أدخل اسمك", "Indica tu nombre"],
  "Trop de codes demandés : réessayez dans une heure": ["Too many codes requested: try again in an hour", "طلبت رموزًا كثيرة جدًا: أعد المحاولة بعد ساعة", "Demasiados códigos solicitados: inténtalo de nuevo dentro de una hora"],
  "Format accepté : PNG, JPEG ou WebP": ["Accepted formats: PNG, JPEG or WebP", "الصيغ المقبولة: PNG أو JPEG أو WebP", "Formatos aceptados: PNG, JPEG o WebP"],
  "Image trop lourde (512 Ko maximum)": ["Image too large (512 KB maximum)", "الصورة كبيرة جدًا (512 كيلوبايت كحد أقصى)", "Imagen demasiado pesada (512 KB como máximo)"],
  // Programmes, points, récompenses
  "Le type de programme ne peut plus changer une fois des cartes créées": ["The programme type can't change once cards exist", "لا يمكن تغيير نوع البرنامج بعد إنشاء بطاقات", "El tipo de programa ya no puede cambiar una vez creadas las tarjetas"],
  "Programme désactivé": ["Programme disabled", "البرنامج معطّل", "Programa desactivado"],
  "Opération concurrente détectée, réessayez": ["Concurrent operation detected, try again", "تم رصد عملية متزامنة، أعد المحاولة", "Operación simultánea detectada, inténtalo de nuevo"],
  "Solde insuffisant": ["Insufficient balance", "رصيد غير كافٍ", "Saldo insuficiente"],
  "Solde insuffisant pour cette récompense": ["Insufficient balance for this reward", "الرصيد غير كافٍ لهذه المكافأة", "Saldo insuficiente para esta recompensa"],
  "Récompense épuisée": ["Reward out of stock", "نفدت المكافأة", "Recompensa agotada"],
  "Récompense désactivée": ["Reward disabled", "المكافأة معطّلة", "Recompensa desactivada"],
  "Récompense hors période de disponibilité": ["Reward outside its availability period", "المكافأة خارج فترة توفرها", "Recompensa fuera de su periodo de disponibilidad"],
  "Utilisation déjà annulée": ["Redemption already cancelled", "تم إلغاء الاستخدام بالفعل", "Uso ya anulado"],
  "Cette opération a déjà été annulée": ["This operation has already been cancelled", "تم إلغاء هذه العملية بالفعل", "Esta operación ya ha sido anulada"],
  "Commande déjà annulée": ["Order already cancelled", "تم إلغاء الطلب بالفعل", "Pedido ya anulado"],
  "Seuls les gains et ajustements s'annulent ici ; une récompense s'annule depuis son historique": ["Only earnings and adjustments can be cancelled here; cancel a reward from its history", "يمكن هنا إلغاء المكاسب والتعديلات فقط؛ تُلغى المكافأة من سجلها", "Aquí solo se anulan ganancias y ajustes; una recompensa se anula desde su historial"],
  "Le passage d’aujourd’hui est déjà compté pour ce client.": ["Today's visit is already counted for this customer.", "تم احتساب زيارة اليوم لهذا العميل بالفعل.", "La visita de hoy ya está contada para este cliente."],
  "Montant invalide": ["Invalid amount", "مبلغ غير صالح", "Importe no válido"],
  "Saisissez le montant de l’achat pour appliquer la réduction.": ["Enter the purchase amount to apply the discount.", "أدخل مبلغ الشراء لتطبيق الخصم.", "Introduce el importe de la compra para aplicar el descuento."],
  "Le montant de l’achat et la réduction doivent être supérieurs à zéro.": ["The purchase amount and discount must be greater than zero.", "يجب أن يكون مبلغ الشراء والخصم أكبر من صفر.", "El importe de la compra y el descuento deben ser mayores que cero."],
  "La réduction ne peut pas dépasser 100 %.": ["The discount can't exceed 100%.", "لا يمكن أن يتجاوز الخصم 100٪.", "El descuento no puede superar el 100 %."],
  "Limite de clients de l'offre atteinte": ["Plan customer limit reached", "تم بلوغ حدّ العملاء في الباقة", "Se ha alcanzado el límite de clientes del plan"],
  // Partenaires
  "Espace réservé aux partenaires FOVE validés": ["Area reserved for approved FOVE partners", "مساحة مخصّصة لشركاء FOVE المعتمدين", "Espacio reservado a socios FOVE aprobados"],
  "Vous ne disposez pas d'un profil partenaire FOVE validé": ["You don't have an approved FOVE partner profile", "ليس لديك ملف شريك FOVE معتمد", "No tienes un perfil de socio FOVE aprobado"],
  "Accès réservé aux associés et à la direction financière": ["Access reserved for partners and finance management", "الوصول مخصّص للشركاء والإدارة المالية", "Acceso reservado a los socios y a la dirección financiera"],
  "Cette adresse email correspond déjà à un partenaire FOVE actif. Connectez-vous à votre espace.": ["This email already belongs to an active FOVE partner. Sign in to your dashboard.", "هذا البريد يخص شريكًا نشطًا في FOVE بالفعل. سجّل الدخول إلى مساحتك.", "Este correo ya corresponde a un socio activo de FOVE. Inicia sesión en tu panel."],
  "Une candidature avec cette adresse email est déjà en cours d'examen.": ["An application with this email is already under review.", "هناك طلب بهذا البريد قيد المراجعة بالفعل.", "Ya hay una solicitud con este correo en revisión."],
  "Un partenaire avec cet email ou ce code existe déjà.": ["A partner with this email or code already exists.", "يوجد شريك بهذا البريد أو الرمز بالفعل.", "Ya existe un socio con este correo o código."],
  "Cette commission a déjà été versée.": ["This commission has already been paid.", "تم دفع هذه العمولة بالفعل.", "Esta comisión ya se ha pagado."],
  "Le montant demandé excède votre solde disponible.": ["The requested amount exceeds your available balance.", "المبلغ المطلوب يتجاوز رصيدك المتاح.", "El importe solicitado supera tu saldo disponible."],
  // Google Wallet
  "Google Wallet est mal configuré (compte de service).": ["Google Wallet is misconfigured (service account).", "تم ضبط Google Wallet بشكل غير صحيح (حساب الخدمة).", "Google Wallet está mal configurado (cuenta de servicio)."],
  "Google Wallet n'est pas activé.": ["Google Wallet is not enabled.", "Google Wallet غير مفعّل.", "Google Wallet no está activado."],
  "Connexion à Google Wallet impossible.": ["Unable to connect to Google Wallet.", "تعذّر الاتصال بـ Google Wallet.", "No se puede conectar con Google Wallet."],
  "Google Wallet ne répond pas. Réessayez dans un instant.": ["Google Wallet isn't responding. Try again shortly.", "لا يستجيب Google Wallet. أعد المحاولة بعد قليل.", "Google Wallet no responde. Inténtalo de nuevo en un momento."],
  "Impossible de faire de la place pour le nouveau message.": ["Unable to make room for the new message.", "تعذّر إفساح المجال للرسالة الجديدة.", "No se puede liberar espacio para el nuevo mensaje."],
  "Limite Google atteinte : 3 notifications par carte et par 24 h. Réessayez demain.": ["Google limit reached: 3 notifications per card every 24 hours. Try again tomorrow.", "تم بلوغ حدّ Google: 3 إشعارات لكل بطاقة كل 24 ساعة. أعد المحاولة غدًا.", "Límite de Google alcanzado: 3 notificaciones por tarjeta cada 24 h. Inténtalo mañana."],
  "La notification Google Wallet n'a pas pu être envoyée.": ["The Google Wallet notification couldn't be sent.", "تعذّر إرسال إشعار Google Wallet.", "No se ha podido enviar la notificación de Google Wallet."],
  // Messages de validation (schémas partagés)
  "Montant invalide (ex. 15000 ou 12.50)": ["Invalid amount (e.g. 15000 or 12.50)", "مبلغ غير صالح (مثال: 15000 أو 12.50)", "Importe no válido (p. ej. 15000 o 12.50)"],
  "Couleur hexadécimale attendue (#RRGGBB)": ["Hex colour expected (#RRGGBB)", "يُتوقع لون سداسي عشري (#RRGGBB)", "Se espera un color hexadecimal (#RRGGBB)"],
  "Lettres minuscules, chiffres et tirets uniquement": ["Lowercase letters, numbers and hyphens only", "أحرف صغيرة وأرقام وشرطات فقط", "Solo minúsculas, números y guiones"],
  "Ce sous-domaine est réservé par FOVE": ["This subdomain is reserved by FOVE", "هذا النطاق الفرعي محجوز من FOVE", "Este subdominio está reservado por FOVE"],
  "Vous devez accepter les conditions": ["You must accept the terms", "يجب أن توافق على الشروط", "Debes aceptar las condiciones"],
  "Vous devez accepter les conditions du programme": ["You must accept the programme terms", "يجب أن توافق على شروط البرنامج", "Debes aceptar las condiciones del programa"],
  "Indiquez un pourcentage supérieur à 0 et inférieur ou égal à 100.": ["Enter a percentage above 0 and up to 100.", "أدخل نسبة أكبر من 0 وأقل من أو تساوي 100.", "Indica un porcentaje mayor que 0 y menor o igual que 100."],
  "Indiquez un montant supérieur à 0.": ["Enter an amount above 0.", "أدخل مبلغًا أكبر من 0.", "Indica un importe mayor que 0."],
  "La date de fin doit suivre la date de début.": ["The end date must be after the start date.", "يجب أن يكون تاريخ الانتهاء بعد تاريخ البدء.", "La fecha de fin debe ser posterior a la de inicio."],
  "La note ne peut pas être vide": ["The note can't be empty", "لا يمكن أن تكون الملاحظة فارغة", "La nota no puede estar vacía"],
  "1 000 caractères maximum": ["1,000 characters maximum", "1000 حرف كحد أقصى", "1000 caracteres como máximo"],
  "Valeur non nulle": ["Non-zero value", "قيمة غير صفرية", "Valor distinto de cero"],
  "Indiquez votre nom": ["Enter your name", "أدخل اسمك", "Indica tu nombre"],
  "Email invalide": ["Invalid email", "بريد إلكتروني غير صالح", "Correo no válido"],
  "Décrivez brièvement votre besoin (10 caractères min.)": ["Briefly describe your need (10 characters min.)", "صِف حاجتك باختصار (10 أحرف على الأقل)", "Describe brevemente tu necesidad (mín. 10 caracteres)"],
  "Un propriétaire ne s'invite pas": ["An owner can't be invited", "لا يمكن دعوة مالك", "No se puede invitar a un propietario"],
};

/** Noms utilisés dans « X introuvable ». */
const NOUNS: Record<string, Tr> = {
  Ressource: ["Resource", "المورد", "el recurso"],
  Abonnement: ["Subscription", "الاشتراك", "la suscripción"],
  "Carte de fidélité": ["Loyalty card", "بطاقة الولاء", "la tarjeta de fidelidad"],
  Carte: ["Card", "البطاقة", "la tarjeta"],
  Client: ["Customer", "العميل", "el cliente"],
  "Clé API": ["API key", "مفتاح API", "la clave API"],
  Collaborateur: ["Team member", "عضو الفريق", "el colaborador"],
  "Commande créditée": ["Credited order", "الطلب المحتسب", "el pedido acreditado"],
  Commission: ["Commission", "العمولة", "la comisión"],
  "Demande de virement": ["Payout request", "طلب التحويل", "la solicitud de transferencia"],
  Dépense: ["Expense", "المصروف", "el gasto"],
  Entreprise: ["Business", "النشاط التجاري", "la empresa"],
  Établissement: ["Location", "الفرع", "el establecimiento"],
  Image: ["Image", "الصورة", "la imagen"],
  Invitation: ["Invitation", "الدعوة", "la invitación"],
  "Ligne de relevé": ["Statement line", "سطر الكشف", "la línea del extracto"],
  Offre: ["Plan", "الباقة", "el plan"],
  Opération: ["Operation", "العملية", "la operación"],
  Page: ["Page", "الصفحة", "la página"],
  Paiement: ["Payment", "الدفعة", "el pago"],
  Partenaire: ["Partner", "الشريك", "el socio"],
  Programme: ["Programme", "البرنامج", "el programa"],
  Prospect: ["Lead", "العميل المحتمل", "el cliente potencial"],
  "QR d'inscription": ["Sign-up QR code", "رمز QR للتسجيل", "el QR de inscripción"],
  Récompense: ["Reward", "المكافأة", "la recompensa"],
  Utilisation: ["Redemption", "الاستخدام", "el uso"],
  Vente: ["Sale", "عملية البيع", "la venta"],
  Webhook: ["Webhook", "الـ Webhook", "el webhook"],
};

const QUOTA_NOUNS: Record<string, Tr> = {
  clients: ["customers", "عميل", "clientes"],
  établissements: ["locations", "فرع", "establecimientos"],
  collaborateurs: ["team members", "عضو فريق", "colaboradores"],
  programmes: ["programmes", "برنامج", "programas"],
};

type Pattern = [RegExp, (m: RegExpMatchArray, i: 0 | 1 | 2) => string | null];

const PATTERNS: Pattern[] = [
  [
    /^(.+) introuvable$/,
    (m, i) => {
      const noun = NOUNS[m[1]!]?.[i];
      if (!noun) return null;
      return [`${noun} not found`, `تعذّر العثور على ${noun}`, `No se ha encontrado ${noun}`][i]!;
    },
  ],
  [
    /^Limite de (\d+) (\S+) atteinte pour votre offre$/,
    (m, i) => {
      const what = QUOTA_NOUNS[m[2]!]?.[i];
      if (!what) return null;
      return [`Your plan's limit of ${m[1]} ${what} has been reached`, `تم بلوغ حدّ ${m[1]} ${what} في باقتك`, `Se ha alcanzado el límite de ${m[1]} ${what} de tu plan`][i]!;
    },
  ],
  [
    /^La carte a déjà atteint (\d+) tampons\. La récompense est prête à être utilisée\.$/,
    (m, i) => [`The card already has ${m[1]} stamps. The reward is ready to use.`, `وصلت البطاقة بالفعل إلى ${m[1]} طابعًا. المكافأة جاهزة للاستخدام.`, `La tarjeta ya tiene ${m[1]} sellos. La recompensa está lista para usarse.`][i]!,
  ],
  [
    /^La carte a déjà atteint le plafond de (\d+) tampons\.$/,
    (m, i) => [`The card has already reached the ${m[1]}-stamp cap.`, `وصلت البطاقة بالفعل إلى الحد الأقصى البالغ ${m[1]} طابعًا.`, `La tarjeta ya ha alcanzado el máximo de ${m[1]} sellos.`][i]!,
  ],
  [
    /^Devise (\S+) différente de celle du programme \((\S+)\)$/,
    (m, i) => [`Currency ${m[1]} differs from the programme's (${m[2]})`, `العملة ${m[1]} مختلفة عن عملة البرنامج (${m[2]})`, `La divisa ${m[1]} es distinta de la del programa (${m[2]})`][i]!,
  ],
  [/^Événements inconnus : (.+)$/, (m, i) => [`Unknown events: ${m[1]}`, `أحداث غير معروفة: ${m[1]}`, `Eventos desconocidos: ${m[1]}`][i]!],
  [/^Scope manquant : (.+)$/, (m, i) => [`Missing scope: ${m[1]}`, `نطاق الصلاحية مفقود: ${m[1]}`, `Falta el scope: ${m[1]}`][i]!],
  [/^Échec Stripe : (.+)$/, (m, i) => [`Stripe error: ${m[1]}`, `خطأ في Stripe: ${m[1]}`, `Error de Stripe: ${m[1]}`][i]!],
  [
    /^Le montant remboursable maximum est de (.+)\.$/,
    (m, i) => [`The maximum refundable amount is ${m[1]}.`, `الحد الأقصى للمبلغ القابل للاسترداد هو ${m[1]}.`, `El importe máximo reembolsable es de ${m[1]}.`][i]!,
  ],
  [
    /^Le montant minimum de retrait est de (.+) USD\. Solde disponible : (.+) USD\.$/,
    (m, i) => [`The minimum payout is ${m[1]} USD. Available balance: ${m[2]} USD.`, `الحد الأدنى للسحب هو ${m[1]} USD. الرصيد المتاح: ${m[2]} USD.`, `El importe mínimo de retirada es de ${m[1]} USD. Saldo disponible: ${m[2]} USD.`][i]!,
  ],
];

/** Message d'erreur dans la langue demandée ; le texte d'origine s'il n'est pas catalogué. */
export function translateError(locale: Locale, message: string): string {
  if (locale === "fr" || !message) return message;
  const i = IDX[locale];
  const exact = EXACT[message];
  if (exact) return exact[i];
  for (const [pattern, render] of PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      const out = render(match, i);
      if (out) return out;
    }
  }
  return message;
}

/** Nombre de messages catalogués (utile aux tests). */
export const catalogSize = () => Object.keys(EXACT).length;
