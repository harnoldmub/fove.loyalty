# FOVE — Référentiel fonctionnel

Ce document décrit **tout ce que l'application permet de faire**, pour chaque type d'utilisateur, avec les règles métier qui s'appliquent. Il se lit sans ouvrir le code ni l'application.

- **État décrit** : branche `main` au commit `483f3bc` (10 novembre 2026), complétée le 24 novembre 2026 par le **compte client FOVE** (branche `feat/compte-fove` : sections 1, 2, 8 et 9), le 25 novembre par le **parrainage** (3.16), et le 26 novembre par les **prix dans plusieurs monnaies** et l'**encaissement hors ligne** (branche `feat/multi-devises` : sections 3.14 à 3.16, 4, 5, 6, 7, 8 et 9), puis les **partenaires sans encaissement** et les **versements mensuels** (branche `feat/partenaires-sans-encaissement` : sections 3.14, 4.3, 5, 6, 8 et 9 ; 261 tests API au vert ; specs [chantier-multi-devises.md](chantier-multi-devises.md) et [chantier-encaissement-hors-ligne.md](chantier-encaissement-hors-ligne.md)).
- **Ce qui est décrit** : les fonctions présentes dans le code et accessibles dans l'application. Quand une fonction dépend d'une configuration externe, n'a pas de test automatisé ou est incomplète, elle porte le repère **⚠** et le détail est donné en [section 9](#9-partiel-ou-pas-encore-disponible).
- **Ce qui n'est pas décrit** : l'architecture technique ([architecture.md](architecture.md)), la sécurité ([securite.md](securite.md)), le RGPD ([rgpd.md](rgpd.md)) et la recette de paiement ([recette-facturation.md](recette-facturation.md)).

**À tenir à jour.** Avant de développer une fonction, vérifier ici ce qui existe déjà. Après l'avoir livrée, mettre à jour la section concernée dans la même PR, ainsi que la section 9 si la fonction reste partielle.

## Sommaire

1. [Vue d'ensemble](#1-vue-densemble)
2. [Le client final](#2-le-client-final)
3. [Le commerçant et son équipe](#3-le-commerçant-et-son-équipe)
4. [Les offres](#4-les-offres)
5. [Les partenaires commerciaux](#5-les-partenaires-commerciaux)
6. [Le super admin FOVE](#6-le-super-admin-fove)
7. [La vitrine](#7-la-vitrine)
8. [Règles communes](#8-règles-communes)
9. [Partiel ou pas encore disponible](#9-partiel-ou-pas-encore-disponible)

---

## 1. Vue d'ensemble

FOVE est une plateforme de **cartes de fidélité dématérialisées** pour les commerces : restaurants, salons, boutiques, réseaux de points de vente. Le client garde sa carte sur son téléphone (page web, Apple Wallet, Google Wallet) et la présente en caisse. Le commerçant gère son programme depuis un espace d'administration. FOVE vise d'abord la RDC et l'Afrique francophone, et fonctionne en plusieurs devises.

### Les acteurs

| Acteur | Ce qu'il fait | Où |
|---|---|---|
| **Client final** | Crée son compte FOVE et ses cartes, les garde sur son téléphone, cumule et utilise ses avantages | Page d'inscription du commerce, page de sa carte, « Mes cartes » (`/mes-cartes`), Wallet |
| **Commerçant** | Configure son programme, enregistre les achats, gère ses clients et son équipe | Espace `/app` |
| **Collaborateur du commerçant** | Agit selon son rôle : caisse, gestion, lecture | Espace `/app` |
| **Partenaire commercial** | Recommande FOVE à des commerces et touche une commission | Espace `/partner` |
| **Super admin FOVE** | Pilote la plateforme : entreprises, offres, partenaires, finance | Espace `/admin` |
| **Associé, responsable financier** | Consulte et gère le centre financier uniquement | `/admin/finance` |
| **Visiteur** | Découvre FOVE, compare les offres, prend contact | Site public |
| **Développeur du commerçant** | Relie la caisse ou la boutique en ligne à FOVE | API, widget, webhooks |

### Le vocabulaire

| Terme | Définition |
|---|---|
| **Entreprise** (ou commerce) | Le compte d'un commerçant sur FOVE. Une personne peut appartenir à plusieurs entreprises. |
| **Établissement** | Un point de vente de l'entreprise. Chaque opération indique où elle a eu lieu. |
| **Programme** | Les règles de fidélité : mode **Points** ou **Tampons**, devise, conditions. Une entreprise peut avoir plusieurs programmes, selon son offre. |
| **Carte** | L'adhésion d'un client à un programme. Elle a un numéro, un QR personnel à présenter en caisse et un lien secret pour la consulter. |
| **QR d'inscription** | Le QR affiché au comptoir. Il ne sert qu'à **créer** une carte, et il est différent du QR personnel de chaque carte. |
| **Récompense** | Ce que le client obtient avec ses points ou tampons : un cadeau, une réduction en pourcentage ou une réduction d'un montant fixe. |
| **Opération** | Toute variation de solde : gain, ajustement, utilisation de récompense, annulation, expiration. Aucune opération ne s'efface. |
| **Compte FOVE** | L'identité du client final, commune à tous les commerces : elle regroupe ses cartes, chacune restant aux couleurs et aux règles de son commerce. Le commerçant ne la voit pas. |
| **Segment** | Le statut relationnel calculé pour chaque client : Nouveau, VIP, Régulier, En risque, Dormant. |

---

## 2. Le client final

Le client a un **compte FOVE**, sans mot de passe : il se connecte avec **Google** (le chemin mis en avant) ou avec un **code à 6 chiffres reçu par email**. Le compte regroupe ses cartes de tous les commerces ; chaque carte garde ses couleurs, ses règles et son lien secret personnel, qui continue de fonctionner sans connexion. Le téléphone n'est **jamais** un identifiant : un numéro inactif peut être réattribué à quelqu'un d'autre.

### 2.1 Obtenir sa carte

Il y a quatre manières d'obtenir une carte :
1. **Scanner le QR d'inscription** affiché chez le commerçant (sur l'affiche imprimable, par exemple).
2. **Ouvrir la page du commerce** `fove.digital/<adresse-du-commerce>`. Le lien peut être partagé sur les réseaux, avec un aperçu au logo du commerce.
3. **Être inscrit par le commerçant** en caisse, ou par import d'un fichier. Le commerçant lui envoie ensuite le lien.
4. **Commander sur la boutique en ligne** d'un commerçant relié à FOVE : la carte est créée à la première commande payée.

Sur la page d'inscription, le client voit :
- le nom, le logo et la couleur du commerce ;
- l'établissement concerné ;
- la règle de gain (« 1 point par tranche de 1 000 CDF » ou « 10 tampons = récompense ») ;
- jusqu'à 6 récompenses ;
- les conditions du programme ;
- le lien vers la politique de confidentialité du commerçant.

**Ce que voit le client en scannant le QR**, selon sa situation :

| Situation | Ce qui se passe |
|---|---|
| Connecté, et déjà une carte dans ce programme | Sa carte s'ouvre directement. |
| Connecté avec un compte confirmé, sans carte ici | « Rejoindre <commerce> » : téléphone facultatif (pré-rempli s'il est connu), acceptation des conditions du programme, un bouton. |
| Connecté sans avoir confirmé son email, et une carte dans un autre commerce | « Confirmez votre email » (Google ou code), puis inscription. Un nouveau passage chez le **même** commerce n'est jamais bloqué. |
| Pas connecté | **Continuer avec Google** (en premier), **J'ai déjà un compte FOVE** (code par email), ou **Créer ma carte** avec son email. L'onglet « Retrouver ma carte » reste disponible ([2.3](#23-retrouver-sa-carte)). |

**Créer ma carte** sans être connecté demande :

| Champ | Règle |
|---|---|
| Prénom | Obligatoire |
| Nom | Facultatif |
| Téléphone | Facultatif ; s'il est saisi, il doit être valide (contact pour le commerce, jamais identifiant) |
| Email | Obligatoire : c'est l'identifiant du compte FOVE |
| Conditions du programme | Acceptation obligatoire ; la mention sous le bouton vaut acceptation des conditions et de la politique de confidentialité du compte FOVE |
| Offres commerciales | Consentement facultatif. Il couvre les offres par email et par SMS ou WhatsApp. |

- **Email nouveau** : le compte est créé (non confirmé) en même temps que la carte, utilisable tout de suite. Un email de bienvenue contient le code de confirmation et un bouton qui le saisit à la place du client.
- **Email déjà connu** (compte FOVE existant, ou fiche chez ce commerce avec cet email) : rien n'est créé ; un code est envoyé. Une fois le code saisi, le client est connecté et sa carte est créée dans son compte, ou sa fiche existante est reprise sans doublon. Ce cas indique que l'email est déjà inscrit : choix assumé le 24 novembre 2026.

**Règles**
- **Inscription sans compte** : elle n'existe plus par le QR ou la page du commerce. Les cartes créées en caisse, par import ou par la boutique en ligne restent possibles sans compte ; elles se rattachent plus tard ([2.6](#26-le-compte-fove-et--mes-cartes-)).
- **Reprise d'une fiche existante** : uniquement sur l'**email confirmé** du compte. Un téléphone déjà connu du commerce sous un autre email donne une **nouvelle fiche sans téléphone** (le numéro a pu changer de titulaire) ; le commerçant voit alors deux fiches.
- **Validation de l'inscription**, réglée par le commerçant sur chaque programme :
  - *Immédiate* : la carte est active tout de suite.
  - *Code par email* : un compte confirmé est exigé. Avec Google, la carte est active tout de suite ; avec un email non confirmé, la carte attend, et la confirmation du compte (code ou Google, depuis la carte, « Mes cartes » ou le lien de l'email) l'active.
  - *En magasin* : la carte est activée par un employé au prochain passage.

  Tant qu'elle n'est pas validée, la carte est « en attente » et ne peut pas être ajoutée au Wallet.
- **Inscriptions fermées.** Si l'entreprise a atteint son nombre maximum de clients, le client lit « Les inscriptions sont momentanément fermées. Demandez votre carte directement au commerçant ». Il ne voit jamais l'offre du commerçant ; le commerçant, lui, est prévenu par email.
- **Protection contre les abus** : champ piège anti-robots, nombre de tentatives limité par minute, codes limités par email et par adresse IP.

### 2.2 Sa carte

La page de la carte affiche :
- le logo du commerce, le prénom et l'initiale du nom du client, le numéro de carte ;
- **le QR personnel à présenter en caisse** ;
- le solde : points, ou grille de tampons ;
- la prochaine récompense et ce qu'il manque pour l'obtenir ;
- la liste des récompenses, marquées « Disponible » ou avec leur coût ;
- les 10 dernières opérations et les conditions du programme ;
- la mention « Propulsé par FOVE » si le commerçant est sur l'offre Gratuite.

**Mise à jour en temps réel.** Quand la page est ouverte pendant un passage en caisse, le solde se met à jour seul : son, vibration et animation des nouveaux tampons. Un message s'affiche quand une récompense est débloquée ou utilisée.

**Garder sa carte à portée de main**
- **Apple Wallet** sur iPhone, **Google Wallet** sur Android. Le bouton proposé dépend du téléphone ; un ordinateur affiche les deux. Le solde de la carte Wallet se met à jour après chaque opération.
- **Ajouter à l'écran d'accueil** : un raccourci qui s'ouvre comme une application, avec un guide selon le téléphone.
- **Télécharger la carte en image** (PNG).
- **Copier le lien** de la carte pour se l'envoyer.
- La carte est mémorisée sur le téléphone : la page d'inscription du commerce propose alors « Ouvrir ma carte ».

### 2.3 Retrouver sa carte

- **Avec son compte FOVE** (nouveau téléphone, autre navigateur) : « J'ai déjà un compte FOVE » ou « Continuer avec Google » sur la page du commerce, puis la carte s'ouvre ; toutes les autres sont dans « Mes cartes ». Aucune aide du caissier.
- **Sans compte** (carte créée en caisse, par exemple) : l'onglet « Retrouver ma carte » demande l'email ou le téléphone utilisé à l'inscription.
- Le lien de la carte est envoyé **à l'email enregistré sur la fiche**. Il n'est jamais affiché à l'écran.
- Il est aussi envoyé par **WhatsApp** si le commerçant est sur une offre payante et que l'envoi WhatsApp automatique est configuré ⚠.
- La réponse est la même, que la carte existe ou non : on ne peut pas savoir qui est inscrit.
- Le lien n'est pas changé, pour qu'une demande malveillante ne puisse pas couper la carte du vrai client.
- Sans email sur sa fiche, le client demande son lien en caisse.

### 2.4 Gagner et utiliser ses avantages

- Le client **ne peut rien créditer ni utiliser lui-même** : tout passe par la caisse du commerçant, ou par la boutique en ligne pour les commandes.
- Les règles de gain sont détaillées en [3.4](#34-programmes-et-qr-dinscription).
- **Carte à tampons** : utiliser la récompense remet la carte à zéro.
- **Expiration** : si le programme le prévoit, le solde expire après une période sans visite (30 jours minimum).

### 2.5 Ses données

- **Sa fiche et sa carte chez un commerce** : le commerçant en est responsable. Le client lui demande l'export ou l'effacement ([3.5](#35-clients)). L'équipe FOVE n'a pas accès aux fiches des clients des commerces.
- **Son compte FOVE** : Dizayna en est responsable. Le client modifie son profil et supprime son compte dans « Mes cartes » ; ses cartes restent alors chez chaque commerce, détachées. Textes : `/compte/conditions` et `/compte/confidentialite` (projets, voir [section 9](#9-partiel-ou-pas-encore-disponible)).
- **Le commerçant ne voit rien du compte** : ni son existence, ni les autres commerces du client.

### 2.6 Le compte FOVE et « Mes cartes »

- **Connexion** (`/mes-cartes/connexion`) : Google, ou email puis code à 6 chiffres (valable 10 minutes, 5 essais, renvoi après 1 minute, 5 codes par heure et par email). La réponse est la même que l'email ait un compte ou non ; un premier code juste crée le compte. Session de 180 jours, prolongée à chaque visite, distincte de celle des commerçants.
- **Google** : le compte est retrouvé par l'identifiant Google, sinon par l'email, sinon créé avec le prénom et le nom de Google. Il est toujours confirmé ⚠.
- **Confirmation de l'email** : exigée pour « Mes cartes », pour ajouter une carte dans un 2e commerce et pour se connecter sur un autre appareil. Quand le titulaire de l'email confirme un compte créé sans preuve, les autres sessions de ce compte sont fermées.
- **« Mes cartes »** (`/mes-cartes`, comptes confirmés) :
  - les cartes du compte, aux couleurs et au logo de chaque commerce, avec le solde, la plus récemment utilisée en premier ; un appui ouvre la carte ;
  - « **Ces cartes vous appartiennent ?** » : les fiches avec une carte enregistrées avec son email confirmé (caisse, import, boutique en ligne), avec « Ajouter à mon compte » ou « Ce n'est pas moi » (refus définitif pour ce compte) ;
  - profil (prénom, nom, téléphone ; l'email ne change pas), déconnexion de l'appareil, suppression du compte ;
  - **« Télécharger mes données »** : fichier JSON du compte (profil, appareils, cartes rattachées, refus, journal de sécurité), sans les données détenues par les commerces ;
  - installable sur l'écran d'accueil.
- **Sur la page d'une carte**, un compte non confirmé voit « Retrouvez vos cartes partout » pour confirmer son email.
- **Acceptation des textes** : la date et la version acceptées sont enregistrées à la création et à chaque connexion.
- **Relances de confirmation** d'un compte créé au scan : J3 et J10, avec un bouton vers la connexion (Google ou nouveau code).
- **Compte inactif** : sans connexion ni passage en caisse avec une carte rattachée pendant 36 mois (réglable), le client reçoit un email 30 jours avant la suppression ; se connecter garde le compte. La suppression détache les cartes, qui restent chez les commerces.

---

## 3. Le commerçant et son équipe

### 3.1 Créer son compte et démarrer

1. **Inscription sans mot de passe** ([chantier-connexion-otp.md](chantier-connexion-otp.md)) : « Continuer avec Google », ou email puis **code à 6 chiffres** reçu par email ; pour un nouvel email, nom et acceptation des CGU après le code. **L'email est donc confirmé dès la création du compte.**
   - Comptes antérieurs à la connexion par code restés **sans email confirmé** ([chantier-email-non-confirme.md](chantier-email-non-confirme.md)) : un bandeau et la fenêtre « Confirmez d'abord votre adresse email » proposent de se reconnecter avec un code, ce qui confirme l'adresse. D'ici là, l'usage simple reste libre : programmes, caisse, crédits, récompenses, paramètres, paiement d'un abonnement. Sont réservés aux comptes confirmés :
     - inviter ou gérer l'équipe, exporter les données d'un client, importer un fichier, envois groupés Wallet ;
     - clés API, webhooks, connecteur boutique, espace partenaire ;
     - **au-delà de 50 clients**, toute nouvelle inscription (caisse, import, QR, boutique, API) tant qu'aucun propriétaire n'a confirmé son email. Au QR, le client lit « inscriptions momentanément fermées » et le commerçant reçoit un email. Crédits et récompenses ne sont jamais bloqués.
   - Les collaborateurs invités (le lien reçu prouve l'adresse) et les connexions Google ont d'office un email confirmé.
   - Si la personne avait choisi une offre sur la page tarifs, ce choix est retenu jusqu'au paiement ([4.3](#43-règles-dabonnement)).
2. **Assistant de création du commerce**, que l'on peut interrompre et reprendre plus tard :
   - nom du commerce, adresse de sa page publique, pays (la devise se règle selon le pays) ;
   - logo et couleur principale, avec un aperçu de la carte ;
   - premier point de vente : nom et ville ;
   - premier programme, en points ou en tampons, avec sa première récompense ;
   - affichage du **QR d'inscription** à mettre au comptoir.
3. Le commerce démarre sur l'**offre Gratuite**. Il est rattaché à un partenaire commercial si la personne est arrivée par un lien partenaire ([5.2](#52-son-espace)), ou à un commerçant parrain si elle est arrivée par un lien de parrainage ([3.16](#316-parrainage-entre-commerçants)). Si les deux liens ont été suivis, **seul le premier cliqué** est retenu.

**Accès**
- Connexion par **Google** ou par **code à 6 chiffres** envoyé par email : aucun mot de passe. Code valable 10 minutes, 5 essais, nouveau code après une minute, au plus 5 codes par heure et par email ; même réponse que l'email ait un compte ou non.
- **Session de 90 jours glissants** : chaque utilisation repousse l'échéance ; déconnexion automatique quand elle expire.
- **Plusieurs entreprises** pour une même personne : un sélecteur permet de passer de l'une à l'autre.

### 3.2 Rôles de l'équipe

Chaque collaborateur a son propre accès, et ses opérations portent son nom. Il existe quatre rôles :

| Droit | Propriétaire | Gérant | Caissier | Lecture seule |
|---|:-:|:-:|:-:|:-:|
| Voir le commerce, les établissements, les programmes, les récompenses | ✓ | ✓ | ✓ | ✓ |
| Voir les clients et les transactions | ✓ | ✓ | ✓ | ✓ |
| Voir les statistiques | ✓ | ✓ | ✗ | ✓ |
| Créer et modifier des clients, leur ajouter une carte, partager une carte | ✓ | ✓ | ✓ | ✗ |
| Valider un achat au scanner | ✓ | ✓ | ✓ | ✗ |
| Faire utiliser une récompense | ✓ | ✓ | ✓ | ✗ |
| Annuler une opération, ajuster un solde | ✓ | ✓ | ✗ | ✗ |
| Annuler l'utilisation d'une récompense | ✓ | ✓ | ✗ | ✗ |
| Importer des clients, exporter les données d'un client | ✓ | ✓ | ✗ | ✗ |
| Effacer les données d'un client (RGPD) | ✓ | ✗ | ✗ | ✗ |
| Créer et modifier programmes, QR d'inscription, récompenses, campagnes Wallet | ✓ | ✓ | ✗ | ✗ |
| Créer et modifier des établissements | ✓ | ✓ | ✗ | ✗ |
| Voir l'équipe | ✓ | ✓ | ✗ | ✗ |
| Inviter, modifier ou désactiver des collaborateurs | ✓ | ✗ | ✗ | ✗ |
| Voir les intégrations | ✓ | ✓ | ✗ | ✗ |
| Créer des clés API, des webhooks, une connexion boutique | ✓ | ✗ | ✗ | ✗ |
| Voir l'abonnement | ✓ | ✓ | ✗ | ✗ |
| Changer d'offre, résilier, gérer le paiement | ✓ | ✗ | ✗ | ✗ |
| Modifier les paramètres du commerce, téléverser le logo | ✓ | ✗ | ✗ | ✗ |
| Consulter le journal d'audit | ✓ | ✓ | ✗ | ✗ |

**Limitation par établissement.** Un collaborateur peut être limité à certains établissements. Il ne peut alors enregistrer des achats et des utilisations de récompenses **que dans ses établissements**, et doit préciser l'établissement à chaque opération. Si aucun établissement n'est coché, il a accès à tous.

Les droits sont toujours vérifiés par le serveur. L'interface masque en plus les actions non autorisées.

### 3.3 Tableau de bord et statistiques

La vue d'ensemble et la page Statistiques présentent, sur une période au choix (aujourd'hui, 30 jours, 90 jours) :
- le nombre de membres, les nouveaux membres et les clients revenus ;
- les points distribués et utilisés, les récompenses utilisées ;
- les passages en caisse par jour et les nouveaux membres par jour ;
- l'activité par point de vente (passages et points) ;
- la **santé du fichier clients** : répartition par segment (VIP, réguliers, en risque, dormants), avec un raccourci « Relancer ».

On y trouve aussi des raccourcis : scanner une carte, afficher son QR d'inscription.

### 3.4 Programmes et QR d'inscription

**Un programme se règle ainsi :**

| Réglage | Détail |
|---|---|
| Mode | **Points** (selon le montant de l'achat) ou **Tampons** (par passage). Le mode ne peut plus changer une fois des cartes créées. |
| Points | X points gagnés par tranche de montant Y (par exemple 1 point pour 1 000 CDF) |
| Tampons | 1 à 10 tampons par achat ; 2 à 50 tampons pour la récompense. Le solde ne dépasse jamais la cible. |
| Devise | Celle du programme. Par défaut, celle du commerce. |
| Achat minimum | Facultatif : en dessous, rien n'est gagné |
| Plafond par achat | Facultatif : maximum de points ou tampons par opération |
| Expiration | Facultative : le solde expire après N jours sans visite (minimum 30) |
| Un passage par jour | Un seul passage compté par client et par jour, dans le fuseau horaire du commerce. Les commandes en ligne ne sont pas concernées. |
| Validation des inscriptions | Immédiate, code par email, ou en magasin ([2.1](#21-obtenir-sa-carte)) |
| Conditions | Texte affiché au client |
| Actif | Un programme désactivé ne permet plus ni inscription ni utilisation de récompense |

À la création d'un programme à tampons, la récompense de la carte pleine est créée d'office.

**QR codes d'inscription**
- Un programme peut avoir plusieurs QR d'inscription, chacun rattaché ou non à un établissement.
- Chaque QR compte les inscriptions qu'il a générées.
- Pour chaque QR, on peut copier le lien, télécharger le QR et ouvrir une **affiche à imprimer** (« Votre carte de fidélité, gratuite — Scannez avec l'appareil photo de votre téléphone »).
- Un QR peut être désactivé, puis réactivé. Les cartes déjà créées ne sont pas touchées.

### 3.5 Clients

**Liste**
- Recherche par nom, téléphone, email ou numéro de carte.
- Filtre par segment, chargement progressif.

**Créer un client**
- Prénom obligatoire ; téléphone **ou** email obligatoire.
- Consentements aux offres par email et par SMS ou WhatsApp.
- Création de sa carte dans un programme : facultative.
- Le téléphone ou l'email évite les doublons : un client déjà connu n'est jamais recréé ni fusionné automatiquement.

**Importer des clients** (gérant et propriétaire)
- Fichier CSV avec les colonnes `prenom`, `nom`, `telephone`, `email`, et si besoin `reference` et `anniversaire` (JJ/MM, ou date complète dont seuls le jour et le mois sont gardés). 5 000 lignes maximum.
- Création de leur carte dans un programme : facultative.
- Les doublons sont ignorés. L'import s'arrête au nombre maximum de clients de l'offre, et le rapport indique les lignes refusées pour ce motif.

**Fiche client**
- Coordonnées modifiables, référence externe, **anniversaire** (jour et mois seulement, facultatif ; aussi saisi par le client à l'inscription par QR et dans « Mes cartes », recopié sur ses fiches ; effacé avec la fiche).
- **Statut fidélité** : segment et action conseillée ([règles ci-dessous](#segments-de-clients)), nombre de visites, dernier passage, date d'arrivée.
- Consentements aux offres par email et par SMS ou WhatsApp.
- Tags (20 maximum) et notes internes.
- Cartes du client, avec leur solde et leur historique ; ajout d'une carte dans un autre programme.
- **Partager la carte**, sans jamais révéler le lien à l'écran :
  - envoi sur WhatsApp en un clic (lien `wa.me` pré-rempli) ;
  - envoi automatique par WhatsApp si l'offre le permet ⚠ ;
  - affichage du QR de la carte, à scanner par le client.
- **Créer un nouveau lien** : l'ancien cesse de fonctionner immédiatement, la carte et son solde ne changent pas. Utile si le lien a fuité.
- **Messages WhatsApp prêts à l'emploi** : partage de la carte, relance d'un client dormant ou en risque, client proche d'une récompense, remerciement d'un client VIP.
- **Notification Google Wallet** à ce client ⚠ : un titre et un message courts, 3 notifications au plus par 24 h (limite de Google).
- **Bloquer ou débloquer la carte**, et **activer une carte en attente** de validation en magasin.
- **Ajuster le solde** (gérant et propriétaire) : ajout ou retrait, avec un motif obligatoire.
- **Exporter les données du client** (droit d'accès RGPD) : toutes ses données chez ce commerçant.
- **Effacer les données du client** (propriétaire, droit à l'effacement) ⚠ : les données personnelles sont supprimées, l'historique des points est conservé sans aucune donnée identifiante. Le client effacé libère une place dans le nombre maximum de clients de l'offre.

#### Segments de clients

| Segment | Règle | Action conseillée |
|---|---|---|
| **VIP** | 8 visites ou plus, ou 500 de dépenses cumulées ou plus (unités de la devise), avec une visite il y a 60 jours au plus | Accueil personnalisé, avant-premières |
| **Nouveau** | 1 visite au plus et inscrit depuis 21 jours au plus | Expliquer le programme, inviter à revenir |
| **Dormant** | Pas de visite depuis plus de 75 jours, ou aucune visite et inscrit depuis plus de 60 jours | Message WhatsApp de reconquête avec une offre |
| **En risque** | Dernière visite il y a 35 à 75 jours | Relance WhatsApp avec son solde |
| **Régulier** | Tous les autres | Rappeler le solde avant la prochaine récompense |

Les règles s'appliquent dans cet ordre : un client qui correspond à la fois à VIP et à Nouveau est classé VIP.

### 3.6 Scanner et caisse

**Identifier le client**
- Scan du QR personnel avec la caméra du téléphone ou de la tablette.
- Ou recherche par nom, téléphone ou numéro de carte.
- Seules les cartes du commerce en cours sont trouvées.

**Fiche de caisse**
- Solde, segment du client et conseil d'accueil.
- Partage de la carte sur WhatsApp.

**Valider un achat**
- Saisir le montant (programme à points) ou valider le passage (programme à tampons).
- Facultatif : la référence du ticket ; l'établissement.
- **Le gain s'affiche avant confirmation.**
- Règles appliquées : achat minimum, plafond par achat, un passage par jour, tampons limités à la cible.
- Un double clic ou une connexion qui coupe ne crédite jamais deux fois. Deux scans simultanés de la même carte sont traités l'un après l'autre.

**Faire utiliser une récompense**

FOVE refuse l'utilisation dans chacun de ces cas :
- solde insuffisant ;
- récompense désactivée ou hors de sa période de disponibilité ;
- stock épuisé ;
- programme désactivé.

Pour une réduction, la caisse saisit le montant de l'achat. FOVE calcule la réduction à appliquer :
- elle est arrondie au centime ;
- elle ne dépasse jamais le montant de l'achat ;
- le caissier l'applique ensuite **dans sa propre caisse**.

Programme à tampons : la carte repasse à zéro.

### 3.7 Transactions

- Le journal liste **toutes les opérations**, de la plus récente à la plus ancienne. On peut le filtrer par type.
- **Rien ne s'efface** : une erreur se corrige par une annulation.
  - **Annuler un gain ou un ajustement** (gérant et propriétaire) : une seule fois par opération, avec un motif. Le solde peut alors devenir négatif si les points avaient déjà été dépensés.
  - Une utilisation de récompense s'annule depuis la page Récompenses.

### 3.8 Récompenses

| Réglage | Détail |
|---|---|
| Type | Cadeau ou service offert ; réduction en pourcentage (jusqu'à 100 %) ; réduction d'un montant fixe |
| Coût | En points ou en tampons |
| Description, conditions | Affichées au client |
| Stock | Facultatif ; vide = illimité |
| Période | Disponible à partir du… et jusqu'au… (facultatif) |
| Active | Une récompense inactive n'est plus utilisable |

- On peut modifier une récompense : les utilisations passées ne changent pas.
- On peut la **retirer** (archiver) : elle disparaît du catalogue, son historique reste.
- La page liste les **dernières utilisations**. Un gérant ou le propriétaire peut **annuler une utilisation** : les points sont rendus et la récompense est remise en stock, une seule fois.

### 3.9 Établissements

- Créer et modifier un point de vente : nom, adresse, ville, pays, téléphone, **position GPS** (facultative, « latitude, longitude » collé depuis une carte ; prépare l'annuaire des commerces) ; activer ou désactiver.
- Chaque achat et chaque utilisation de récompense peut indiquer l'établissement.
- Le nombre d'établissements est limité par l'offre.

### 3.10 Équipe

- **Inviter** un collaborateur par email, avec son rôle et ses établissements autorisés. Le lien est valable **7 jours**.
  - Une personne déjà inscrite sur FOVE accepte en se connectant.
  - Une nouvelle personne crée son accès depuis le lien ; son email est alors considéré comme confirmé.
- Révoquer une invitation en attente.
- Changer le rôle ou les établissements d'un collaborateur ; désactiver ou réactiver son accès.
- **Remplacer** un collaborateur (rotation des caissiers) : il est désactivé, son historique reste à son nom, et son remplaçant est invité avec le même rôle et les mêmes établissements, en un seul geste.
- Garde-fous :
  - on ne peut pas modifier son propre accès ;
  - l'entreprise garde toujours au moins un propriétaire ;
  - on ne peut pas inviter un autre propriétaire.
- Le nombre de collaborateurs est limité par l'offre. Le propriétaire compte pour un ; un collaborateur désactivé ne compte plus.
  - Une invitation en attente réserve une place dès son envoi.
  - L'acceptation est refusée si le commerce est plein entre-temps (« demandez-lui de libérer une place »).
  - Réactiver un collaborateur reprend une place : refusé si la limite est atteinte.

### 3.11 Campagnes Wallet

*Offres payantes uniquement.*
- **Message à tous les clients Wallet** d'un programme ou de tout le commerce. Les clients qui ont ajouté leur carte à Apple Wallet ou Google Wallet reçoivent une notification ⚠.
- Une confirmation est demandée, avec relecture avant l'envoi. **L'envoi ne peut pas être annulé.**
- Côté Google, une même carte ne reçoit pas plus de 3 notifications par 24 h.
- Sur l'offre Gratuite, le bouton renvoie vers l'abonnement.

### 3.12 Intégrations

*Selon l'offre : voir [section 4](#4-les-offres).*

| Outil | Ce qu'il permet | Condition |
|---|---|---|
| **Widget** | Un bloc à intégrer sur le site du commerçant. Il ouvre les pages FOVE (inscription, carte) et ne manipule jamais de points. Il fonctionne avec une **clé publique** limitée aux domaines déclarés. | Toutes les offres |
| **Clés API secrètes** | Accès programmé aux clients, cartes, opérations, récompenses. Chaque clé a ses droits (lecture clients, crédit de points…) et un environnement test ou production. La clé n'est affichée qu'une fois. On peut la révoquer. | Fonction API ; email confirmé |
| **Webhooks** | FOVE envoie une requête signée à une adresse HTTPS à chaque événement : client créé, carte créée, opération enregistrée, récompense utilisée, utilisation annulée. En cas d'échec, FOVE réessaie jusqu'à 8 fois sur environ 22 h. Un journal des envois est disponible. | Fonction API ; email confirmé |
| **Boutique en ligne** | Connexion d'une boutique, avec le programme à créditer. Une **commande payée** crédite des points, jamais deux fois pour la même commande. Un **remboursement**, même partiel, retire les points au prorata. La boutique peut afficher un lien « Voir ma carte » au client. Le client est retrouvé par sa référence boutique, puis par son email, sinon il est créé. | Fonction connexion boutique |

L'**API publique** (`/v1`) permet de :
- lister, rechercher, lire et créer des clients ;
- lister les programmes ;
- créer et lire des cartes ;
- lister, créer et annuler des opérations ;
- lister les récompenses et en faire utiliser une ;
- utiliser les trois points d'entrée de la boutique en ligne.

La documentation pour les développeurs est sur la page publique `/developpeurs`.

### 3.13 Paramètres

| Réglage | Détail |
|---|---|
| Nom du commerce, raison sociale | |
| Adresse de la page | La page publique `fove.digital/<adresse>` |
| Logo | Téléversé (PNG, JPEG ou WebP, 512 Ko maximum) ou par adresse web ⚠ |
| Couleur principale | Elle habille les cartes et la page d'inscription |
| Pays, devise, fuseau horaire | La devise est proposée selon le pays. Elle s'applique aux nouveaux programmes ; les programmes existants gardent la leur. 11 devises : EUR, USD, CDF, XOF, XAF, CAD, GBP, CHF, MAD, RWF, GNF. |
| Email de contact | Il reçoit notamment les alertes de quota |
| Politique de confidentialité | Adresse affichée aux clients à l'inscription |
| Compte Instagram | Affiché sur les cartes téléchargées |
| Bannière des cartes Wallet | Image en tête des cartes Apple Wallet et Google Wallet |

**Parrainage entre commerçants** : une carte renvoie vers la page « Parrainage » ([3.16](#316-parrainage-entre-commerçants)).

### 3.14 Abonnement

- Offre en cours, statut, date de renouvellement ou de fin.
- **Monnaie de facturation** : euro, dollar US, dirham marocain, dinar algérien ou franc congolais. Par défaut celle du pays du commerce (zone euro : euro ; Maroc : dirham ; Algérie : dinar ; RDC et autres pays : dollar). Modifiable : tout de suite sans abonnement payant en cours, sinon au renouvellement (l'abonnement garde sa monnaie jusque-là). Les prix des offres s'affichent dans cette monnaie.
- **Paiement en ligne** par carte en euros ou en dollars : en dirhams ou en dinars, le commerçant paie le prix en euros ; en francs congolais, le prix en dollars. La page l'indique.
- **Règlement hors ligne** (virement ou dépôt d'espèces sur le compte de FOVE), proposé si FOVE a renseigné des coordonnées pour le pays du commerce : « Payer par virement ou espèces » crée une **référence de paiement** (ex. `FV-7KQ4M2-X`) à indiquer obligatoirement dans le motif, affichée avec les coordonnées et envoyée par email. Sans abonnement payant, l'offre est **active tout de suite pour 7 jours** (accès provisoire, une seule fois par commerce), confirmée à réception du paiement ; sans paiement à cette date, retour au Gratuit (rien n'est supprimé). Un partenaire FOVE peut accompagner le commerçant, mais n'encaisse jamais : le paiement va toujours à FOVE. Un règlement en attente peut être annulé.
- **Abonnement réglé hors ligne** : pas de renouvellement automatique ni de résiliation ; l'année suivante se règle de la même façon (« Renouveler <offre> hors ligne »), éventuellement sur une autre offre. Le paiement par carte reste possible une fois l'abonnement terminé.
- **Utilisation** comparée aux limites de l'offre : clients, établissements, collaborateurs, programmes.
- **Changer d'offre**, **résilier**, **reprendre l'abonnement**, **annuler un changement programmé** : les règles sont en [4.3](#43-règles-dabonnement).
- **Factures et moyen de paiement** : ouverture du portail de paiement ⚠.
- Lien vers l'offre Sur-mesure.
- **Alertes de quota par email**, envoyées à l'email de contact : quand la limite de clients est atteinte, et quand une inscription par QR est refusée pour cette raison. Au plus une fois par jour et par motif.

### 3.15 Emails reçus par le commerçant et son équipe

Tous au gabarit de la marque, dans la langue du commerce. Ils partent à l'email de contact du commerce, sinon au propriétaire.

- Code de connexion.
- **Bienvenue** à la création du commerce : les trois premières étapes (programme, QR d'inscription, premier client).
- Invitation à rejoindre une entreprise (le lien suffit : pas de mot de passe, et un compte existant est connecté).
- Alertes de quota.
- **Abonnement** :
  - activation (carte ou paiement simulé) ;
  - passage à une offre supérieure (à la confirmation du paiement) ou programmation d'une offre inférieure ;
  - résiliation enregistrée, avec la date de fin ;
  - paiement par carte refusé, avec la date de fin du délai de grâce ;
  - fin de l'offre payante et retour au Gratuit (échéance, résiliation ou impayé), une seule fois.
- **Échéances** (abonnements réglés par virement ou espèces, qui ne se renouvellent pas seuls) : rappels **30 jours** et **7 jours** avant la fin, puis email de fin.
- Règlement hors ligne : instructions avec la référence et les coordonnées, **rappel 2 jours avant la fin de l'accès provisoire** (avec la référence), paiement reçu, fin de l'accès provisoire sans paiement.
- Parrainage : filleul abonné (crédit attendu et sa date), crédit acquis (montant et date d'expiration).

### 3.16 Parrainage entre commerçants

Spec : [chantier-parrainage.md](chantier-parrainage.md). Page `/app/parrainage` (permission facturation en lecture).

- **Réservé aux offres payantes** (fonction d'offre `referral`, réglable dans l'admin). En Gratuit, la page est visible mais verrouillée et invite à passer à une offre payante.
- **Lien** `fove.digital/signup?ref=<adresse-du-commerce>` (cookie de 30 jours), à copier ou partager sur WhatsApp. Face à un lien partenaire, le premier lien cliqué l'emporte.
- **Montants selon la monnaie** : 20 € / 20 $ / 200 MAD / 4 000 DA / 65 000 FC ; plafond 200 € / 200 $ / 2 000 MAD / 40 000 DA / 650 000 FC.
- **Filleul** : la remise est déduite de sa première souscription annuelle, dans la monnaie de sa facture (en ligne ou hors ligne), et affichée sur sa page Abonnement avant le paiement.
- **Parrain** : un crédit par filleul dans la monnaie de son abonnement, **acquis 14 jours après le premier paiement annuel** du filleul (annulé en cas de remboursement ou de résiliation pendant ce délai).
- **Plafond** par année civile : le plus petit du plafond de la grille ou du prix annuel de l'offre du parrain. Au-delà, « hors plafond » : 0 pour le parrain, remise maintenue pour le filleul. Aucune limite sur le nombre de filleuls.
- **Utilisation** : déduit automatiquement des factures suivantes dans la même monnaie (en ligne ou hors ligne), le plus ancien d'abord ; jamais en argent ; **expiration 3 ans** après l'acquisition.
- **Anti-abus** : pas de parrainage entre commerces d'un même propriétaire, ni avec la même carte bancaire (Stripe).
- **Page** : lien, gains (disponible, gagné, utilisé, en attente, prochaine expiration), plafond de l'année, filleuls et leur état (inscrit, en attente, acquis, hors plafond, hors offre, annulé, expiré), conditions complètes.
- **Invitation au programme partenaires** à 80 % puis à 100 % du plafond (encart et email, une fois par palier et par an), avec une candidature pré-remplie.
- **Vitrine** : ligne « Programme de parrainage (jusqu'à une année offerte) » dans les offres et le comparatif.

---

### 3.17 Relances et anniversaire

Menu **Relances** ([chantier-relances-anniversaire.md](chantier-relances-anniversaire.md)).

**À relancer** (toutes offres)
- Clients à relancer aujourd'hui (récompense qui attend, presque une récompense, en risque, dormant) et anniversaires des 7 prochains jours.
- Message proposé dans la langue du commerce, bouton **WhatsApp** pré-rempli ; une fois contacté (« WhatsApp » ou « Fait »), le client sort de la liste pendant 14 jours.
- Le raccourci « Relancer » du tableau de bord mène ici.

**Automatiques** (offres payantes, fonction « Campagnes Wallet »)
- Scénarios activés un par un, textes modifiables (variables `{prénom}`, `{commerce}`, `{solde}`, `{récompense}`, `{reste}`), aperçu ; texte vide = texte proposé traduit.

| Scénario | Déclencheur |
|---|---|
| Récompense qui attend | Récompense disponible depuis 7 jours sans être utilisée |
| Presque une récompense | Il manque 1 tampon (ou moins de 20 % des points), 2 jours après la dernière visite |
| Client dormant | Segment « dormant » (jusqu'à un an d'absence) ; bonus de retour en option, crédité une fois avec le message |
| Client en risque | Segment « en risque » |

- Envoi une fois par jour et par commerce, **entre 10 h et 19 h à son heure locale** ; au plus **une relance tous les 14 jours** par client ; un seul scénario par client ; jamais deux fois le même message pour la même absence.
- Canal : message sur la **carte Wallet** (Google, Apple) ; **email** si le client l'a accepté et qu'aucun iPhone n'a été prévenu, aux couleurs du commerce, avec un lien de **désinscription** (la carte reste active).
- Le message sur la carte ne compte pas comme une activité : il ne repousse pas l'expiration des points.

**Anniversaire** (offres payantes)
- Cadeau réglé par le commerçant (« 1 dessert offert »…), valable **3 jours avant à 7 jours après** (réglable), un par client et par an.
- Annonce au début de la période (« Votre anniversaire approche… valable jusqu'au… »), puis « Joyeux anniversaire ! » le jour J si le cadeau n'est pas utilisé. Ces messages passent avant les relances et ne comptent pas dans le plafond.
- **Au scanner** : « Cadeau d'anniversaire disponible », bouton « Utiliser » (une seule fois, tracé).

**Résultats** (offres payantes) : par scénario, messages envoyés, clients revenus en caisse dans les 30 jours et taux de retour (90 derniers jours) ; cadeaux d'anniversaire proposés et utilisés.

### 3.18 Caisse partagée (code caisse)

([chantier-code-caisse.md](chantier-code-caisse.md)) Toutes les offres.

- **Code caisse** : 4 chiffres, personnel, choisi par chaque collaborateur (bandeau d'invitation tant qu'il n'est pas choisi, ou Équipe > « Mon code caisse ») ; jamais visible ; réinitialisable par le propriétaire ou un gérant ; codes trop simples refusés ; **5 erreurs = code bloqué 15 minutes**.
- **Activer une caisse** : sur l'appareil, Équipe > « Utiliser cet appareil comme caisse » (propriétaire ou gérant ; nom, établissement). L'appareil n'a plus accès qu'à la caisse, quel que soit le compte qui l'a activée ; pour retrouver l'espace complet, se déconnecter puis se reconnecter par email.
- **À la caisse** : « Qui encaisse ? » (collaborateurs ayant un code et accès à l'établissement), code à 4 chiffres masqué, puis le scanner et la fiche de scan (passage, points, récompense, cadeau d'anniversaire, nouvelle carte). Chaque opération porte le **nom du caissier**, la **caisse** et l'établissement de la caisse.
- **Verrouillage automatique** après 5 minutes sans activité (réglable dans Équipe) ; « Changer de caissier » en un geste ; « Fermer la caisse sur cet appareil ».
- **Annulations** : sur la caisse, tout caissier peut annuler une opération ou l'utilisation d'une récompense, sans limite de temps, toujours tracé. Le réglage manuel du solde reste réservé au gérant, hors caisse.
- **Surveillance** : historique avec le caissier et la caisse, filtre **« Annulations »** ; sur le tableau de bord (propriétaire, gérants), nombre d'annulations de la semaine et **points à vérifier** : le même caissier annule deux fois en 30 jours l'utilisation d'une récompense pour le même client (le propriétaire reçoit aussi un email, une fois par couple caissier-client sur 30 jours) ; « Marquer comme vu ».
- **Caisses** (Équipe) : liste (nom, établissement, dernière utilisation), **Retirer** = appareil déconnecté tout de suite.

## 4. Les offres

Les prix, les limites et les fonctions de chaque offre se modifient dans l'administration ([6.3](#63-offres)). Les valeurs ci-dessous sont celles livrées par défaut.

### 4.1 La grille

| | **Gratuit** | **Essentiel** | **Business** | **Réseau** | **Sur-mesure** |
|---|---|---|---|---|---|
| Prix annuel | 0 | 89 € · 99 $ · 990 MAD · 18 000 DA · 295 000 FC | 179 € · 199 $ · 1 990 MAD · 36 000 DA · 590 000 FC | 349 € · 399 $ · 3 790 MAD · 70 000 DA · 1 150 000 FC | Sur devis |
| Clients | 100 | 500 | 2 000 | 10 000 | Négocié |
| Établissements | 1 | 1 | 1 | 3 | Négocié |
| Collaborateurs | 1 (le propriétaire) | 3 | 15 | Illimités | Négocié |
| Programmes | 1 | 1 | 3 | Illimités | Négocié |
| Cartes, QR d'inscription, scanner | ✓ | ✓ | ✓ | ✓ | ✓ |
| Apple Wallet et Google Wallet | ✓ | ✓ | ✓ | ✓ | ✓ |
| Export des données client (RGPD) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Widget pour son site | ✓ | ✓ | ✓ | ✓ | ✓ |
| Sans mention « Propulsé par FOVE » | ✗ | ✓ | ✓ | ✓ | ✓ |
| Campagnes Wallet, relances automatiques et cadeau d'anniversaire | ✗ | ✓ | ✓ | ✓ | ✓ |
| Envoi WhatsApp automatique | ✗ | ✓ | ✓ | ✓ | ✓ |
| API et webhooks | ✗ | ✗ | ✓ | ✓ | ✓ |
| Connexion boutique en ligne | ✗ | ✗ | ✓ | ✓ | ✓ |

Le Sur-mesure a toutes les fonctions par défaut ; l'admin peut en retirer ou en ajouter au cas par cas.

Chaque monnaie a son **prix fixe** (référence : l'euro), qui ne suit pas le change. Prix calculés sur 1 € ≈ 1,12 $ ≈ 10,8 MAD ≈ 200 DA (taux intermédiaire entre l'officiel et le parallèle) ≈ 3 300 FC, à confirmer avant publication ⚠.

### 4.2 Ce que bloque une limite atteinte

- **Clients** : création manuelle, import (les lignes au-delà sont refusées), inscription par QR (message neutre au client, email au commerçant). Un client effacé (RGPD) libère une place.
- **Établissements, collaborateurs, programmes** : la création d'un élément supplémentaire est refusée.
- Une limite **ne supprime ni ne désactive jamais** ce qui existe déjà : cartes, clients, établissements, collaborateurs, historique.
- Une **fonction** absente de l'offre est coupée tout de suite : par exemple, l'API répond par un refus et les webhooks ne partent plus.

### 4.3 Règles d'abonnement

- **Inscription** : toute nouvelle entreprise démarre sur le Gratuit, sans limite de durée et sans carte bancaire. Il n'y a pas d'essai.
- **Paiement** : annuel, à l'avance, dans la monnaie du commerce ([3.14](#314-abonnement)) : en ligne par carte en euros ou en dollars, ou hors ligne (virement ou dépôt d'espèces) dans la monnaie du commerce, **toujours directement à FOVE** (les partenaires n'encaissent pas). Un paiement reçu en espèces au bureau est saisi par FOVE ([6.2](#62-entreprises)). Le paiement est possible avant la confirmation de l'email. **Pas d'argent, pas d'abonnement** : seul l'accès provisoire de 7 jours d'un virement direct précède le paiement.
- **Choix depuis la page tarifs** : « Choisir <offre> » mène à l'inscription (ou à la connexion), puis à la création du commerce, puis directement au paiement de l'offre choisie. Le choix est retenu 7 jours dans le navigateur ⚠.
- **Passer à une offre supérieure** : effet immédiat. La différence au prorata, jusqu'à l'échéance, est facturée tout de suite. Si ce paiement échoue, l'offre ne change pas.
- **Passer à une offre inférieure** : effet **au renouvellement**. L'offre payée reste active jusque-là ; rien n'est remboursé ni crédité. Le changement programmé est annoncé sur la page Abonnement et peut être annulé (« Rester sur <offre> »). Une résiliation ou un passage à une offre supérieure l'annule aussi.
- **Résilier** : effet à la fin de la période payée. On peut revenir sur sa décision jusque-là. Ensuite, l'entreprise passe sur le Gratuit.
- **Impayé au renouvellement** : les droits sont gardés **7 jours**, puis le Gratuit s'applique. Un paiement réussi rétablit l'offre.
- **Sur-mesure** : demande via le formulaire de contact. L'offre est attribuée par l'admin, avec un prix et des limites négociés et une date de fin éventuelle, puis le Gratuit s'applique à la date de fin. Un abonnement Sur-mesure, ou attribué à la main, ne se modifie ni ne se résilie en ligne.

---

## 5. Les partenaires commerciaux

Un partenaire (agence, freelance, consultant, réseau de commerçants…) recommande FOVE et touche une commission sur les abonnements payés par les commerces qu'il apporte ⚠.

### 5.1 Devenir partenaire

- La page publique `/partenaires` présente le programme et les commissions.
- La candidature se fait sur `/partenaires/rejoindre` : identité, entreprise, type de partenaire, pays, stratégie de promotion, réseau estimé.
- Une candidature par email : FOVE refuse si une candidature est déjà en cours ou si l'email correspond à un partenaire actif.
- Le candidat reçoit un email de confirmation, l'équipe FOVE une alerte.
- L'admin **valide** ou **refuse** (avec un motif). Un email informe le candidat. À la validation, il reçoit son code, son lien et l'accès à son espace.
- L'admin peut aussi **créer un partenaire directement** (Finance > Nouveau partenaire) : il reçoit le même **email d'invitation**.
- **Connexion** : avec le compte FOVE de son email (Google ou code par email, aucun mot de passe). Le profil partenaire est rattaché au compte au même email confirmé (dès la validation s'il existe déjà, sinon à la première connexion). Dans l'admin, chaque partenaire est marqué « invité » ou « a rejoint son espace ».

### 5.2 Son espace

**Lien personnel** `fove.digital/p/<CODE>` :
- il enregistre le clic et dépose un cookie d'attribution de **30 jours** ;
- il redirige vers la page tarifs avec les paramètres de suivi.

**Outils**
- QR code du lien, à télécharger.
- **Générateur de liens de campagne** (source, support, nom de campagne) pour suivre ses différents canaux.
- **Kit de vente** : le pitch FOVE en 30 secondes, un message WhatsApp type.

**Tableau de bord**
- Clics, inscriptions, clients payants, taux de conversion.
- Commerces apportés, avec leur offre et la date du premier paiement.

**Clients** (le partenaire vend et accompagne le paiement, il n'encaisse jamais)
- **Inscrire un commerce** : lien d'inscription pré-rempli (nom, nom du commerce, email) à copier, envoyer par WhatsApp ou ouvrir sur le téléphone du commerçant. Le commerçant crée lui-même son compte et confirme son email ; il est attribué au partenaire.
- **Suivi** de chaque client : offre, échéance, état du paiement (Gratuit, paiement attendu avec sa référence `FV-…` et son montant, accès provisoire, payé, échu), pour l'aider à payer et à renouveler.

**Prospects**
- Enregistrer et suivre les commerces à démarcher : enseigne, contact, téléphone, email, secteur, ville, notes.
- Un commerce déjà client de FOVE ne peut pas être revendiqué.

**Commissions**
- Journal des commissions : en attente, disponibles, versées, annulées. Chaque commission est calculée dans la monnaie payée par le commerçant, avec son équivalent dans la monnaie de versement.

**Versements**
- **Automatiques chaque mois**, sans demande : le 1er, les commissions devenues disponibles le mois précédent sont regroupées en un versement, payé **avant le 10**, frais de transfert à la charge de FOVE. Sous **50 $ ou 50 €**, report au mois suivant. Le partenaire reçoit un récapitulatif par email.
- Monnaie de versement au choix : dollar US ou euro. Les commissions disponibles sont converties au taux comptable du jour où elles deviennent disponibles (taux figé) ; un changement de monnaie reconvertit celles qui ne sont pas encore versées.
- **Coordonnées de versement** : virement bancaire uniquement (titulaire, IBAN, BIC, banque). Sans titulaire ni IBAN, aucun versement n'est créé : les commissions attendent le mois suivant et le partenaire reçoit, une fois par mois, une demande de coordonnées.
- **Emails au partenaire** : candidature reçue, validée ou refusée ; commerce inscrit avec son lien ; commission enregistrée ; commission annulée (remboursement pendant la garantie) ; versement du mois ; versement effectué ; versement non effectué (motif, report au mois suivant) ; coordonnées bancaires manquantes.
- Historique des versements.

### 5.3 Règles de commission

| Règle | Valeur par défaut |
|---|---|
| Taux | 20 % du montant net payé (hors taxes et remises). Il peut être modifié pour chaque partenaire. |
| Attribution | Par le cookie du lien partenaire au moment de créer le commerce, ou par un code saisi. Une seule attribution par commerce. Un partenaire ne peut pas s'attribuer son propre commerce. |
| Durée du cookie | 30 jours (réglable dans Admin > Partenaires) ; un lien d'un partenaire inconnu ou non validé ne dépose aucun cookie |
| Fenêtre de conversion | 90 jours (réglable) : le premier paiement doit arriver dans ce délai après l'inscription du commerce, sinon pas de commission |
| Paiements concernés | Le **premier paiement** seulement (réglable) |
| Délai de garantie | La commission devient disponible **30 jours** après le paiement |
| Remboursement | Un paiement remboursé annule la commission correspondante, si elle n'a pas encore été versée |
| Seuil de versement | 50 dans la monnaie de versement (dollar US ou euro) ; en dessous, report au mois suivant |
| Versement | Mensuel : le 1er pour les commissions disponibles avant ce jour, payé avant le 10, frais de transfert pris en charge par FOVE |
| Validation des candidatures | Manuelle (une validation automatique peut être activée) |

Le partenaire **n'encaisse jamais d'argent** (décision du 26 novembre 2026) : le commerçant paie toujours FOVE (carte, virement avec sa référence, dépôt d'espèces à la banque, ou espèces saisies par FOVE). La commission naît quand FOVE reçoit le paiement. Le partenaire est prévenu par email à chaque commission enregistrée, du versement du mois et de chaque versement effectué.

---

## 6. Le super admin FOVE

### 6.1 Qui y accède

- **Super admin** : toute l'administration.
- **Associé** et **responsable financier** : uniquement le centre financier `/admin/finance` ⚠.
- **Double authentification obligatoire** (super admin, associé, responsable financier) : en plus du code reçu par email, code d'une application d'authentification (Google Authenticator, Authy, 1Password…).
  - Activation à la première arrivée : QR code (ou clé à saisir), premier code, puis **10 codes de secours** affichés une seule fois.
  - L'administration reste ouverte **12 heures** ; ensuite, seul le code de l'application est redemandé. Les espaces commerçant et partenaire du même compte ne sont pas concernés.
  - Un code ne sert qu'une fois ; 5 erreurs bloquent 15 minutes. Code de secours en cas de téléphone perdu ; nouveaux codes de secours dans Admin > Système.
  - Plus de téléphone ni de codes de secours : réinitialisation sur le serveur (`pnpm --filter @fove/database mfa:reset -- email`), qui ferme les sessions du compte.
- **Confidentialité** : l'administration n'affiche pas les fiches des clients finaux des commerces. Elle ne montre que des volumes.
- **Arrivée après connexion**, selon les espaces du compte : administration (`/admin`), sinon espace commerçant (`/app`), sinon espace partenaire (`/partner`) ; une destination explicite dans le lien l'emporte. Un **même compte** (même email) peut être admin, commerçant et partenaire : chaque espace propose les autres (« Administration », « Espace commerçant », « Espace partenaire »), qui s'ouvrent dans **un nouvel onglet** ; les espaces restent ouverts côte à côte avec la même session. Un partenaire sans commerce peut en créer un depuis son espace. Un accès support en cours change le commerce affiché dans l'onglet commerçant (bandeau « accès support »).

### 6.2 Entreprises

**Indicateurs de la plateforme**
- Nombre d'entreprises et nouvelles entreprises sur 30 jours.
- Entreprises payantes, sur le Gratuit, en essai.
- Revenu mensuel récurrent, par monnaie et consolidé en euros au taux comptable.
- Clients, cartes, opérations sur 30 jours.

**Liste** : recherche par nom, adresse ou email d'un membre ; offre et statut de chaque entreprise.

**Fiche d'une entreprise**
- Identité, logo, couleur, pays et devise, contacts, Instagram, bannière Wallet.
- **Monnaie de facturation** : celle du pays ou un choix (EUR, USD, MAD, DZD, CDF) ; l'abonnement en cours garde la sienne jusqu'au renouvellement.
- Volumétrie : clients, cartes actives, passages, programmes, établissements.
- Collaborateurs, établissements, intégrations.
- **Journal d'audit** de l'entreprise.
- **Enregistrer un paiement reçu** : paiement déjà reçu par FOVE (espèces au bureau, virement) pour une offre ; la facture est créée et validée en une fois, l'offre est activée ou prolongée d'un an, la commission du partenaire et le parrainage s'appliquent. Montant dû par défaut, montant inférieur à accepter explicitement, n° de reçu et note.
- **Abonnement manuel** : choisir l'offre, le statut (actif, essai, résilié), la date de fin, le prix annuel du contrat et sa **monnaie** (facturé hors paiement en ligne) et, pour le Sur-mesure, les limites négociées. Si l'entreprise payait en ligne, son abonnement en ligne est **arrêté immédiatement**, sans remboursement automatique. Un bouton rapide « Passer en Pro » active l'offre Business sans paiement ⚠.
- **Suspendre ou réactiver** l'entreprise, avec un motif. Une entreprise suspendue perd l'accès à son espace et sa page d'inscription ne fonctionne plus. Ses données sont conservées.
- **Accès support** : ouverture d'un accès en **lecture seule à l'espace du commerçant, pendant 30 minutes**, avec un motif obligatoire. L'accès est inscrit dans le journal de l'entreprise.

### 6.3 Offres

Pour chaque offre, l'admin peut modifier :
- le nom et la description ;
- le **prix annuel dans chaque monnaie** (EUR, USD, MAD, DZD, CDF ; vide = offre non proposée dans cette monnaie) ;
- le tarif Stripe en euros et en dollars (les autres monnaies se règlent hors ligne) ;
- la durée d'essai ;
- les **fonctions incluses** et les **limites** ;
- l'activation de l'offre.

Le nombre d'entreprises abonnées à chaque offre est affiché.

### 6.4 Messages et prospects

- Les messages du formulaire de contact arrivent ici, avec leur source : site, demande de démo, page tarifs, offre Sur-mesure.
- Chaque message a un statut (nouveau, en cours, contacté, archivé) et des notes internes.
- L'équipe FOVE reçoit aussi une alerte par email.

### 6.5 Système

- **Double authentification du compte** : état, codes de secours restants, nouveaux codes de secours.
- **Notifications de l'équipe FOVE** :
  - interrupteur général, **désactivé par défaut** (phase de test : aucun email interne consommé) ; les candidatures et les messages restent visibles dans l'administration ;
  - types d'envoi : nouvelle candidature partenaire, nouveau message de contact, récapitulatif quotidien ;
  - destinataires (10 au plus ; vide : `TEAM_ALERT_EMAIL`) ;
  - email de test, envoyé même si les notifications sont désactivées ; dernière modification (date, auteur), inscrite au journal d'audit.
- Erreurs serveur récentes.
- Intégrations de toutes les entreprises, avec leurs dernières erreurs de synchronisation.

### 6.6 Partenaires

- Candidatures à examiner : valider, ou refuser avec un motif.
- Liste des partenaires : statut, code, taux, clients apportés, commissions en attente et versées. Le taux et le statut sont modifiables (par exemple, suspendre un partenaire).
- **Versements** du mois : montant, coordonnées du partenaire et commissions regroupées ; marquer comme payé avec la référence du virement (les commissions passent à « versées », email au partenaire) ou rejeter (coordonnées erronées : les commissions reviennent au mois suivant).
- **Paramètres globaux** : taux par défaut, délai de garantie, seuil de virement, premier paiement seulement, validation automatique des candidatures. La durée du cookie et la fenêtre de conversion s'affichent aussi, mais n'ont pas d'effet ⚠.

### 6.7 Centre financier

*Accessible aux super admins, associés et responsables financiers* ⚠. Les totaux sont **consolidés dans la monnaie du rapport** (l'euro par défaut, au choix) au **taux comptable** ; chaque ligne garde sa monnaie. Une monnaie sans taux compte pour 0 et est signalée.

| Page | Contenu |
|---|---|
| **Vue d'ensemble** | Chiffre d'affaires TTC, encaissé brut, net bancaire après frais, charges et commissions, résultat net, revenu mensuel et annuel récurrent, commerces payants, évolution par rapport à la période précédente, **encaissements par monnaie**, graphiques |
| **Ventes** | Journal des ventes et renouvellements, avec la fiche de chaque vente : montants HT, taxes, remises, payé, partenaire, transactions |
| **Paiements** | Flux des paiements par prestataire et statut ; **remboursement** total ou partiel d'un paiement (exécuté par le prestataire de paiement, avec annulation de la commission partenaire liée) |
| **Abonnements** | Parc d'abonnements, revenu récurrent lissé, prix contractuels, prochaines échéances, arrêts programmés |
| **Clients** | Fiche financière de chaque commerce : cumul facturé, encaissé (valeur vie), dernier paiement, partenaire apporteur |
| **Factures** | Factures émises, avec les documents téléchargeables |
| **Dépenses** | Saisie et suppression des coûts de FOVE par poste (hébergement, base de données, domaines, emails, outils, publicités, prestations, juridique, frais bancaires…), avec justificatif |
| **Règlements hors ligne** | Factures à référence (en attente, payées, annulées), recherche par référence (saisie tolérante) ou commerce ; **validation** d'un paiement reçu (virement, espèces ; montant, date, référence bancaire, justificatif ; montant inférieur accepté explicitement) qui active ou prolonge l'abonnement ; annulation ; **coordonnées bancaires par pays** (« * » par défaut ; Algérie : compte local) |
| **Taux comptables** | Unités de chaque monnaie pour 1 € : consolidation et conversion des commissions, jamais le prix payé. Date et auteur de la dernière modification. |
| **Trésorerie** | Position nette, solde estimé du prestataire de paiement, **import d'un relevé bancaire CSV** (doublons ignorés) ou saisie d'une ligne, **rapprochement automatique** : les références `FV-…` du libellé proposent la facture ou le relevé de partenaire, avec un écart de montant signalé, à confirmer en un clic |
| **Rapports associés** | Rapport mensuel : facturé, taxes, frais, remboursements, commissions dues, net disponible, résultat du mois |
| **Audit** | Journal de chaque action financière : qui, quoi, quand |
| **Partenaires** | Commissions dues et versées, journal des commissions, versement d'une commission |
| **Parrainages** | Parrainages entre commerçants : états, crédit acquis, utilisé et disponible ; annulation d'un parrainage (abus, fraude) avec motif obligatoire, qui retire le crédit non utilisé |
| **Remboursements** | Historique des remboursements |

---

## 7. La vitrine

| Page | Contenu |
|---|---|
| **Accueil** `/` | Présentation de FOVE |
| **Fonctionnalités** `/fonctionnalites` | Ce que FOVE apporte au commerçant |
| **Tarifs** `/tarifs` | Tableau comparatif des 5 offres (fonctions incluses ou non), FAQ. Sur mobile, une carte par offre. **Sélecteur de monnaie** (€, $, MAD, DZD, CDF) avec les prix fixes de chaque monnaie, détecté selon le pays du visiteur (comme la langue), sinon selon le navigateur, et mémorisé. En monnaie locale, la mention indique le règlement hors ligne et le prix en ligne en euros ou en dollars. |
| **Développeurs** `/developpeurs` | Documentation de l'API, des webhooks et du widget |
| **Partenaires** `/partenaires` | Programme partenaires et candidature ; exemples de commissions calculés sur les prix de la monnaie choisie |
| **Contact** `/contact` | Formulaire de contact. Le paramètre `?offre=sur-mesure` le pré-remplit pour une demande Sur-mesure. |
| **CGU**, **Confidentialité** | Pages légales |
| **Page d'un commerce** `/<adresse>` | Page d'inscription au programme du commerce ([2.1](#21-obtenir-sa-carte)) |

Sur l'ensemble du site :
- sélecteur de thème clair ou sombre ; le logo s'adapte au thème ;
- **bandeau de consentement aux cookies**. La mesure d'audience (Google Analytics, Google Tag Manager, Microsoft Clarity) respecte ce choix via le mode de consentement de Google.

---

## 8. Règles communes

- **Cloisonnement** : chaque entreprise ne voit que ses propres données. Un QR, un numéro de carte ou un identifiant d'une autre entreprise est introuvable.
- **Historique inaltérable** : les opérations de fidélité ne se modifient ni ne se suppriment ; une erreur se corrige par une opération inverse. Les actions sensibles sont inscrites dans un journal d'audit.
- **Pas de double enregistrement** : chaque opération porte une clé unique. La rejouer (double clic, réseau instable, boutique qui renvoie une commande) ne crédite ni ne débite jamais deux fois.
- **Identité d'un client** : téléphone (normalisé selon le pays du commerce), email et référence externe. Ces identifiants sont uniques dans une entreprise.
- **Fuseau horaire** : la règle « un passage par jour » suit le fuseau du commerce.
- **Limites anti-abus** sur les pages publiques et la connexion : nombre de tentatives par minute.
- **Tâches automatiques** (toutes les 5 minutes) :
  - nouvel essai des webhooks en échec ;
  - expiration des soldes inactifs ;
  - fin des contrats et des abonnements arrivés à échéance (dont les abonnements réglés hors ligne) ;
  - fin des accès provisoires de 7 jours sans paiement (retour au Gratuit, email) ;
  - commissions partenaires arrivées au bout du délai de garantie : disponibles et converties dans la monnaie de versement ;
  - versements mensuels des commissions partenaires (le 1er du mois) ;
  - rappels d'échéance au commerçant (abonnement par virement ou espèces à J-30 et J-7, accès provisoire à J-2) et email de fin de délai de grâce d'un impayé par carte ;
  - récapitulatif quotidien à l'équipe FOVE (à partir de 6 h UTC, rien s'il n'y a rien à faire) ;
  - relances de confirmation de l'email des clients FOVE (J3/J10) ;
  - prévenance puis suppression des comptes clients FOVE inactifs ;
  - nettoyage des sessions et codes expirés.
- **Deux gabarits d'emails** :
  - **clients de FOVE** (commerçants, équipes, partenaires, clients finaux) : gabarit de la marque (en-tête bleu nuit, liseré jaune, code ou référence mis en valeur, bouton, pied de page « FOVE · La fidélité qui rapproche ») ; arabe de droite à gauche. Un email sans mise en page propre est mis en forme automatiquement, dans la langue du destinataire ;
  - **équipe FOVE** (notifications internes) : gabarit d'outil interne, en français. Fond gris, étiquette « FOVE · Équipe » et rubrique de couleur (Partenaires, Contact, Encaissements, À surveiller, Récapitulatif), tableau libellé / valeur, bouton vers l'administration, mention « Ne pas transférer à un client ». L'objet commence par « [FOVE · Rubrique] » pour trier la boîte de réception. Destinataires et activation réglables dans Admin > Système (voir 6.5) ; désactivées par défaut.
- **Notifications à l'équipe FOVE** :
  - en temps réel : nouvelle candidature partenaire, message de contact ;
  - **récapitulatif quotidien** : virements à rapprocher, accès provisoires qui se terminent sous 48 h, impayés par carte, échéances sous 30 jours (virement, espèces, contrats), candidatures à examiner, versements partenaires à payer, partenaires sans coordonnées bancaires, messages de contact non traités.
- **Chargement des pages** : au clic sur un lien ou un bouton qui change de page, une barre cobalt à tampon doré part en haut de l'écran et se termine à l'arrivée de la page (rien ne s'affiche sous 0,1 s). Si l'attente dépasse 0,4 s, la zone de contenu affiche une carte de fidélité qui se tamponne : pendant le changement de page (espace commerçant, administration, espace partenaire, compte client), à l'arrivée dans un espace depuis la vitrine ou la connexion, et pendant le chargement des premières données d'une page (sous son titre ; les listes du commerçant gardent leurs blocs gris). Aucun message « aucun élément » ne s'affiche avant l'arrivée des données. Le bouton cliqué affiche un indicateur et ignore les clics répétés. Avec « réduire les animations », la carte reste fixe.
- **Saisie d'un code à 6 chiffres** (connexion, compte client, validation de carte) : une case par chiffre, collage d'un code entier, remplissage automatique sur mobile.
- **Emails envoyés par la plateforme** : code de connexion, email de bienvenue et prévenance avant suppression pour inactivité du compte client FOVE, code de connexion (commerçants, équipes, admin, partenaires), invitation d'équipe, code de validation de carte, lien de carte, alertes de quota, bienvenue du commerçant, vie de l'abonnement et échéances (voir 3.15), parrainage, emails au partenaire (voir 5.2), règlement hors ligne (instructions, rappel, paiement reçu, fin de l'accès provisoire), notifications internes à l'équipe FOVE (temps réel et récapitulatif quotidien).

---

## 9. Partiel ou pas encore disponible

Cette section liste ce qui **existe dans l'application mais n'est pas garanti à 100 %**, et pourquoi. Nature du manque :
- **Configuration** : le code est prêt, mais il dépend d'un service externe à configurer ou à valider.
- **Non testé** : le code existe, mais il n'est couvert par aucun test automatisé et n'a pas été recetté.
- **Code incomplet** : une partie du fonctionnement promis n'est pas codée.
- **Incohérence** : l'interface annonce autre chose que ce que fait l'application.

| Fonction | Nature | Ce qui manque |
|---|---|---|
| **Paiement en ligne (Stripe)** : achat, changement d'offre, prorata, impayé, portail, factures | Configuration · Non testé | Le comportement est testé automatiquement en mode simulé et avec des événements Stripe fabriqués. Le parcours réel n'a jamais été joué avec Stripe : recette en mode test à faire ([recette-facturation.md](recette-facturation.md)). En production, il faut renseigner les prix et le webhook, et désactiver le changement d'offre dans le portail client. |
| **Apple Wallet** : ajout de la carte, mise à jour du solde, notifications | Configuration · Non testé | Il faut les certificats Apple (Pass Type ID). Aucun test automatisé. Sans certificat, le bouton n'apparaît pas. |
| **Google Wallet** : ajout, mise à jour, notifications, campagnes | Configuration | Il faut un compte émetteur Google. Seule la construction du lien d'ajout est testée ; l'envoi réel vers Google ne l'est pas. |
| **Envoi WhatsApp automatique** : lien de carte, retrouver sa carte | Configuration · Non testé | Il faut un compte WhatsApp Business (Meta). L'envoi de messages libres hors fenêtre de 24 h exige des modèles approuvés par Meta : non vérifié. Les liens `wa.me` manuels, eux, fonctionnent partout. |
| **Emails** | Configuration | Sans fournisseur d'email configuré (Resend), les emails sont seulement écrits dans les journaux du serveur. |
| **Parrainage entre commerçants** : remise du filleul et crédit du parrain via Stripe | Configuration · Non testé | Testé en mode simulé uniquement. En mode Stripe, il faut le coupon « 20, une fois » en dollars avec une option en euros (`REFERRAL_STRIPE_COUPON_ID`) ; le crédit du parrain passe par le solde client Stripe ; l'empreinte de carte (anti-abus) n'existe que pour les paiements par carte. Les conditions du programme sont à faire relire par le juriste. |
| **Programme partenaires** : attribution, commissions, versements | Non testé | Versements mensuels, suivi des clients et conversion des commissions sont testés ; l'attribution par lien ne l'est pas. Les commissions naissent des paiements en ligne et hors ligne : un contrat attribué à la main (Sur-mesure, par exemple) ne génère pas de commission. |
| **Centre financier** | Non testé | Testés : trésorerie, rapprochement, règlements hors ligne, consolidation. Les autres pages n'ont pas de test automatisé. |
| **Taux et grille des monnaies** | Configuration | Prix et taux comptables initiaux approximatifs, à confirmer avant publication (grille dans l'admin > Offres, taux dans Finance > Taux comptables ; dinar algérien comptable initialisé au taux officiel ≈ 150). |
| **Paiement en ligne en euros** | Configuration | Créer dans Stripe les tarifs en euros de chaque offre et les saisir dans l'admin (ou `STRIPE_TEST_PRICE_<OFFRE>_YEARLY_EUR_ID` en mode test), et ajouter une option en euros (`currency_options`) au coupon de parrainage. |
| **Règlement hors ligne** | Configuration · À valider | Coordonnées bancaires à saisir par pays (sans coordonnées, l'option n'apparaît pas). À faire valider : compte ou entité locale en Algérie, comptes de FOVE pour les dépôts d'espèces (RDC), facturation en MAD, DZD ou CDF et mentions de TVA hors Union européenne. |
| **Accès associé et responsable financier** | Code incomplet | Aucun écran ne permet d'attribuer ces rôles : il faut modifier la base de données. Le rôle « support » existe mais ne donne aucun accès. |
| **Connexion Google des clients** | Configuration | Ajouter l'adresse de retour `…/api/client/auth/google/callback` (local et production) sur l'identifiant OAuth Google. Testé avec des réponses de Google simulées, jamais avec un vrai compte Google. |
| **Textes du compte client FOVE** (conditions, confidentialité) | Code incomplet | Premier jet en français, marqué « projet », à faire relire par un juriste ([juridique-compte-client.md](juridique-compte-client.md)) ; identité légale de Dizayna à compléter. En anglais, arabe et espagnol, le texte s'affiche en français avec une mention, en attendant la traduction de la version validée. |
| **Effacement des données d'un client (RGPD)** | Non testé | Aucun test automatisé de l'anonymisation. |
| **Téléversement du logo** | Non testé | Aucun test automatisé. |
| **Offre choisie sur la page tarifs** | Limite connue | Le choix est retenu dans le navigateur : il est perdu si la personne change d'appareil entre la page tarifs et l'inscription. |
