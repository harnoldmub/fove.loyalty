# Chantier — Compte client FOVE (lot A)

> Statut : **spécification validée**, développement en cours. Décisions prises le 20 novembre 2026.
>
> | A1 | A2 | A3 | A4 | A5 |
> |---|---|---|---|---|
> | Fait (20 nov.) | Fait (24 nov.) | Fait (24 nov.) | Fait (24 nov.) | À faire |

## 1. Pourquoi

Aujourd'hui, un client crée **une carte par commerce, sans compte**. Il en résulte trois problèmes :
- il ressaisit les mêmes informations dans chaque commerce ;
- il doit retrouver la bonne carte à chaque passage ;
- sur un nouveau téléphone, il ne retrouve sa carte que par un lien envoyé à l'email de sa fiche, ou en caisse.

Le lot A crée un **compte client FOVE**. Une seule identité regroupe toutes les cartes du client ; **chaque carte reste aux couleurs de son commerce**, dans l'application comme dans le Wallet.

## 2. Décisions

| Sujet | Décision |
|---|---|
| Modèle | Identité unique, une carte par commerce, à ses couleurs. Pas de carte FOVE commune. |
| Identifiant de connexion | **L'email**, ou le compte Google. **Jamais le numéro de téléphone** : un numéro inactif peut être réattribué à quelqu'un d'autre. Le téléphone reste une information de contact. |
| Connexion | **Google**, ou **code à 6 chiffres envoyé par email**. Aucun mot de passe. |
| Confirmation de l'email | Pas demandée au premier scan : la carte est utilisable tout de suite. Elle devient **obligatoire pour ajouter une carte dans un 2e commerce, se connecter sur un autre appareil ou ouvrir « Mes cartes »**. Un 2e passage chez le même commerce n'est jamais bloqué. |
| Compte obligatoire | **Oui pour créer sa carte soi-même** par le QR ou la page du commerce. Les cartes créées en caisse, par import ou par la boutique en ligne restent possibles sans compte, et se rattachent plus tard. |
| Annuaire des commerces (lot B) | Réservé aux **offres payantes**, sur activation par le commerçant. Hors lot A. |

## 3. Parcours

### 3.1 Scan du QR d'un commerce (ou page `/<adresse-du-commerce>`)

| Situation | Ce qui se passe |
|---|---|
| **Connecté, et déjà une carte** dans ce programme | Sa carte s'ouvre directement |
| **Connecté et confirmé, pas de carte ici** | « Rejoindre Café D ? » : présentation du programme et des récompenses, téléphone pré-rempli, case d'acceptation des conditions de D, bouton **Créer ma carte**. Rien d'autre à saisir. |
| **Connecté mais pas confirmé, et il a déjà une carte dans un autre commerce** | « Confirmez votre email pour ajouter une carte ». Code envoyé, puis retour au parcours précédent. |
| **Pas connecté** | Deux choix : **Créer ma carte** ou **J'ai déjà un compte FOVE** |

**Créer ma carte**, sans être connecté :
- **Continuer avec Google** : prénom, nom et email viennent de Google, déjà vérifiés. Le client complète son téléphone et accepte les conditions. Compte confirmé, carte active.
- **Avec mon email** : prénom, nom (facultatif), téléphone, email, acceptation des conditions, consentement aux offres (facultatif). Compte créé **non confirmé**, carte active tout de suite (sauf validation en magasin, voir 4.4). Un email part avec un lien et un code de confirmation. Sur la carte : « Confirmez votre email pour retrouver vos cartes partout ».
  - **Email déjà connu** (compte FOVE existant, ou fiche chez ce commerce avec cet email) : rien n'est créé. Un code part, et une fois saisi, le client est connecté et sa carte est créée dans son compte, ou sa fiche existante est reprise (décision du 24 novembre 2026, voir 4.7).

**J'ai déjà un compte FOVE** : Google, ou email puis code. Après connexion, retour au tableau ci-dessus.

### 3.2 Connexion par email

1. Le client saisit son email et reçoit un **code à 6 chiffres** : valable 10 minutes, 5 essais, renvoi possible après 1 minute.
2. Code juste : il est connecté **sur cet appareil**, et l'email est confirmé du même coup.
3. **Le message affiché est le même que l'email ait un compte ou non** : on ne peut pas savoir qui est inscrit. Saisir le code pour un email sans compte mène à la création du compte.

### 3.3 Espace « Mes cartes » (`/mes-cartes`)

*Réservé aux comptes confirmés.*
- La liste de ses cartes, chacune avec le logo, la couleur, le nom du commerce et du programme, et le solde. Un appui ouvre la carte : c'est la page de carte actuelle, inchangée.
- **Cartes à rattacher** : les cartes créées en caisse, par import ou par la boutique en ligne **avec son email**. Message : « Ces cartes vous appartiennent ? » → **Ajouter à mon compte** ou **Ce n'est pas moi**. Seules les fiches qui ont une carte sont proposées ; une fiche sans carte est reprise au scan du QR du commerce. Un refus est définitif pour ce compte.
- **Mon profil** : prénom, nom, téléphone. L'email ne change pas dans le lot A.
- **Déconnexion** de cet appareil.
- **Supprimer mon compte** : voir 4.6.
- Installable sur l'écran d'accueil, comme la carte aujourd'hui.

### 3.4 Nouveau téléphone (le cas qui a motivé le chantier)

Le client scanne le QR, choisit « J'ai déjà un compte FOVE », se connecte avec Google ou le code email : sa carte s'ouvre, et toutes les autres sont dans « Mes cartes ». Aucune aide du caissier, aucune ressaisie.

### 3.5 Ce qui ne change pas

- **La caisse** : scanner, recherche par nom ou téléphone, crédit, récompenses, partage par WhatsApp.
- **La carte et le Wallet** : une carte par commerce, à ses couleurs.
- **Le lien secret de chaque carte** continue de fonctionner sans connexion : les liens déjà envoyés restent valables.
- **Les cartes créées par le commerçant** : en caisse, par import, par la boutique en ligne.
- **Le commerçant ne voit rien du compte** : ni les autres commerces du client, ni ses autres cartes.

## 4. Règles

### 4.1 Rattachement d'une carte à un compte

- Une carte est rattachée à un compte quand le client la crée en étant connecté, ou quand il accepte une carte proposée dans « Mes cartes ».
- **Proposition uniquement sur l'email vérifié du compte.** Jamais sur le téléphone, à cause de la réattribution des numéros.
- Une fiche client d'un commerce n'appartient qu'à un seul compte.

### 4.2 Le client a déjà une fiche chez ce commerce

| Cas | Règle |
|---|---|
| Fiche avec **le même email**, compte **confirmé** | La fiche est rattachée au compte. Si le client n'a pas encore de carte dans ce programme, elle est créée sur cette fiche. Pas de doublon. |
| Fiche avec le même email, compte **non confirmé** | « Confirmez votre email pour retrouver votre carte ». Code, puis rattachement. Sans cette étape, quelqu'un qui tape l'email d'un autre récupérerait sa carte. |
| Fiche avec **le même téléphone** mais un autre email (ou sans email) | **Pas de rattachement**. Le numéro a pu changer de titulaire. Une nouvelle fiche est créée **sans le téléphone**, avec l'email du compte, et le commerçant voit les deux fiches. Le même principe existe déjà pour la boutique en ligne. |

### 4.3 Téléphone

- Il reste **obligatoire pour créer une carte**, comme aujourd'hui : il sert au commerçant pour le contact et WhatsApp.
- Il est enregistré sur le compte et **pré-rempli** lors des inscriptions suivantes.
- Il n'est jamais utilisé pour se connecter ni pour rattacher une carte.

### 4.4 Validation des inscriptions du programme

| Réglage du programme | Avec le compte FOVE |
|---|---|
| Immédiate | Carte active tout de suite |
| Code par email | **Compte confirmé exigé.** Avec Google, rien de plus. Avec l'email, la saisie du code de confirmation active à la fois le compte et la carte. Le code de carte actuel disparaît pour ce parcours. |
| En magasin | Inchangé : la carte est activée par un employé |

### 4.5 Sessions

- La session client est **distincte** de celle des commerçants : autre cookie, autre table. Un commerçant peut aussi être client FOVE avec le même email, sans mélange.
- Durée : **180 jours** glissants sur l'appareil.
- Le compte non confirmé n'est connecté **que sur l'appareil où il a été créé**.

### 4.6 Suppression du compte (RGPD)

- Le compte FOVE est supprimé, et les cartes sont **détachées** du compte.
- Les fiches et les cartes restent chez chaque commerçant, qui reste responsable de ses données, et leurs liens continuent de fonctionner. Pour effacer ses données chez un commerçant, le client s'adresse à lui, comme aujourd'hui.
- Un commerçant qui efface la fiche d'un client la détache du compte.

### 4.7 Sécurité

- Codes : valables 10 minutes, 5 essais, renvoi après 1 minute, nombre de demandes limité par email et par adresse IP.
- Connexion Google : le jeton Google est vérifié par le serveur. FOVE ne garde que l'email, le nom et l'identifiant Google.
- Aucune réponse ne révèle si un email a un compte, ni si une personne a une carte chez un commerce. **Exception assumée** (24 novembre 2026) : « Créer ma carte » avec un email déjà connu demande le code au lieu de créer la carte, ce qui indique que l'email est inscrit. C'était déjà le cas avec « Vous êtes déjà inscrit(e) », et les demandes sont limitées en nombre.
- Le commerçant ne reçoit jamais le lien entre sa fiche et le compte FOVE (champ masqué par défaut dans toutes les requêtes) : il ne peut pas reconnaître un même client d'un commerce à l'autre.
- Les actions sur le compte sont inscrites au journal d'audit : création, confirmation, connexion, rattachement, suppression.

## 5. Données

Nouveaux éléments, sans toucher aux fiches existantes :

| Élément | Contenu |
|---|---|
| **Compte client** (`ClientAccount`) | email (unique sur toute la plateforme), date de confirmation, prénom, nom, téléphone, identifiant Google, dates |
| **Session client** (`ClientSession`) | empreinte du jeton, compte, appareil, expiration |
| **Code de connexion** (`ClientLoginCode`) | email, empreinte du code, essais, expiration |
| **Fiche client** (`Customer`) | nouveau champ facultatif : compte client rattaché (unique par commerce) |

Phase de développement : aucune reprise de données. Les fiches existantes restent sans compte et se rattachent par l'email (4.1).

## 6. Découpage

Chaque sous-lot a sa branche et ses tests, et il est validé avant le suivant.

**Langues** : chaque écran, message d'erreur et email du chantier existe dans les 4 langues de la plateforme (français, anglais, arabe, espagnol), dans `apps/web/messages/` et `apps/api/src/i18n/`.

| Sous-lot | Contenu | Prérequis |
|---|---|---|
| **A1. Socle du compte** | Données, connexion par code email, session client, déconnexion, profil, suppression du compte | Envoi d'emails actif en production (Resend) |
| **A2. Parcours au scan** | Page d'inscription selon les cas de 3.1, création de carte avec compte, ouverture directe de la carte, rattachement automatique (4.2), règles de validation (4.4), confirmation exigée pour un 2e commerce | A1 |
| **A3. « Mes cartes »** | Liste des cartes, cartes à rattacher, espace installable | A2 |
| **A4. Connexion Google** | Bouton « Continuer avec Google » dans tous les parcours. Réutilise l'échange OAuth déjà en place pour les commerçants (`GOOGLE_OAUTH_*`, PKCE), avec une adresse de retour et une session propres au compte client. | Adresse de retour client déclarée sur l'identifiant OAuth Google existant |
| **A5. Textes et référentiel** | CGU et politique de confidentialité côté clients, mise à jour de `docs/fonctionnalites.md` | Relecture juridique |

### Prérequis à lancer dès maintenant (hors code)

1. **Google Cloud** : sur l'identifiant OAuth existant (connexion Google des commerçants), ajouter les URI de redirection du compte client : `http://localhost:5290/api/client/auth/google/callback` et `https://<domaine de production>/api/client/auth/google/callback`. Sans cela, Google refuse la connexion des clients. La variable `GOOGLE_OAUTH_CLIENT_REDIRECT_URI` n'est utile que si l'adresse diffère de `APP_URL`.
2. **Resend** : vérifier que l'envoi est actif en production, avec le domaine d'envoi vérifié.
3. **Juridique** : prévoir la relecture des CGU et de la politique de confidentialité côté clients (A5).

## 7. Hors lot A

- **Lot B** : coordonnées GPS des établissements, cartes Wallet affichées près du commerce (Apple et Google), annuaire des commerces réservé aux offres payantes.
- **Lot C** : sponsoring dans l'annuaire.
- **Lot D** : application mobile. Elle imposera « Continuer avec Apple » sur iPhone, puisqu'elle proposera Google.
- Changement d'email du compte, fusion de deux comptes, « Continuer avec Apple » sur le web.
