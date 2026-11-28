# Chantier — Code caisse (appareil partagé)

> Statut : **spec validée** le 28 novembre 2026. Référentiel : [fonctionnalites.md](fonctionnalites.md).

## 1. Pourquoi

Chaque collaborateur a son compte (connexion par code email) et chaque opération porte son nom. Sur une tablette partagée en caisse, personne ne se déconnecte et ne reçoit un code par email à chaque changement de caissier : la tablette reste connectée avec le compte du patron, les opérations portent toutes son nom et n'importe quel caissier a accès à tout (abonnement, export, réglages).

## 2. Décisions

| Sujet | Décision |
|---|---|
| Mode caisse | Un gérant ou le propriétaire active **« Utiliser cet appareil comme caisse »** sur l'appareil (nom, établissement). La session de l'appareil devient une **session de caisse** : seulement les fonctions de caisse, quel que soit le compte qui l'a activée. En sortir = se déconnecter, puis se reconnecter par email. |
| Code caisse | **4 chiffres**, personnel, choisi par le collaborateur dans son compte ; jamais visible ; un gérant ou le propriétaire peut le réinitialiser. Stocké haché. **5 erreurs = code bloqué 15 minutes.** |
| Sans code | Le collaborateur n'apparaît pas dans « Qui encaisse ? » ; à sa prochaine connexion à l'espace commerçant, il est invité à le choisir. |
| À la caisse | « Qui encaisse ? » (collaborateurs ayant un code et accès à l'établissement), code, puis scanner, recherche, passage, récompense, cadeau d'anniversaire, nouvelle carte. Chaque opération est enregistrée au **nom du caissier** et avec la **caisse** utilisée. |
| Verrouillage | Automatique après **5 minutes** sans activité, **réglable** par le commerçant ; « Changer de caissier » en un geste. |
| Annulations | Sur la caisse, **tout caissier** peut annuler une opération ou l'utilisation d'une récompense, **sans limite de temps** ; tout est tracé (caissier, caisse). Le réglage manuel de solde reste réservé au gérant (espace commerçant). |
| Surveillance | Filtre **« Annulations »** dans l'historique ; nombre d'annulations de la semaine sur le tableau de bord ; **anomalie** quand le même caissier annule deux fois l'utilisation d'une récompense pour le même client en 30 jours : encadré « Point à vérifier » et email au propriétaire. |
| Offres | Toutes (l'intérêt vient avec une équipe). |
| Caisses | Liste dans Équipe (nom, établissement, dernière utilisation), **Retirer** = appareil déconnecté tout de suite. |

## 3. Découpage

| Lot | Contenu |
|---|---|
| **C1. Socle** | Code caisse (choix, réinitialisation, blocage) ; caisses (activation sur l'appareil, retrait) ; session de caisse limitée ; caissier déverrouillé par son code, verrouillage automatique ; opérations au nom du caissier avec la caisse ; annulations ouvertes sur la caisse. |
| **C2. Écran de caisse** | Interface caisse dans l'espace commerçant : « Qui encaisse ? » et pavé à 4 chiffres, verrouillage, scanner et fiche de scan existants, changement de caissier ; activation ; invitation à choisir son code. 4 langues. |
| **C3. Gestion et surveillance** | Caisses dans Équipe, réglage du délai, filtre « Annulations », compteur hebdomadaire, anomalies (encadré, email), tests, docs. |
