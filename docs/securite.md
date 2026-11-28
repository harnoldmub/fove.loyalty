# Sécurité

| Sujet | Mise en œuvre |
|---|---|
| Sessions | Jeton opaque 256 bits dans un cookie `HttpOnly`, `SameSite=Lax`, `Secure` + préfixe `__Host-` en production. Seule l'empreinte SHA-256 est en base. Échéance glissante de 90 jours (repoussée à chaque utilisation), cookie de 400 jours dont l'échéance en base fait foi. Révocation quand un compte non confirmé est repris par son titulaire. |
| CSRF | Cookie `SameSite=Lax` + en-tête `X-Fove-Csrf: 1` exigé sur toute écriture authentifiée par cookie (un site tiers ne peut pas l'envoyer sans passer CORS). |
| Connexion | **Aucun mot de passe** (docs/chantier-connexion-otp.md) : Google, ou code à 6 chiffres par email (empreinte SHA-256 en base, comparaison à temps constant, 10 min, 5 essais, consommation atomique, 1 code par minute, 5 par heure et par email, 60 par heure et par adresse IP, même réponse que l'email existe ou non). L'email est prouvé à la création du compte. Double authentification des comptes admin à ajouter. |
| Espace partenaire | Réservé aux partenaires **validés** (`APPROVED`, `ACTIVE`) à chaque requête : un profil en attente (`partner_pending`), suspendu ou refusé (`partner_suspended`) n'accède ni aux clients apportés, ni aux coordonnées de versement, ni aux prospects. |
| Double authentification des admins | Super admin, associé, responsable financier : application TOTP (RFC 6238, 6 chiffres, 30 s, tolérance d'un pas) en plus du code par email, exigée sur toute route `SuperAdminRoute`/`FinanceRoute` (`AdminMfaGuard`). Secret chiffré AES-256-GCM (`APP_ENCRYPTION_KEY`), activation confirmée par un premier code, pas déjà utilisé refusé (pas de rejeu), 5 erreurs = blocage 15 min. Session admin valable **12 h** après vérification (`Session.mfaVerifiedAt`). 10 codes de secours à usage unique, stockés en empreinte SHA-256. Réinitialisation : `pnpm --filter @fove/database mfa:reset -- email` (ferme les sessions, auditée). `ADMIN_MFA=off` uniquement en local et dans les tests. |
| Caisse partagée | Session de caisse limitée aux routes `@RegisterAllowed`, jamais les droits du compte qui l'a activée ; opérations au nom du caissier déverrouillé par son code à 4 chiffres (scrypt salé, 5 erreurs = 15 min), verrouillage automatique ; caisse retirée = sessions supprimées. Anomalie d'annulations répétées signalée au propriétaire. |
| Permissions | Vérifiées côté serveur à chaque requête (`TenantGuard` + `@RequirePermission`). Rôles : Owner, Manager, Cashier, Viewer ; périmètre par établissement. Super Admin séparé. |
| Accès support | Super admin uniquement, motif obligatoire, 5 à 120 minutes, **lecture seule**, journalisé dans l'audit de l'entreprise. |
| Liens de carte | Stables et chiffrés au repos ; « Retrouver ma carte » envoie le lien uniquement à l'email de la fiche, sans le renouveler (pas de coupure de carte par un tiers) ; renouvellement réservé au commerçant, confirmé et audité. Fichiers image/PDF limités à 20 req/min. |
| Google Wallet | Clé privée du compte de service uniquement sur le serveur ; liens d'ajout signés RS256 valables 10 min ; notifications réservées aux managers/propriétaires et auditées. |
| Clés API | `fove_sk_` (serveur, scopes) et `fove_pk_` (widget, aucun scope, domaines autorisés). Stockées hachées, affichées une seule fois, révocables. Une clé publique ne peut jamais créditer (testé). |
| Validation | Zod sur chaque entrée ; Prisma (requêtes paramétrées) contre les injections ; `$queryRaw` uniquement en gabarits paramétrés. |
| Limitation de débit | Global 120 req/min/IP ; auth 10/min ; inscription publique 5/min ; API v1 300/min. Codes de connexion : 1 par minute, 5 par heure et **20 par jour** par email, 60 par heure par IP. Candidature partenaire : 3/min et **10 par jour** par IP (chaque candidature envoie un email). Champ piège anti-robot sur l'inscription. |
| Webhooks sortants | Signature HMAC-SHA256 horodatée, secret chiffré AES-256-GCM au repos, 8 tentatives avec backoff. Anti-SSRF : en production, adresse HTTPS dont toutes les IP résolues sont publiques (vérifiée à la création et avant chaque envoi, `common/public-url.ts`) ; redirections jamais suivies. |
| Écritures en base | Aucun objet de requête n'est passé tel quel à Prisma (`data`) : corps validé par zod, champs choisis un par un (sinon écritures imbriquées possibles jusqu'au compte utilisateur). |
| Email non confirmé | Réservé aux comptes à l'email confirmé (`@RequireVerified`, code `email_not_verified`) : équipe, export et import de clients, envois groupés, intégrations, espace partenaire ; limite douce de 50 clients sans propriétaire confirmé (`UNVERIFIED_CUSTOMER_LIMIT`). Rattachements par email uniquement sur email confirmé. Grille : [chantier-email-non-confirme.md](chantier-email-non-confirme.md). |
| CORS | Liste exacte `CORS_ORIGINS` (aucun sous-domaine implicite) pour les appels avec cookie ; widget ouvert en lecture avec clé publique et domaines autorisés. |
| Adresses web saisies | `webUrl()` (`@fove/shared`) : `http`/`https` seulement, jamais `javascript:` ni `data:` (logo, bannière, politique de confidentialité, origines du widget, justificatifs, site du partenaire). |
| Documentation de l'API | `/api/docs` et `/api/openapi.json` ne publient que l'API publique (`/api/v1`) et le widget, jamais les routes internes. |
| Redirections après connexion | `safeInternalPath` (`@fove/shared`) : chemins internes uniquement (refuse `//`, `/\`, caractères de contrôle). |
| Webhooks Stripe | Signature vérifiée sur le corps brut, événements dédupliqués (`BillingEvent`). |
| Médias | Type déterminé par signature binaire (PNG/JPEG/WebP), SVG refusé, 512 Ko max, servi avec `Content-Security-Policy: default-src 'none'`. |
| En-têtes | Helmet côté API ; `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, CSP minimale (`frame-ancestors 'none'; base-uri 'self'; object-src 'none'`) et HSTS (production) côté web ; cartes en `no-store` + `noindex`. |
| Erreurs | Format uniforme sans fuite de pile ; erreurs 5xx journalisées (`ErrorLog`) et visibles dans l'administration. |
| Audit | `AuditLog` pour connexions, créations, ajustements, annulations, exports, effacements, actions d'administration. |

## Revue du 28 novembre 2026

Aucune faille critique (cloisonnement des commerces, sessions, CSRF, webhooks, médias, rôles d'équipe vérifiés). Corrigé :

| Gravité | Point | Correction |
|---|---|---|
| Moyenne | Un partenaire suspendu ou refusé gardait l'accès à son espace (drapeau `isPartner` suffisant). | Statut validé exigé à chaque requête ; espace partenaire masqué à la connexion. |
| Moyenne | Candidature partenaire sans limite dédiée : envoi d'emails à des adresses arbitraires. | 3/min et 10/jour par IP. |
| Moyenne | Admin protégé par la seule boîte mail, session de 90 jours. | Double authentification par application, administration ouverte 12 h. |
| Faible | CORS avec cookie ouvert à tout sous-domaine. | Liste exacte. |
| Faible | Documentation publique listant les routes internes. | Filtrée sur l'API publique et le widget. |
| Faible | Adresses `javascript:` ou `data:` acceptées. | `webUrl()`. |
| Faible | Pas de plafond journalier de codes de connexion. | 20 par jour et par email. |
| Faible | Ni HSTS ni CSP côté web. | HSTS et CSP minimale. |
| Anomalie | Code partenaire (nom + 3 chiffres) pouvant être déjà pris : candidature en erreur. | Code revérifié en base, allongé si besoin. |

À vérifier en production : l'adresse IP vue par l'API (journal d'audit). Si toutes les lignes portent la même adresse (celle du site, qui relaie les appels), les limites par IP s'appliquent à tous les visiteurs ensemble : transmettre l'IP du visiteur.

## Points à traiter avant montée en charge

- Limiteur de débit en mémoire : passer à un stockage partagé si l'API tourne sur plusieurs instances.
- Envoi d'OTP par SMS/WhatsApp : interface prête (canal sur `OtpChallenge`), fournisseur à choisir (coût).
- Politique de contenu complète (scripts, styles, connexions), d'abord en mode observation.
- Stockage des logos en base : basculer vers un stockage objet (R2/S3) au-delà de quelques centaines de commerçants.
