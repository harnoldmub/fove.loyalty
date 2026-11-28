# FOVE — État du projet

> Mis à jour le **28 novembre 2026**, dernier commit analysé **`1de707f`** (branche `feat/parrainage-clients`). Version précédente : 2 novembre 2026, commit `139126f` (doc Claude Docs « FOVE — État du projet »). Référentiel fonctionnel détaillé : [fonctionnalites.md](fonctionnalites.md).

## 1. Synthèse

FOVE fonctionne de bout en bout en local : fidélité multi-commerces (points et tampons), compte client FOVE, offres et facturation multi-devises, partenaires, parrainage, relances automatiques, caisse partagée, administration avec double authentification. **397 tests automatisés passent**, typecheck et lint sont au vert, la CI de `main` passe.

Depuis la version du 2 novembre : **110 commits** (67 saboukellal, 43 Arnold MUBUANGA YATE), **24 PR mergées**. Les chiffres ont triplé : 85 → 330 tests API, 37 → 69 modèles, 6 → 34 migrations, 38 → 60 pages.

Ce qui empêche encore de dire « 100 % prêt pour la production » :

- **Services externes non vérifiés en réel** : Stripe (recette à faire), Apple Wallet et Google Wallet (comptes à finaliser), Resend, WhatsApp. Le code existe ; en local ils sont simulés ou masqués.
- **Points à valider hors code** : textes juridiques du compte client (relecture juriste), `ADMIN_MFA` à vérifier en production, IP vue par l'API derrière Railway (journal d'audit).
- **Interface web sans tests automatisés** : contrôles faits à la main (scripts Playwright locaux), aucun test de bout en bout dans la CI.

**Légende des statuts**

| Statut | Signification |
|---|---|
| Vérifié | Tests automatisés qui passent **et** contrôle en direct dans l'application |
| Testé | Tests automatisés qui passent, pas rejoué à la main récemment |
| Non vérifié | Code présent, dépend de clés externes ou sans test |
| Partiel | Fonctionne avec un défaut connu (section 6) |
| À faire | Décidé ou documenté, pas encore codé |

**Méthode.** Lecture des 110 commits et des specs `docs/chantier-*.md` ; `pnpm typecheck`, `pnpm --filter @fove/web lint`, `pnpm test` le 28/11/2026 sur `1de707f` ; contrôles en direct (Playwright local) des chantiers livrés ce mois-ci.

## 2. Architecture et stack

Monorepo pnpm + Turborepo : une API NestJS et une application Next.js partagent une base PostgreSQL et des paquets internes. Le navigateur n'appelle que son propre domaine (`/api/*` réécrit vers l'API, cookies first-party). Pas de Redis ni de worker : limiteur en mémoire, tâches de fond par `POST /api/jobs/run` appelé par le cron GitHub (toutes les 5 min). Isolation multi-tenant par `tenantId` sur chaque table et clés composites.

| Brique | Rôle | Chiffres |
|---|---|---|
| `apps/api` | Monolithe modulaire NestJS, Zod, Prisma 7 | 22 modules, ≈ 230 routes |
| `apps/web` | Vitrine, espace commerçant, caisse, compte client, espace partenaire, admin | Next.js 16 App Router, 60 pages, **4 langues** (fr, en, ar, es) |
| `packages/database` | Schéma, migrations, seed | 69 modèles, 34 migrations |
| `packages/shared` | Schémas Zod, rôles, calculs de fidélité, heure locale, RFM | 58 tests |
| `packages/sdk`, `packages/widget` | SDK serveur et widget Shadow DOM | 5 et 4 tests |
| `ios/`, `android/` | Coquille Capacitor qui ouvre `/app` | non compilée ici |
| `.github/workflows` | CI (typecheck, lint, tests) et cron | `ci.yml`, `cron.yml` |

Modules API : `auth`, `tenants`, `customers`, `loyalty`, `rewards`, `cards` (Google et Apple Wallet), `public`, `public-api`, `client-account` (compte client FOVE), `billing`, `partners`, `referrals` (entre commerçants), `customer-referrals` (entre clients), `automation` (relances, anniversaire), `register` (caisse partagée), `notifications`, `integrations`, `analytics`, `media`, `jobs`, `admin`, `i18n`.

**Intégrations externes**, toutes facultatives en local : Stripe, Google Wallet, Apple Wallet, Resend, WhatsApp Business Cloud API, Google OAuth (commerçants et clients), Match Kwata (API v1).

## 3. État par domaine

| Domaine | Ce qui existe | Statut | Preuve |
|---|---|---|---|
| Connexion commerçants | Code par email sans mot de passe, Google, session 90 j glissante, anti-CSRF, arrivée selon le compte (commerce, partenaire, admin) | Testé | `auth`, `google-auth`, `spaces` |
| Double authentification admin | TOTP, codes de secours, session admin 12 h, réinitialisation `mfa:reset` | Vérifié | `admin-mfa` ; contrôle en direct |
| Email non confirmé | Limites (partenaire, invitations, exports, import, envois groupés, intégrations, 50 clients), relances J1/J3/J7 | Testé | `email-limits` |
| Commerces et onboarding | Pays détecté, ville, devise, logo, sous-domaine, plusieurs commerces par compte | Testé | `tenant-isolation`, `freemium` |
| Équipe et rôles | Propriétaire, gérant, caissier, lecteur ; limite d'établissement ; limite de collaborateurs de l'offre, « Remplacer » | Testé | `permissions`, `staff-quota` |
| Caisse partagée | Code caisse 4 chiffres, appareil caisse, « Qui encaisse ? », verrouillage, annulations tracées, anomalies | Vérifié | `register` ; contrôle en direct |
| Clients (CRM) | Fiche, import, notes, tags, RFM, anonymisation, export RGPD | Testé | `client-retention`, `public` ; import sans test |
| Programmes et opérations | Points et tampons, registre immuable, idempotence, concurrence, expiration | Testé | `loyalty`, `cards` |
| Récompenses | Cadeau, pourcentage, montant fixe, stock, annulation | Testé | `loyalty`, `reward-discounts` |
| Inscription et carte client | QR, `/join`, carte en temps réel, écran d'accueil, image PNG, « Retrouver ma carte » | Testé | `public`, `client-join` |
| Compte client FOVE | Code email ou Google, « Mes cartes », cartes aux couleurs du commerce, export et suppression des comptes inactifs | Testé | `client-account`, `client-google`, `client-cards` ; textes juridiques « projet » |
| Relances et anniversaire | Liste « À relancer » (WhatsApp manuel), relances automatiques, cadeau d'anniversaire, heure locale, résultats | Vérifié | `automations`, `relances-socle` ; contrôle en direct |
| Parrainage entre clients | Lien par carte, bienvenue du filleul, parrain récompensé au premier passage, plafond mensuel, réglages et suivi | Vérifié | `customer-referrals` ; contrôle en direct (branche en PR) |
| Campagnes Wallet | Messages groupés sur les cartes, offres payantes | Non vérifié | Jamais envoyées chez Google ou Apple |
| Google Wallet | Lien signé, mise à jour du solde, notifications | Non vérifié | Aucun test dédié ; jamais appelé chez Google ; compte émetteur à finaliser |
| Apple Wallet | Pass signé, service PassKit, mises à jour | Partiel | Aucun test ; 500 sans certificat (section 6) |
| Offres et abonnement | Gratuit, Essentiel, Business, Réseau, Sur-mesure ; quotas lus en base ; changement d'offre (prorata / au renouvellement), grâce 7 j | Testé | `freemium`, `plan-change`, `billing-lifecycle`, `billing-admin` ; Stripe réel non recetté |
| Multi-devises et encaissement | Prix par monnaie (EUR, USD, MAD, DZD, CDF), taux comptables, virement avec référence, accès provisoire 7 j, rapprochement | Testé | `multi-currency`, `offline-billing`, `reconciliation` |
| Partenaires commerciaux | Candidature, espace partenaire, commissions, versements mensuels (sans encaissement) | Testé | `partners-security`, `partner-payouts`, `partner-settings` |
| Parrainage entre commerçants | 20 USD + 20 USD, acquis 14 j après paiement annuel, plafonds, Finance > Parrainages | Testé | `referral` (21 tests) ; coupon Stripe à créer |
| Emails | Deux gabarits (clients à la marque, équipe FOVE interne), échéances, relevés, notifications équipe réglables (désactivées par défaut) | Testé | `notifications` ; Resend réel non vérifié |
| API publique, SDK, widget | Clés à scopes, idempotence, OpenAPI, widget limité aux domaines | Testé | `public-api`, sdk, widget |
| Webhooks sortants | Envoi signé, relance, blocage du réseau interne | Testé | `webhooks-ssrf` ; relance sans test |
| Connecteur e-commerce | Match Kwata : commandes, remboursements, rattachement | Testé | `matchkwata` ; côté boutique non écrit |
| Administration FOVE | Entreprises, offres, Finance (trésorerie, abonnements, commissions, parrainages), messages, système | Testé | `billing-admin`, `finance-treasury`, `security-review-2` |
| Sécurité | Deux revues (25/11, 28/11) : mass assignment, SSRF, CSRF, open redirect, CORS exact, CSP/HSTS, partenaires suspendus | Testé | `security-review-2`, `partners-security`, `webhooks-ssrf` |
| Chargement des pages | Barre de progression, carte tamponnée pendant les chargements | Vérifié | contrôle en direct |
| App mobile | Coquille Capacitor iOS / Android | Non vérifié | ni compilée ni lancée ici |

## 4. Tests et qualité

Mesures du 28/11/2026 sur `1de707f`, base PostgreSQL 16 locale.

| Vérification | Commande | Résultat |
|---|---|---|
| Tests API (intégration, base réelle) | `pnpm test` | **330 / 330** dans 42 fichiers |
| Tests `packages/shared` | `pnpm test` | 58 / 58 |
| Tests `packages/sdk` | `pnpm test` | 5 / 5 |
| Tests `packages/widget` | `pnpm test` | 4 / 4 |
| Typage | `pnpm typecheck` | OK (10 tâches) |
| Lint web | `pnpm --filter @fove/web lint` | OK (les 2 erreurs de novembre sont corrigées) |
| Suite complète | `pnpm test` | 175 s |

**Fichiers de tests API les plus fournis** : `referral` (21), `client-join` (18), `public`, `notifications`, `client-account` (14), `billing-admin` (13), `loyalty`, `freemium` (12), `multi-currency` (11), `automations` (10). Les tests forcent `ADMIN_MFA=off` et un fuseau sans changement d'heure pour les plages horaires.

**Non couvert par des tests automatisés** : l'interface web (aucun test de composant ni de bout en bout), Apple Wallet, la relance des webhooks sortants, l'import de clients, l'upload de médias, les appels réels aux services externes.

## 5. Historique depuis le 2 novembre

| Période | Ce qui a été livré |
|---|---|
| 2–5 nov. | Offres Gratuit / Sur-mesure et facturation fiable (PR #1). Commits directs sur `main` : vitrine (vidéos sorties du dépôt), messages Wallet à tous les clients, module Finance admin, programme partenaires, consentement cookies + GTM/Clarity, « Ajouter à l'écran d'accueil », devise selon le pays. |
| 10 nov. | Référentiel fonctionnel `fonctionnalites.md`. |
| 20–22 nov. | Spec du compte client FOVE. Commits directs sur `main` : connexion Google des commerçants, **4 langues**, mode test Stripe isolé, vitrine finalisée (Next 16.4.6), retours de chargement. |
| 24–25 nov. | Compte client FOVE A1–A5 (#2), sécurité partenaires (#3), téléphone facultatif (#4), limites email non confirmé (#5), parrainage commerçants (#7), multi-devises et encaissement (#9). |
| 26 nov. | Partenaires sans encaissement (#10), connexion par code (#11), arrivée admin et gabarit email (#12, #13). |
| 27 nov. | Espaces partenaire (#14), chargement des pages (#15), retrait du mobile money (#16). |
| 28 nov. | Emails à deux gabarits et notifications équipe (#17), revue sécu + 2FA admin (#18), chargement des données (#19), incohérences (#20), relances + anniversaire (#21), correctif CI fuseau (#22), code caisse (#23), limite de collaborateurs (#24). En PR : export clients, parrainage entre clients. |

| PR | Branche | Contenu |
|---|---|---|
| #24 | `fix/quota-collaborateurs` | Limite de collaborateurs fiable, « Remplacer » |
| #23 | `feat/code-caisse` | Caisse partagée C1–C3 |
| #22 | `fix/test-fuseau-ci` | Test de plage horaire sans changement d'heure |
| #21 | `feat/relances-anniversaire` | Relances et cadeau d'anniversaire R1–R5 |
| #20 | `fix/incoherences` | Libellés, PDF, limite du Gratuit, réglages partenaires |
| #19 | `feat/chargement-donnees` | Carte tamponnée pendant les chargements de données |
| #18 | `fix/securite-revue-2` | Revue sécu du 28/11 et 2FA admin |
| #17 | `feat/emails-notifications` | Gabarits clients / équipe, emails de suivi, réglage des notifications |
| #16 | `fix/retrait-mobile-money` | Mobile money retiré (projet futur) |
| #15 | `feat/chargement-pages` | Barre de progression, carte tamponnée |
| #14 | `feat/espaces-partenaire` | Espaces, liens entre espaces, invitation partenaire |
| #13 | `fix/otp-admin-arrivee` | Code centré, arrivée admin, CI réparée |
| #12 | `feat/admin-emails-otp` | Arrivée admin, emails à la marque, code en 6 cases |
| #11 | `feat/connexion-otp` | Connexion des commerçants par code |
| #10 | `feat/partenaires-sans-encaissement` | Versements mensuels des partenaires |
| #9 | `feat/multi-devises` | Prix par monnaie, encaissement hors ligne |
| #8, #6 | `fix/connexion-*-deja-connecte` | Plus de connexion réaffichée à un utilisateur connecté |
| #7 | `feat/parrainage` | Parrainage entre commerçants P1–P5 |
| #5 | `feat/limites-email-non-confirme` | Limites des comptes non confirmés |
| #4 | `feat/telephone-facultatif` | Téléphone facultatif, email obligatoire |
| #3 | `fix/securite-partenaires` | Revue sécu du 25/11 |
| #2 | `feat/compte-fove` | Compte client FOVE, connexion Google |
| #1 | `feat/vitrine-theme` | Offres, facturation, thème de la vitrine, tarifs |

## 6. Manques, risques et dettes

Rien de bloquant pour le cœur métier. Priorité : recetter les services externes avec de vraies clés de test.

| Sujet | Constat | Impact | Action proposée |
|---|---|---|---|
| Services externes | Stripe, Google Wallet, Apple Wallet, Resend, WhatsApp jamais appelés en réel | Régression invisible jusqu'en production | Recette Stripe (`recette-facturation.md`), comptes Wallet, coupon `REFERRAL_STRIPE_COUPON_ID` |
| Apple Wallet sans certificat | `apple-wallet.ts:97` lève une `Error` simple : `/api/public/cards/<lien>/apple-wallet` renvoie 500 | Faible : bouton masqué si non configuré | Renvoyer une erreur métier 404 |
| Interface web | Aucun test de composant ni de bout en bout dans la CI | Régression d'écran détectée à la main | Quelques parcours Playwright : inscription, caisse, échange |
| Production | `ADMIN_MFA` et IP vue par l'API (journal d'audit) à vérifier | 2FA ou traçabilité inopérantes | Contrôle sur Railway |
| Juridique | Textes du compte client en « projet », durée de conservation 36 mois | Mise en ligne du compte client | Relecture juriste puis traduction |
| `.env.example` | En CRLF, 13 variables vides | Installation à neuf fragile | Passer en LF, commenter les variables vides |
| Documentation | `architecture.md` annonce Apple Wallet « à venir » ; le README annonce 67 tests API (330) | Lecteurs induits en erreur | Mettre à jour les deux fichiers |
| Limiteur de débit | En mémoire, une seule instance d'API | Contournable à 2 instances ou plus | Stockage partagé avant de multiplier les instances |
| Tâches planifiées | Cron GitHub toutes les 5 min, « au mieux » | Relances, échéances et expirations avec retard possible | Acceptable aujourd'hui |
| `package-lock.json` | Fichier npm non suivi à la racine, absent du `.gitignore` | Installation avec le mauvais outil | Supprimer et ignorer |
| Schéma | `PartnerSettings.updatedAt` a un DEFAULT en base absent du schéma | Ligne parasite dans chaque `migrate diff` | Aligner le schéma |

**Réglé depuis le 2 novembre** : lint web (2 erreurs), `.env.local` désormais facultatif pour l'API (`--env-file-if-exists`), CI rouge du 20 au 26/11 (variables de test), test sensible au changement d'heure.

**Décisions ouvertes et suites prévues**

- [ ] Match Kwata : coexistence ou bascule du module de fidélité interne ; appel `@fove/sdk` côté boutique.
- [ ] Stripe : clés live seulement après la recette en mode test.
- [ ] Stores : compiler et publier les apps iOS et Android.
- [ ] Caissiers sans email (comptes réservés à la caisse).
- [ ] Annuaire des commerces (positions GPS déjà en place, offres payantes).
- [ ] WhatsApp automatique (V2 des relances).
- [x] Mobile money : projet futur, retiré du produit (27/11).
- [x] Partenaires : n'encaissent plus, versements mensuels (26/11).

## 7. Tenir ce document à jour

À chaque PR mergée :

1. Lister les nouveaux commits : `git log --oneline <dernier commit analysé>..HEAD`.
2. Ajouter la PR en tête du tableau de la section 5.
3. Relancer `pnpm typecheck`, `pnpm --filter @fove/web lint`, `pnpm test` et reporter les chiffres en section 4.
4. Changer le statut des domaines touchés (section 3). « Vérifié » = tests qui passent **et** contrôle en direct.
5. Retirer les dettes réglées, ajouter les nouvelles, cocher les décisions prises.
6. Ajouter une ligne au journal et changer la date en haut.

**Journal des révisions**

| Date | Dernier commit analysé | Changement |
|---|---|---|
| 2026-11-28 | `1de707f` | Document passé dans le dépôt ; 110 commits et 24 PR repris, 397 tests, statuts par domaine refaits, dettes mises à jour ; historique par PR au lieu de par commit |
| 2026-11-02 | `139126f` | Première version (Claude Docs) : 28 commits, 117 tests, parcours commerçant en direct |
