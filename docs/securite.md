# Sécurité

| Sujet | Mise en œuvre |
|---|---|
| Sessions | Jeton opaque 256 bits dans un cookie `HttpOnly`, `SameSite=Lax`, `Secure` + préfixe `__Host-` en production. Seule l'empreinte SHA-256 est en base. Révocation à la réinitialisation du mot de passe. |
| CSRF | Cookie `SameSite=Lax` + en-tête `X-Fove-Csrf: 1` exigé sur toute écriture authentifiée par cookie (un site tiers ne peut pas l'envoyer sans passer CORS). |
| Mots de passe | scrypt (N=16384), comparaison à temps constant, hachage factice si l'email n'existe pas, verrouillage 15 min après 5 échecs. |
| Permissions | Vérifiées côté serveur à chaque requête (`TenantGuard` + `@RequirePermission`). Rôles : Owner, Manager, Cashier, Viewer ; périmètre par établissement. Super Admin séparé. |
| Accès support | Super admin uniquement, motif obligatoire, 5 à 120 minutes, **lecture seule**, journalisé dans l'audit de l'entreprise. |
| Clés API | `fove_sk_` (serveur, scopes) et `fove_pk_` (widget, aucun scope, domaines autorisés). Stockées hachées, affichées une seule fois, révocables. Une clé publique ne peut jamais créditer (testé). |
| Validation | Zod sur chaque entrée ; Prisma (requêtes paramétrées) contre les injections ; `$queryRaw` uniquement en gabarits paramétrés. |
| Limitation de débit | Global 120 req/min/IP ; auth 10/min ; inscription publique 5/min ; API v1 300/min. Champ piège anti-robot sur l'inscription. |
| Webhooks sortants | Signature HMAC-SHA256 horodatée, secret chiffré AES-256-GCM au repos, 8 tentatives avec backoff. |
| Webhooks Stripe | Signature vérifiée sur le corps brut, événements dédupliqués (`BillingEvent`). |
| Médias | Type déterminé par signature binaire (PNG/JPEG/WebP), SVG refusé, 512 Ko max, servi avec `Content-Security-Policy: default-src 'none'`. |
| En-têtes | Helmet côté API ; `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` côté web ; cartes en `no-store` + `noindex`. |
| Erreurs | Format uniforme sans fuite de pile ; erreurs 5xx journalisées (`ErrorLog`) et visibles dans l'administration. |
| Audit | `AuditLog` pour connexions, créations, ajustements, annulations, exports, effacements, actions d'administration. |

## Points à traiter avant montée en charge

- Limiteur de débit en mémoire : passer à un stockage partagé si l'API tourne sur plusieurs instances.
- Envoi d'OTP par SMS/WhatsApp : interface prête (canal sur `OtpChallenge`), fournisseur à choisir (coût).
- Stockage des logos en base : basculer vers un stockage objet (R2/S3) au-delà de quelques centaines de commerçants.
