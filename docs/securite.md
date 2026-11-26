# Sécurité

| Sujet | Mise en œuvre |
|---|---|
| Sessions | Jeton opaque 256 bits dans un cookie `HttpOnly`, `SameSite=Lax`, `Secure` + préfixe `__Host-` en production. Seule l'empreinte SHA-256 est en base. Échéance glissante de 90 jours (repoussée à chaque utilisation), cookie de 400 jours dont l'échéance en base fait foi. Révocation quand un compte non confirmé est repris par son titulaire. |
| CSRF | Cookie `SameSite=Lax` + en-tête `X-Fove-Csrf: 1` exigé sur toute écriture authentifiée par cookie (un site tiers ne peut pas l'envoyer sans passer CORS). |
| Connexion | **Aucun mot de passe** (docs/chantier-connexion-otp.md) : Google, ou code à 6 chiffres par email (empreinte SHA-256 en base, comparaison à temps constant, 10 min, 5 essais, consommation atomique, 1 code par minute, 5 par heure et par email, 60 par heure et par adresse IP, même réponse que l'email existe ou non). L'email est prouvé à la création du compte. Double authentification des comptes admin à ajouter. |
| Permissions | Vérifiées côté serveur à chaque requête (`TenantGuard` + `@RequirePermission`). Rôles : Owner, Manager, Cashier, Viewer ; périmètre par établissement. Super Admin séparé. |
| Accès support | Super admin uniquement, motif obligatoire, 5 à 120 minutes, **lecture seule**, journalisé dans l'audit de l'entreprise. |
| Liens de carte | Stables et chiffrés au repos ; « Retrouver ma carte » envoie le lien uniquement à l'email de la fiche, sans le renouveler (pas de coupure de carte par un tiers) ; renouvellement réservé au commerçant, confirmé et audité. Fichiers image/PDF limités à 20 req/min. |
| Google Wallet | Clé privée du compte de service uniquement sur le serveur ; liens d'ajout signés RS256 valables 10 min ; notifications réservées aux managers/propriétaires et auditées. |
| Clés API | `fove_sk_` (serveur, scopes) et `fove_pk_` (widget, aucun scope, domaines autorisés). Stockées hachées, affichées une seule fois, révocables. Une clé publique ne peut jamais créditer (testé). |
| Validation | Zod sur chaque entrée ; Prisma (requêtes paramétrées) contre les injections ; `$queryRaw` uniquement en gabarits paramétrés. |
| Limitation de débit | Global 120 req/min/IP ; auth 10/min ; inscription publique 5/min ; API v1 300/min. Champ piège anti-robot sur l'inscription. |
| Webhooks sortants | Signature HMAC-SHA256 horodatée, secret chiffré AES-256-GCM au repos, 8 tentatives avec backoff. Anti-SSRF : en production, adresse HTTPS dont toutes les IP résolues sont publiques (vérifiée à la création et avant chaque envoi, `common/public-url.ts`) ; redirections jamais suivies. |
| Écritures en base | Aucun objet de requête n'est passé tel quel à Prisma (`data`) : corps validé par zod, champs choisis un par un (sinon écritures imbriquées possibles jusqu'au compte utilisateur). |
| Email non confirmé | Réservé aux comptes à l'email confirmé (`@RequireVerified`, code `email_not_verified`) : équipe, export et import de clients, envois groupés, intégrations, espace partenaire ; limite douce de 50 clients sans propriétaire confirmé (`UNVERIFIED_CUSTOMER_LIMIT`). Rattachements par email uniquement sur email confirmé. Grille : [chantier-email-non-confirme.md](chantier-email-non-confirme.md). |
| Redirections après connexion | `safeInternalPath` (`@fove/shared`) : chemins internes uniquement (refuse `//`, `/\`, caractères de contrôle). |
| Webhooks Stripe | Signature vérifiée sur le corps brut, événements dédupliqués (`BillingEvent`). |
| Médias | Type déterminé par signature binaire (PNG/JPEG/WebP), SVG refusé, 512 Ko max, servi avec `Content-Security-Policy: default-src 'none'`. |
| En-têtes | Helmet côté API ; `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` côté web ; cartes en `no-store` + `noindex`. |
| Erreurs | Format uniforme sans fuite de pile ; erreurs 5xx journalisées (`ErrorLog`) et visibles dans l'administration. |
| Audit | `AuditLog` pour connexions, créations, ajustements, annulations, exports, effacements, actions d'administration. |

## Points à traiter avant montée en charge

- Limiteur de débit en mémoire : passer à un stockage partagé si l'API tourne sur plusieurs instances.
- Envoi d'OTP par SMS/WhatsApp : interface prête (canal sur `OtpChallenge`), fournisseur à choisir (coût).
- Stockage des logos en base : basculer vers un stockage objet (R2/S3) au-delà de quelques centaines de commerçants.
