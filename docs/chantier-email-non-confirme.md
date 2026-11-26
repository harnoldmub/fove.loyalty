# Chantier — Limites des comptes à l'email non confirmé

> Statut : **codé le 25 novembre 2026** (E1 à E4). Validée le 25 novembre 2026 (grille telle quelle, limite douce à 50 clients, relances J1/J3/J7 et client J3/J10). Rédigée après la revue de sécurité du même jour.
>
> **Mise à jour du 26 novembre 2026** : avec la connexion par code ([chantier-connexion-otp.md](chantier-connexion-otp.md)), tout nouveau compte a un email confirmé. Les limites restent comme filet de sécurité pour les comptes antérieurs ; les relances J1/J3/J7 et le lien de confirmation sont supprimés (se reconnecter avec un code confirme l'adresse).

## 1. Pourquoi

FOVE ne demande pas de confirmer l'email à l'inscription : un commerçant ou un client essaie le produit tout de suite, c'est voulu. Mais un email non confirmé n'est **pas une identité prouvée** : n'importe qui peut s'inscrire avec l'adresse d'un autre.

La revue de sécurité du 25 novembre l'a montré :
- un compte non confirmé pouvait prendre le profil d'un partenaire et détourner ses versements (corrigé) ;
- plus largement, un compte non confirmé peut aujourd'hui faire presque tout côté commerçant.

**Principe.** Tout ce qui sert à **essayer FOVE et à servir ses clients en caisse** reste libre. Tout ce qui **engage de l'argent, envoie des messages à des tiers ou fait sortir des données** exige l'email confirmé. On ne cache rien : la fonction reste visible et explique comment la débloquer.

Ce qu'une confirmation ne protège pas : un attaquant peut confirmer sa propre adresse. Ces limites servent l'identité et la responsabilité, pas la validation des données (assurée par le code).

## 2. Qui est concerné

| Compte | Email non confirmé possible ? |
|---|---|
| Propriétaire inscrit seul (`/signup`) | **Oui** : c'est le cas principal de ce chantier |
| Collaborateur invité | Non : l'acceptation de l'invitation confirme l'email |
| Connexion Google (commerçant ou client) | Non : Google garantit l'email |
| Client FOVE créé au scan (« Créer ma carte ») | **Oui** : déjà limité par le lot A (voir 5) |

## 3. Grille commerçant

Aujourd'hui, seules la création d'une clé API et celle d'un webhook exigent l'email confirmé.

| Reste libre sans confirmation | Exige l'email confirmé |
|---|---|
| Créer le commerce, terminer l'assistant de démarrage | **Inviter des collaborateurs**, changer un rôle, désactiver un membre : FOVE écrit à des tiers au nom du commerce |
| Programmes, récompenses, établissements, QR d'inscription, affiche | **Exporter les données d'un client** (export RGPD ; il n'existe pas d'export de la liste) |
| Scanner, créditer, utiliser une récompense, ajuster, annuler | **Importer un fichier clients** : des données personnelles de tiers en masse |
| Inscrire un client en caisse, partager sa carte (lien `wa.me`) | **Envois groupés** : campagnes Wallet à tous les clients d'un programme |
| Paramètres, logo, statistiques, transactions | **Intégrations** : clés API et webhooks (déjà fait), **connecteur boutique en ligne** |
| **Payer un abonnement** (décision du 3 novembre : ne jamais bloquer un achat) | **Espace partenaire** (déjà fait le 25 novembre) |

Hors grille, inchangé : message Wallet à **un** client, envoi WhatsApp automatique d'**un** lien de carte (déjà réservé aux offres payantes).

### Limite douce : 50 clients (décidé le 25 novembre 2026)

Au-delà de **50 clients** inscrits, si aucun propriétaire du commerce n'a confirmé son email, l'inscription de nouveaux clients exige l'email confirmé (caisse, import, QR du commerce, boutique, API). Le commerçant peut lancer son programme le premier jour, mais ne peut pas bâtir un vrai fichier clients sous une identité non prouvée.

- Les clients déjà inscrits gardent leurs cartes ; crédits et récompenses ne sont jamais bloqués.
- Au QR, le client voit le message habituel « inscriptions momentanément fermées » ; le commerçant est prévenu par email (même mécanisme que le quota de l'offre).

## 4. Inciter à confirmer, sans bloquer

1. **Bandeau** dans l'espace commerçant (il existe déjà : « Confirmez votre email pour sécuriser votre compte et activer les intégrations ») : texte élargi à ce qu'il débloque, avec le bouton « Renvoyer l'email ».
2. **Boutons explicites** : « Inviter », « Exporter », « Importer », « Envoyer à tous » restent visibles ; s'ils sont bloqués, une fenêtre explique « Confirmez d'abord votre email » avec le renvoi en un clic. L'API renvoie le code `email_not_verified` (déjà en place), que le site sait afficher sans déconnecter.
3. **Relances** : aujourd'hui une seule, entre le 1er et le 7e jour. Décidé : **J1, J3 et J7**, puis plus rien.

## 5. Côté client FOVE

Déjà en place (lot A) : sans confirmation, le client utilise sa carte et revient chez le même commerce ; la confirmation est exigée pour « Mes cartes », un 2e commerce, un autre appareil et les programmes « code par email ».

Ajouts proposés :
- **Relances** de confirmation : aujourd'hui, seul l'email de bienvenue part. Décidé : **J3 et J10**, avec le bouton qui saisit le code.
- Rien de plus à bloquer : le compte non confirmé ne fonctionne que sur son appareil.

## 6. Découpage

| Lot | Contenu |
|---|---|
| **E1. Règles API** | `@RequireVerified()` sur les routes de la grille (invitations et équipe, export client, import, envois groupés Wallet, connecteur boutique) ; limite douce si retenue ; tests |
| **E2. Écrans** | Bandeau élargi, fenêtre « Confirmez d'abord votre email » ouverte par toute action refusée (`email_not_verified`) ; 4 langues |
| **E3. Relances** | Commerçant J1/J3/J7, client J3/J10 ; 4 langues ; tests |
| **E4. Référentiel** | `docs/fonctionnalites.md`, `docs/securite.md` |

## 7. Décisions (25 novembre 2026)

1. Grille de la section 3 : validée telle quelle.
2. Limite douce : oui, 50 clients.
3. Relances : J1/J3/J7 (commerçant) et J3/J10 (client).
