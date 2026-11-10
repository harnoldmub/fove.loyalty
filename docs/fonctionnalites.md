# FOVE — Référentiel fonctionnel

Ce document décrit **tout ce que l'application permet de faire**, pour chaque type d'utilisateur, avec les règles métier qui s'appliquent. Il se lit sans ouvrir le code ni l'application.

- **État décrit** : branche `main` au commit `483f3bc` (10 novembre 2026). Tests automatisés de l'API : 112 sur 112 au vert.
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
| **Client final** | Crée sa carte, la garde sur son téléphone, cumule et utilise ses avantages | Page d'inscription du commerce, page de sa carte, Wallet |
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
| **Segment** | Le statut relationnel calculé pour chaque client : Nouveau, VIP, Régulier, En risque, Dormant. |

---

## 2. Le client final

Le client n'a **ni compte ni mot de passe**. Sa carte est un lien secret personnel.

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

Le formulaire demande :

| Champ | Règle |
|---|---|
| Prénom | Obligatoire |
| Nom | Facultatif |
| Téléphone | Obligatoire |
| Email | Facultatif ; obligatoire si le programme valide les inscriptions par code email |
| Conditions du programme | Acceptation obligatoire |
| Offres commerciales | Consentement facultatif. Il couvre les offres par email (si un email est saisi) et par SMS ou WhatsApp. |

**Règles**
- **Pas de doublon.** Si le téléphone ou l'email est déjà connu du commerce, l'inscription est refusée avec « Vous êtes déjà inscrit(e) ». La carte existante n'est jamais révélée : le client est orienté vers « Retrouver ma carte ».
- **Validation de l'inscription**, réglée par le commerçant sur chaque programme :
  - *Immédiate* : la carte est active tout de suite.
  - *Code par email* : un code à 6 chiffres est envoyé. Il est valable 10 minutes, avec un nombre d'essais limité, et peut être renvoyé après 1 minute.
  - *En magasin* : la carte est activée par un employé au prochain passage.

  Tant qu'elle n'est pas validée, la carte est « en attente » et ne peut pas être ajoutée au Wallet.
- **Inscriptions fermées.** Si l'entreprise a atteint son nombre maximum de clients, le client lit « Les inscriptions sont momentanément fermées. Demandez votre carte directement au commerçant ». Il ne voit jamais l'offre du commerçant ; le commerçant, lui, est prévenu par email.
- **Protection contre les abus** : champ piège anti-robots, nombre de tentatives limité par minute.

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

Sur la page d'inscription, l'onglet « Retrouver ma carte » demande l'email ou le téléphone utilisé à l'inscription.
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

Le commerçant est responsable des données de ses clients. Le client lui demande l'export ou l'effacement de ses données ([3.5](#35-clients)). L'équipe FOVE n'a pas accès aux fiches des clients des commerces.

---

## 3. Le commerçant et son équipe

### 3.1 Créer son compte et démarrer

1. **Inscription** : nom, email, mot de passe (10 caractères minimum), acceptation des CGU.
   - Un email de confirmation est envoyé (lien valable 2 jours), avec une **relance unique 24 h après**. Ne pas confirmer son email ne bloque rien, sauf la création de clés API et de webhooks.
   - Si la personne avait choisi une offre sur la page tarifs, ce choix est retenu jusqu'au paiement ([4.3](#43-règles-dabonnement)).
2. **Assistant de création du commerce**, que l'on peut interrompre et reprendre plus tard :
   - nom du commerce, adresse de sa page publique, pays (la devise se règle selon le pays) ;
   - logo et couleur principale, avec un aperçu de la carte ;
   - premier point de vente : nom et ville ;
   - premier programme, en points ou en tampons, avec sa première récompense ;
   - affichage du **QR d'inscription** à mettre au comptoir.
3. Le commerce démarre sur l'**offre Gratuite**. Il est rattaché à un partenaire commercial si la personne est arrivée par un lien partenaire ([5.2](#52-son-espace)), et à un commerçant parrain si elle est arrivée par un lien de parrainage ([3.13](#313-paramètres)).

**Accès**
- Connexion par email et mot de passe ; session de 30 jours ; déconnexion automatique quand la session expire.
- Mot de passe oublié : réinitialisation par email.
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
- Fichier CSV avec les colonnes `prenom`, `nom`, `telephone`, `email`, et `reference` si besoin. 5 000 lignes maximum.
- Création de leur carte dans un programme : facultative.
- Les doublons sont ignorés. L'import s'arrête au nombre maximum de clients de l'offre, et le rapport indique les lignes refusées pour ce motif.

**Fiche client**
- Coordonnées modifiables, référence externe.
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

- Créer et modifier un point de vente : nom, adresse, ville, pays, téléphone ; activer ou désactiver.
- Chaque achat et chaque utilisation de récompense peut indiquer l'établissement.
- Le nombre d'établissements est limité par l'offre.

### 3.10 Équipe

- **Inviter** un collaborateur par email, avec son rôle et ses établissements autorisés. Le lien est valable **7 jours**.
  - Une personne déjà inscrite sur FOVE accepte en se connectant.
  - Une nouvelle personne crée son accès depuis le lien ; son email est alors considéré comme confirmé.
- Révoquer une invitation en attente.
- Changer le rôle ou les établissements d'un collaborateur ; désactiver ou réactiver son accès.
- Garde-fous :
  - on ne peut pas modifier son propre accès ;
  - l'entreprise garde toujours au moins un propriétaire ;
  - on ne peut pas inviter un autre propriétaire.
- Le nombre de collaborateurs est limité par l'offre. Le propriétaire compte pour un.

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

**Parrainage entre commerçants** : chaque commerce a un lien de parrainage à partager. Un commerce créé par ce lien est enregistré comme filleul, et le parrain reçoit **20 $ de crédit** ⚠.

### 3.14 Abonnement

- Offre en cours, statut, date de renouvellement ou de fin.
- **Utilisation** comparée aux limites de l'offre : clients, établissements, collaborateurs, programmes.
- **Changer d'offre**, **résilier**, **reprendre l'abonnement**, **annuler un changement programmé** : les règles sont en [4.3](#43-règles-dabonnement).
- **Factures et moyen de paiement** : ouverture du portail de paiement ⚠.
- Lien vers l'offre Sur-mesure.
- **Alertes de quota par email**, envoyées à l'email de contact : quand la limite de clients est atteinte, et quand une inscription par QR est refusée pour cette raison. Au plus une fois par jour et par motif.

### 3.15 Emails reçus par le commerçant et son équipe

- Confirmation de l'adresse email, et relance à 24 h.
- Réinitialisation du mot de passe.
- Invitation à rejoindre une entreprise.
- Alertes de quota.

---

## 4. Les offres

Les prix, les limites et les fonctions de chaque offre se modifient dans l'administration ([6.3](#63-offres)). Les valeurs ci-dessous sont celles livrées par défaut.

### 4.1 La grille

| | **Gratuit** | **Essentiel** | **Business** | **Réseau** | **Sur-mesure** |
|---|---|---|---|---|---|
| Prix | 0 | 99 $/an | 199 $/an | 399 $/an | Sur devis |
| Clients | 100 | 500 | 2 000 | 10 000 | Négocié |
| Établissements | 1 | 1 | 1 | 3 | Négocié |
| Collaborateurs | 1 (le propriétaire) | 3 | 15 | Illimités | Négocié |
| Programmes | 1 | 1 | 3 | Illimités | Négocié |
| Cartes, QR d'inscription, scanner | ✓ | ✓ | ✓ | ✓ | ✓ |
| Apple Wallet et Google Wallet | ✓ | ✓ | ✓ | ✓ | ✓ |
| Export des données client (RGPD) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Widget pour son site | ✓ | ✓ | ✓ | ✓ | ✓ |
| Sans mention « Propulsé par FOVE » | ✗ | ✓ | ✓ | ✓ | ✓ |
| Campagnes Wallet | ✗ | ✓ | ✓ | ✓ | ✓ |
| Envoi WhatsApp automatique | ✗ | ✓ | ✓ | ✓ | ✓ |
| API et webhooks | ✗ | ✗ | ✓ | ✓ | ✓ |
| Connexion boutique en ligne | ✗ | ✗ | ✓ | ✓ | ✓ |

Le Sur-mesure a toutes les fonctions par défaut ; l'admin peut en retirer ou en ajouter au cas par cas.

### 4.2 Ce que bloque une limite atteinte

- **Clients** : création manuelle, import (les lignes au-delà sont refusées), inscription par QR (message neutre au client, email au commerçant). Un client effacé (RGPD) libère une place.
- **Établissements, collaborateurs, programmes** : la création d'un élément supplémentaire est refusée.
- Une limite **ne supprime ni ne désactive jamais** ce qui existe déjà : cartes, clients, établissements, collaborateurs, historique.
- Une **fonction** absente de l'offre est coupée tout de suite : par exemple, l'API répond par un refus et les webhooks ne partent plus.

### 4.3 Règles d'abonnement

- **Inscription** : toute nouvelle entreprise démarre sur le Gratuit, sans limite de durée et sans carte bancaire. Il n'y a pas d'essai.
- **Paiement** : annuel, à l'avance, en dollars US. Le paiement est possible avant la confirmation de l'email.
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
- L'admin **valide** ou **refuse** (avec un motif). Un email informe le candidat. À la validation, il reçoit son code et son taux de commission.

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

**Prospects**
- Enregistrer et suivre les commerces à démarcher : enseigne, contact, téléphone, email, secteur, ville, notes.
- Un commerce déjà client de FOVE ne peut pas être revendiqué.

**Commissions**
- Journal des commissions : en attente, disponibles, versées, annulées.

**Virements**
- Demande de virement, à partir de **50 $** disponibles.
- Par virement bancaire (IBAN, BIC) ou Mobile Money : M-Pesa, Airtel Money, Orange Money, MTN Mobile Money.
- Historique des virements.

**Profil** : coordonnées de paiement.

### 5.3 Règles de commission

| Règle | Valeur par défaut |
|---|---|
| Taux | 20 % du montant net payé (hors taxes et remises). Il peut être modifié pour chaque partenaire. |
| Attribution | Par le cookie du lien partenaire au moment de créer le commerce, ou par un code saisi. Une seule attribution par commerce. Un partenaire ne peut pas s'attribuer son propre commerce. |
| Paiements concernés | Le **premier paiement** seulement (réglable) |
| Délai de garantie | La commission devient disponible **30 jours** après le paiement |
| Remboursement | Un paiement remboursé annule la commission correspondante, si elle n'a pas encore été versée |
| Seuil de virement | 50 $ |
| Validation des candidatures | Manuelle (une validation automatique peut être activée) |

Le partenaire est prévenu par email à chaque commission enregistrée et à chaque virement effectué.

---

## 6. Le super admin FOVE

### 6.1 Qui y accède

- **Super admin** : toute l'administration.
- **Associé** et **responsable financier** : uniquement le centre financier `/admin/finance` ⚠.
- **Confidentialité** : l'administration n'affiche pas les fiches des clients finaux des commerces. Elle ne montre que des volumes.

### 6.2 Entreprises

**Indicateurs de la plateforme**
- Nombre d'entreprises et nouvelles entreprises sur 30 jours.
- Entreprises payantes, sur le Gratuit, en essai.
- Revenu mensuel récurrent.
- Clients, cartes, opérations sur 30 jours.

**Liste** : recherche par nom, adresse ou email d'un membre ; offre et statut de chaque entreprise.

**Fiche d'une entreprise**
- Identité, logo, couleur, pays et devise, contacts, Instagram, bannière Wallet.
- Volumétrie : clients, cartes actives, passages, programmes, établissements.
- Collaborateurs, établissements, intégrations.
- **Journal d'audit** de l'entreprise.
- **Abonnement manuel** : choisir l'offre, le statut (actif, essai, résilié), la date de fin, le prix annuel du contrat (facturé hors paiement en ligne) et, pour le Sur-mesure, les limites négociées. Si l'entreprise payait en ligne, son abonnement en ligne est **arrêté immédiatement**, sans remboursement automatique. Un bouton rapide « Passer en Pro » active l'offre Business sans paiement ⚠.
- **Suspendre ou réactiver** l'entreprise, avec un motif. Une entreprise suspendue perd l'accès à son espace et sa page d'inscription ne fonctionne plus. Ses données sont conservées.
- **Accès support** : ouverture d'un accès en **lecture seule à l'espace du commerçant, pendant 30 minutes**, avec un motif obligatoire. L'accès est inscrit dans le journal de l'entreprise.

### 6.3 Offres

Pour chaque offre, l'admin peut modifier :
- le nom et la description ;
- le prix annuel et mensuel ;
- les identifiants de prix du paiement en ligne ;
- la durée d'essai ;
- les **fonctions incluses** et les **limites** ;
- l'activation de l'offre.

Le nombre d'entreprises abonnées à chaque offre est affiché.

### 6.4 Messages et prospects

- Les messages du formulaire de contact arrivent ici, avec leur source : site, demande de démo, page tarifs, offre Sur-mesure.
- Chaque message a un statut (nouveau, en cours, contacté, archivé) et des notes internes.
- L'équipe FOVE reçoit aussi une alerte par email.

### 6.5 Système

- Erreurs serveur récentes.
- Intégrations de toutes les entreprises, avec leurs dernières erreurs de synchronisation.

### 6.6 Partenaires

- Candidatures à examiner : valider, ou refuser avec un motif.
- Liste des partenaires : statut, code, taux, clients apportés, commissions en attente et versées. Le taux et le statut sont modifiables (par exemple, suspendre un partenaire).
- **Virements demandés** : marquer comme payé (les commissions disponibles les plus anciennes passent à « versées » jusqu'à hauteur du montant) ou rejeter.
- **Paramètres globaux** : taux par défaut, délai de garantie, seuil de virement, premier paiement seulement, validation automatique des candidatures. La durée du cookie et la fenêtre de conversion s'affichent aussi, mais n'ont pas d'effet ⚠.

### 6.7 Centre financier

*Accessible aux super admins, associés et responsables financiers* ⚠. Les montants sont en USD.

| Page | Contenu |
|---|---|
| **Vue d'ensemble** | Chiffre d'affaires TTC, encaissé brut, net bancaire après frais, charges et commissions, résultat net, revenu mensuel et annuel récurrent, commerces payants, graphiques |
| **Ventes** | Journal des ventes et renouvellements, avec la fiche de chaque vente : montants HT, taxes, remises, payé, partenaire, transactions |
| **Paiements** | Flux des paiements par prestataire et statut ; **remboursement** total ou partiel d'un paiement (exécuté par le prestataire de paiement, avec annulation de la commission partenaire liée) |
| **Abonnements** | Parc d'abonnements, revenu récurrent lissé, prix contractuels, prochaines échéances, arrêts programmés |
| **Clients** | Fiche financière de chaque commerce : cumul facturé, encaissé (valeur vie), dernier paiement, partenaire apporteur |
| **Factures** | Factures émises, avec les documents téléchargeables |
| **Dépenses** | Saisie et suppression des coûts de FOVE par poste (hébergement, base de données, domaines, emails, outils, publicités, prestations, juridique, frais bancaires…), avec justificatif |
| **Trésorerie** | Position nette, solde estimé du prestataire de paiement, **rapprochement bancaire** écriture par écriture |
| **Rapports associés** | Rapport mensuel : facturé, taxes, frais, remboursements, commissions dues, net disponible, résultat du mois |
| **Audit** | Journal de chaque action financière : qui, quoi, quand |
| **Partenaires** | Commissions dues et versées, journal des commissions, versement d'une commission |
| **Parrainages** | Parrainages entre commerçants et crédits accordés ⚠ |
| **Remboursements** | Historique des remboursements |

---

## 7. La vitrine

| Page | Contenu |
|---|---|
| **Accueil** `/` | Présentation de FOVE |
| **Fonctionnalités** `/fonctionnalites` | Ce que FOVE apporte au commerçant |
| **Tarifs** `/tarifs` | Tableau comparatif des 5 offres (fonctions incluses ou non), FAQ. Sur mobile, une carte par offre. Bascule d'affichage dollars ou euros, détectée selon le navigateur ⚠. |
| **Développeurs** `/developpeurs` | Documentation de l'API, des webhooks et du widget |
| **Partenaires** `/partenaires` | Programme partenaires et candidature |
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
  - fin des contrats et des abonnements arrivés à échéance ;
  - relance de confirmation d'email ;
  - nettoyage des sessions et codes expirés.
- **Emails envoyés par la plateforme** : confirmation d'email et relance, mot de passe oublié, invitation d'équipe, code de validation de carte, lien de carte, alertes de quota, candidature partenaire (accusé, validation, refus), commission et virement partenaire, alertes internes à l'équipe FOVE (contact, candidature, demande de virement) ⚠.

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
| **Parrainage entre commerçants** : 20 $ de crédit | Code incomplet | Le crédit est enregistré mais **jamais déduit** d'une facture. L'écran Paramètres le promet pourtant au commerçant, et la page admin « Parrainages » affiche un montant « appliqué » qui reste toujours à 0. |
| **Programme partenaires** : attribution, commissions, virements | Non testé | Aucun test automatisé. Les commissions naissent uniquement des paiements Stripe : un contrat attribué à la main (Sur-mesure, par exemple) ne génère pas de commission. |
| **Centre financier** | Non testé | Aucun test automatisé. Les ventes, paiements et factures viennent uniquement de Stripe : un virement ou un paiement hors ligne ne peut pas être saisi (seules les dépenses se saisissent à la main). |
| **Réglages partenaires « durée du cookie » et « fenêtre de conversion »** | Code incomplet | Modifiables dans l'admin, mais lus nulle part : le cookie du lien partenaire est fixé à 30 jours dans le code, et aucune fenêtre de conversion n'est appliquée. |
| **Accès associé et responsable financier** | Code incomplet | Aucun écran ne permet d'attribuer ces rôles : il faut modifier la base de données. Le rôle « support » existe mais ne donne aucun accès. |
| **Effacement des données d'un client (RGPD)** | Non testé | Aucun test automatisé de l'anonymisation. |
| **Téléversement du logo** | Non testé | Aucun test automatisé. |
| **Affichage des prix en euros** sur la page tarifs | Incohérence | La bascule affiche les mêmes montants avec le symbole € (« 199 € ») et la mention « payé en euros », alors que le paiement se fait en dollars US. |
| **Libellés « Pro »** | Incohérence | L'offre « Pro » n'existe plus. Côté commerçant, « Disponible avec un abonnement Pro » désigne les offres payantes. Côté admin, « Passer en Pro » active l'offre Business. |
| **Mention PDF** dans les Paramètres | Incohérence | Le texte d'aide du compte Instagram parle de cartes « PNG et PDF », alors que le téléchargement en PDF a été retiré : seul le PNG existe. |
| **« 100 clients » sur la vitrine** | Incohérence possible | Le chiffre est écrit en dur dans deux accroches. Il deviendra faux si la limite de l'offre Gratuite change dans l'administration. |
| **Offre choisie sur la page tarifs** | Limite connue | Le choix est retenu dans le navigateur : il est perdu si la personne change d'appareil entre la page tarifs et l'inscription. |
