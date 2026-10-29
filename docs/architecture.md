# Architecture

## Vue d'ensemble

```
Navigateur ── app.fove.digital (Next.js) ──/api/* (proxy)──► api.fove.digital (NestJS) ──► PostgreSQL
Boutique / caisse ── Bearer fove_sk_… ─────────────────────► /api/v1/*
Site du commerçant ── widget (fove_pk_…) ─────────────────► /api/widget/config
Stripe ── webhooks signés ─────────────────────────────────► /api/billing/stripe/webhook
Cron (GitHub Actions) ── x-cron-secret ────────────────────► /api/jobs/run
```

- **Un seul déploiement API** organisé en modules métiers (`apps/api/src/<module>`), sans microservice.
- **Le front appelle l'API sous son propre domaine** (rewrite Next `/api/*`) : cookies de session first-party, aucune requête cross-site.
- **Pas de Redis ni de worker** : limiteur de débit en mémoire (une instance), webhooks et expirations repris par une tâche planifiée HTTP.

## Multi-tenancy

Base PostgreSQL partagée, isolation logique stricte :

1. Chaque table métier porte `tenantId`.
2. Les relations métier utilisent des **clés étrangères composites** `(tenantId, id)` : la base refuse qu'une carte d'une entreprise référence le client ou le programme d'une autre (testé).
3. Le `tenantId` de la requête vient **toujours du serveur** : adhésion vérifiée à chaque requête (`TenantGuard`) ou clé API. Aucun paramètre ni en-tête du navigateur n'est pris en compte (testé avec un en-tête forgé).
4. Chaque service reçoit un `TenantContext` et filtre toutes ses requêtes par `tenantId`.
5. Unicités incluant le tenant : `(tenantId, kind, value)` pour les identifiants clients, `(tenantId, idempotencyKey)` pour les opérations, `(tenantId, cardNumber)`.

## Moteur de fidélité

- `LoyaltyTransaction` est un **registre immuable** : chaque ligne porte `delta` et `balanceAfter`. Une erreur se corrige par une écriture compensatoire (`REVERSAL`, `REFUND`, `REDEMPTION_REVERSAL`). Des déclencheurs PostgreSQL interdisent toute modification ou suppression du registre et du journal d'audit.
- `LoyaltyAccount.balance` est un cache mis à jour **dans la même transaction** que l'écriture, par un `UPDATE … WHERE balance >= -delta` conditionnel : deux débits simultanés ne peuvent pas rendre le solde négatif.
- **Idempotence** : clé unique par tenant ; une clé rejouée renvoie l'opération d'origine, une clé réutilisée pour une autre carte est refusée (409).
- Annulation totale unique (`reversesId` unique). Remboursements calculés sur le **montant cumulé** remboursé : arrondi au point supérieur, plafonné au gain d'origine ; en mode tampons, le passage n'est retiré que pour une commande entièrement remboursée (verrou `FOR UPDATE` sur l'opération d'origine).
- Calculs en centimes entiers (`packages/shared/src/loyalty-math.ts`), jamais en flottants.
- Expiration après inactivité : idempotente par période, déclenchée par la tâche planifiée.

## Cartes et QR codes

| Élément | Contenu | Droits |
|---|---|---|
| QR d'inscription (`EnrollmentLink`) | URL `/join/<token>` | Créer une carte, rien d'autre |
| QR personnel (`qrToken`) | Identifiant opaque `fvq_…` | Aucun : sert au scanner, authentifié, à retrouver la carte |
| Lien de carte (`/card/fvc_…`) | Jeton secret 256 bits ; empreinte SHA-256 pour la recherche, copie chiffrée (AES-256-GCM) pour le renvoyer | Lecture de sa propre carte, téléchargement image/PDF, ajout à Google Wallet. **Stable** : « Retrouver ma carte » renvoie le même lien (une demande malveillante ne peut pas couper la carte) ; seul le commerçant crée un nouveau lien, après confirmation |

## Carte du client (repris de Match Kwata)

- **Tampons numérotés** : une case par passage, la dernière montre la récompense ; « encore N passages avant… ».
- **Un passage par jour** (réglage du programme) : un seul crédit par client et par jour dans le fuseau de l'entreprise, hors commandes en ligne ; verrou sur la carte contre deux scans simultanés ; un passage annulé peut être recompté.
- **Carte téléchargeable** en PNG ou PDF 9:16 (`/api/public/cards/<lien>/carte.png|pdf`), rendue côté serveur (satori, sharp, pdf-lib), lien cliquable dans le PDF, sans solde (un fichier reste figé).
- **Envoi WhatsApp** depuis la fiche client : message pré-rempli avec le lien stable et la règle du programme.
- **Carte mémorisée** sur le téléphone : la page d'inscription propose « Ouvrir ma carte ».
- **Affiche A4** à imprimer pour chaque QR d'inscription (`/affiche/<id>`).
- **Scanner** : viseur plein cadre, caméra démarrée seule et arrêtée après lecture, chargements, fiche caisse sur sa propre page (`/app/scanner/<carte>`).

## Wallet

- **Google Wallet** (`apps/api/src/cards/google-wallet.ts`), actif seulement si `GOOGLE_WALLET_ISSUER_ID` et `GOOGLE_WALLET_SERVICE_ACCOUNT_JSON` sont définis. Une classe par programme (déclarée dans le JWT, créée par Google au premier ajout), un objet par carte portant le QR personnel. Lien d'ajout signé côté serveur, valable 10 min ; solde mis à jour après chaque opération ; notification à un client ou à tous les clients d'un programme (confirmation avant l'envoi groupé ; limite Google : 3 par carte et par 24 h). Bouton masqué sur iPhone/iPad.
- **Apple Wallet** : à venir derrière la même interface `WalletProvider` (certificat Pass Type ID requis).

## Abonnements

- Offres (`SubscriptionPlan`) en base : prix, ID de prix Stripe, essai, quotas, fonctions. Modifiables dans `/admin/plans`, jamais codés en dur (le seed fournit seulement les valeurs initiales).
- Sans `STRIPE_SECRET_KEY`, fournisseur **simulé** : aucun paiement, changement immédiat. Les clés `sk_live_` sont refusées tant que `STRIPE_ALLOW_LIVE=true` n'est pas posé.
- Un changement d'offre ne supprime ni ne bloque jamais les cartes et opérations existantes ; les quotas ne limitent que les nouvelles créations. Essai expiré ou abonnement résilié : droits Starter.
