# Déploiement Railway

> Rien n'a été créé ni déployé : ce guide décrit la cible. Toute création de ressource payante ou mise en production attend une validation.

## Services

| Service | Source | Domaine cible | Coût |
|---|---|---|---|
| `fove-web` | `infrastructure/railway/web.railway.json` | `fove.digital`, `app.fove.digital` | 1 instance |
| `fove-api` | `infrastructure/railway/api.railway.json` | `api.fove.digital` | 1 instance |
| `fove-postgres` | Base Neon (URL dans `.env` de production) ou PostgreSQL Railway | — | selon offre |

Pas de worker : la tâche planifiée `.github/workflows/cron.yml` appelle `POST /api/jobs/run` toutes les 5 minutes (gratuit). Alternative Railway : un service cron `curl` (facturé à l'exécution).

Les deux domaines `fove.digital` et `app.fove.digital` pointent sur le même service web ; le site commercial et l'application partagent le même build.

## Variables d'environnement

**fove-api**

| Variable | Valeur |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | URL **pooler** Neon (ne jamais y ajouter `?schema=` ni `SET search_path`) |
| `DIRECT_DATABASE_URL` | URL **directe** Neon (migrations) |
| `APP_URL` | `https://app.fove.digital` |
| `API_URL` | `https://api.fove.digital` |
| `CORS_ORIGINS` | `https://app.fove.digital,https://fove.digital` |
| `TRUST_PROXY` | `2` (proxy Railway + proxy Next) |
| `APP_ENCRYPTION_KEY` | `openssl rand -base64 32` — **ne jamais changer** (chiffre les secrets de webhooks) |
| `CRON_SECRET` | `openssl rand -hex 24` |
| `EMAIL_PROVIDER` / `RESEND_API_KEY` / `EMAIL_FROM` | `resend`, clé Resend, `FOVE <no-reply@fove.digital>` (domaine à vérifier chez Resend) |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | clés **test** tant que la mise en production n'est pas validée |
| `STRIPE_ALLOW_LIVE` | `false` (passer à `true` seulement après validation) |
| `TRIAL_PLAN_CODE` | `business` |

**fove-web**

| Variable | Valeur |
|---|---|
| `API_URL` | URL interne Railway de l'API (`http://fove-api.railway.internal:5291`) |
| `NEXT_PUBLIC_SITE_URL` | `https://fove.digital` (build arg : icône de partage en URL absolue) |
| `PORT` | `5290` |

## Migrations

Le pre-deploy de l'API exécute `prisma migrate deploy` avant chaque mise en ligne. Les migrations sont additives ; toute migration destructive (suppression de colonne) se fait en deux déploiements et demande une validation.

Première mise en place de la base de production :

```bash
DATABASE_URL=<url directe> DIRECT_DATABASE_URL=<url directe> pnpm --filter @fove/database migrate:deploy
SEED_SUPERADMIN_EMAIL=… SEED_SUPERADMIN_PASSWORD=… DATABASE_URL=<url directe> pnpm db:seed
```

## Environnements

- **staging** : environnement Railway séparé, branche Neon dédiée (`staging`), Stripe en mode test, `EMAIL_PROVIDER=resend` vers une adresse interne.
- **production** : branche `main`, base Neon principale.

## Stripe

1. Créer les produits Starter / Business / Premium (mensuel + annuel) en mode test.
2. Saisir les `price_…` dans `/admin/plans`.
3. Webhook : `https://api.fove.digital/api/billing/stripe/webhook`, événements `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_failed`.
4. Activer le Customer Portal (changement d'offre, annulation, factures).

## Sauvegardes, restauration, retour arrière

- **Base** : Neon conserve l'historique (point-in-time restore selon l'offre). Avant chaque migration de production, créer une branche Neon de sauvegarde (`backup-AAAAMMJJ`).
- **Restauration** : créer une branche Neon à l'instant voulu, vérifier, puis basculer `DATABASE_URL` / `DIRECT_DATABASE_URL`.
- **Rollback applicatif** : Railway « Redeploy » d'un déploiement précédent. Une migration déjà appliquée n'est pas annulée : les migrations restent rétrocompatibles avec la version N-1.

## Surveillance

- Health check `GET /api/health` (vérifie la base).
- Logs Railway ; erreurs 5xx consultables dans `/admin/system` ; livraisons de webhooks dans Intégrations.
- Après mise en ligne, tester l'aperçu WhatsApp avec une URL jamais partagée (`https://fove.digital/?v=2`).
