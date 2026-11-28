# Chantier — Relances automatiques et anniversaire

> Statut : **spec validée** le 28 novembre 2026. R1 (socle) fait. Référentiel : [fonctionnalites.md](fonctionnalites.md).

## 1. Pourquoi

FOVE promet de ramener les clients. Les segments existent (nouveau, régulier, VIP, en risque, dormant), mais la relance est manuelle : le raccourci « Relancer » mène seulement à la liste des clients. Rien n'existe pour l'anniversaire.

## 2. Décisions

| Sujet | Décision |
|---|---|
| Offres | Relances et anniversaire **automatiques** : offres payantes seulement. Offre Gratuite : liste **« À relancer »** avec bouton WhatsApp manuel (relances et anniversaires du jour), rien d'automatique. |
| Canaux | 1. **Wallet** si la carte est dans le téléphone (gratuit). 2. Sinon **email** si consentement marketing et email connus. 3. Sinon rien d'automatique : le client apparaît dans « À relancer ». WhatsApp automatique : **version 2** (modèles Meta, coût par message). |
| Heures et dates | Stockage et délais en **UTC**. « Aujourd'hui », « anniversaire » et la plage d'envoi **10 h – 19 h** sont calculés à l'heure du **fuseau du commerce** (`TenantSettings.timezone`). |
| Plafond | Au plus **une relance tous les 14 jours** par client, tous scénarios confondus. Les messages d'anniversaire passent avant et ne comptent pas. |
| Garde-fous | Jamais un client effacé ; email seulement avec consentement ; un client qui revient sort du scénario ; chaque envoi est journalisé (une seule fois par clé). |
| Dormants | **Message seul** par défaut ; **bonus de retour** en option (points ou tampons crédités à l'envoi, quantité réglable). |
| Anniversaire | Jour et mois seulement (jamais l'année), facultatif. **Cadeau valable sur une période** (J-3 à J+7 par défaut, réglable), utilisable une fois, affiché et validé au scanner. |
| Annuaire | Plus tard (densité de commerces nécessaire). Le socle ajoute la **position GPS** des établissements pour le préparer. |
| Anomalie | Un message Wallet modifiait la date d'activité de la carte et repoussait l'expiration des points : date distincte « carte modifiée » pour Apple Wallet, l'activité ne change qu'avec une opération de fidélité. |

## 3. Scénarios de relance

| Scénario | Déclencheur | Message par défaut |
|---|---|---|
| **Presque une récompense** | Il manque 1 passage (tampons) ou moins de 20 % des points de la récompense la plus proche | « Plus qu'un passage pour {récompense} chez {commerce} ! » |
| **Récompense qui attend** | Solde suffisant pour une récompense depuis 7 jours sans l'utiliser | « {prénom}, votre récompense {récompense} vous attend chez {commerce}. » |
| **En risque** | Dernière visite il y a 35 jours (segment « en risque ») | « Vous avez {solde}. Plus que {reste} pour {récompense} ! » |
| **Dormant** | Pas de visite depuis 75 jours (segment « dormant ») | « Vous nous manquez chez {commerce} ! » (+ bonus de retour en option) |

- Chaque scénario s'active séparément ; textes modifiables (titre et message), variables `{prénom}`, `{commerce}`, `{solde}`, `{récompense}`, `{reste}` ; aperçu ; textes par défaut dans la langue du commerce.
- Un même client reçoit au plus un message par scénario et par « épisode » (par exemple, une fois par période d'inactivité) ; une visite remet le scénario à zéro.

## 4. Anniversaire

- **Date** : jour et mois, facultatifs. Saisie à l'inscription par QR, sur la fiche client, dans « Mes cartes » (compte client FOVE), à l'import CSV et par l'API.
- **Cadeau** réglé par le commerçant : libellé (« 1 dessert offert », « -20 % »…), période de validité autour du jour J (3 jours avant, 7 jours après par défaut).
- **Messages** : à l'ouverture de la période (J-3 : « Votre anniversaire approche : {commerce} vous offre {cadeau}, valable jusqu'au {date}. ») ; le jour J (« Joyeux anniversaire ! ») seulement si le cadeau n'est pas utilisé. Au plus deux messages par an.
- **En caisse** : au scan, « Cadeau d'anniversaire disponible » avec « Utiliser » ; une seule utilisation, tracée (qui, quand).
- Client sans carte Wallet ni consentement email : le cadeau reste disponible en caisse ; le client apparaît dans « À relancer ».

## 5. Résultats

Pour chaque scénario : messages envoyés, clients revenus dans les 30 jours (taux de retour), cadeaux d'anniversaire utilisés.

## 6. Découpage

| Lot | Contenu |
|---|---|
| **R1. Socle** | Date d'anniversaire (fiche, inscription, Mes cartes, import, API) ; position GPS des établissements ; journal des envois ; correctif « carte modifiée » ; heure locale par commerce. |
| **R2. Moteur d'envoi** | Tâche planifiée par commerce à son heure locale, canaux Wallet puis email (gabarit FOVE, langue du commerce), plage 10 h – 19 h, plafond de 14 jours, offres payantes. |
| **R3. Relances** | Les 4 scénarios, page « Relances automatiques » (activer, textes, aperçu, bonus de retour des dormants). |
| **R4. Anniversaire** | Cadeau sur une période, messages J-3 et jour J, cadeau au scanner. |
| **R5. Résultats et liste manuelle** | Taux de retour par scénario ; liste « À relancer » avec WhatsApp pré-rempli (toutes offres) ; tests et documentation. |
