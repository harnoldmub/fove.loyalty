# FOVE — Transformez vos clients en habitués

FOVE (FOrce de VEnte) est un SaaS multi-tenant de fidélisation pour commerçants : cartes de fidélité numériques (points ou tampons), QR codes, scanner caissier, récompenses, statistiques, API publique, widget et connecteur e-commerce. Un produit Dizayna. Domaine cible : `fove.digital`.

**Choix de stack : Next.js** (et non Astro) — FOVE est une application authentifiée avec tableau de bord, rôles et fonctions métier ; les pages marketing vivent dans la même application.

## Structure

```
apps/api        API NestJS (monolithe modulaire) — auth, tenants, customers, loyalty, rewards, billing, integrations, analytics, notifications, audit, admin
apps/web        Next.js App Router — site commercial, espace commerçant, onboarding, scanner, pages publiques (inscription, carte), administration FOVE
packages/database  Schéma Prisma 7, migrations, seed
packages/shared    Schémas Zod, rôles et permissions, calculs de fidélité (partagés front/API)
packages/sdk       SDK TypeScript serveur (@fove/sdk) + vérification des webhooks
packages/widget    Widget JavaScript sans dépendance (Shadow DOM)
infrastructure/    Dockerfiles et configuration Railway
tests/widget-demo  Site externe de démonstration du widget
docs/              Architecture, sécurité, RGPD, déploiement, intégration Match Kwata
```

## Démarrer en local

Prérequis : Node 22, pnpm 9, PostgreSQL local.

```bash
pnpm install
cp .env.example .env              # puis renseigner APP_ENCRYPTION_KEY, CRON_SECRET, SEED_SUPERADMIN_PASSWORD
createdb fove_dev && createdb fove_test
pnpm build
pnpm db:migrate                   # applique les migrations sur la base de dev
pnpm db:seed                      # rôles, offres, super admin
pnpm dev                          # API :5291, web :5290
```

`.env.local` (non versionné) surcharge `.env` en développement : c'est là que pointe la base locale quand `.env` contient l'URL de production.

## Tests

```bash
pnpm test        # shared, SDK, widget, API (base fove_test réinitialisée par la suite)
pnpm typecheck
pnpm --filter @fove/web lint
```

La suite API (67 tests) couvre l'authentification, l'isolation multi-tenant, les permissions, l'idempotence, la concurrence (crédits et récompenses simultanés), les parcours publics, l'API v1, le widget, le connecteur Match Kwata, Stripe (webhooks signés) et l'administration.

## Documentation

- [Architecture](docs/architecture.md)
- [Sécurité](docs/securite.md)
- [RGPD et responsabilités](docs/rgpd.md)
- [Déploiement Railway](docs/deploiement-railway.md)
- [Intégration Match Kwata](docs/integration-match-kwata.md)
- API : `/api/docs` (OpenAPI interactif) et page `/developpeurs`
