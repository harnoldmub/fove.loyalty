# Chantier — Prix dans plusieurs monnaies

> Statut : **livré** le 26 novembre 2026 sur la branche `feat/multi-devises` (lots M1 à M7). Référentiel : [fonctionnalites.md](fonctionnalites.md). Écarts et précisions de la réalisation en fin de document.

## 1. Pourquoi

La page Tarifs propose « $ / € » mais affiche les **mêmes montants** dans les deux monnaies (« 99 € » au lieu d'un vrai prix en euros) : incohérence notée dans le référentiel (section 9). FOVE vise aussi le Maroc, l'Algérie et la RDC.

**Principe retenu : un prix fixe et arrondi par monnaie**, et non une conversion en direct. Le prix affiché est le prix payé ; il ne bouge pas avec le change ; un prix rond se vend mieux.

## 2. Décisions

| Sujet | Décision |
|---|---|
| Monnaie de référence | **L'euro**. Les autres prix en sont tirés, puis arrondis. |
| Monnaies proposées | **EUR, USD, MAD, DZD, CDF** |
| Paiement en ligne (Stripe) | **USD ou EUR uniquement** |
| Monnaies locales (MAD, DZD, CDF) | Affichage des prix, et **règlement hors ligne** dans la monnaie locale (espèces, virement, mobile money) : voir le chantier lié |
| RDC | Facturation en **dollars** ; le franc congolais reste disponible à l'affichage et pour un règlement hors ligne |
| Algérie | Prix calculés sur un **taux intermédiaire** entre le taux officiel (≈ 150 DA pour 1 €) et le marché parallèle (≈ 250 DA) : **≈ 200 DA pour 1 €** |
| Facture d'un paiement hors ligne | Dans **la monnaie réellement payée** (ex. 990 MAD) ; FOVE convertit en euros dans sa comptabilité avec le taux du jour, enregistré sur la facture. À confirmer par l'expert-comptable (facturation en devise étrangère, mentions de TVA hors UE). |
| Versements aux partenaires | Une **monnaie de versement par partenaire, USD ou EUR**. Chaque commission est calculée dans la monnaie du paiement, puis convertie au moment où elle devient disponible, au taux enregistré sur la commission. |
| Taux | Une **table de taux comptables** tenue dans l'admin, revue périodiquement (par exemple chaque trimestre). Elle sert à la consolidation de la Finance et aux conversions des commissions, **jamais au prix payé par un commerçant**. |

## 3. Grille de prix (annuelle)

Taux utilisés pour cette grille, **à confirmer avant publication** : 1 € ≈ 1,12 $ ≈ 10,8 MAD ≈ 200 DA ≈ 3 300 FC.

| | EUR (référence) | USD | MAD | DZD | CDF |
|---|---|---|---|---|---|
| Essentiel | 89 € | 99 $ | 990 MAD | 18 000 DA | 295 000 FC |
| Business | 179 € | 199 $ | 1 990 MAD | 36 000 DA | 590 000 FC |
| Réseau | 349 € | 399 $ | 3 790 MAD | 70 000 DA | 1 150 000 FC |
| Parrainage (filleul et parrain) | 20 € | 20 $ | 200 MAD | 4 000 DA | 65 000 FC |
| Plafond annuel du parrainage | 200 € | 200 $ | 2 000 MAD | 40 000 DA | 650 000 FC |

Les prix en dollars restent ceux d'aujourd'hui. Les prix se modifient dans l'admin, jamais dans le code.

## 4. Monnaie d'un commerce

- **Par défaut selon le pays** du commerce : zone euro → EUR ; Maroc → MAD ; Algérie → DZD ; RDC → USD ; autres pays → USD.
- Modifiable par le commerçant **avant son premier paiement**, puis seulement **au renouvellement** : un abonnement garde sa monnaie du début à la fin (changements d'offre et prorata compris).
- **Paiement en ligne d'un commerce en MAD ou DZD** : il paie le prix en euros ; en CDF : le prix en dollars. La page Abonnement l'indique clairement.

## 5. Ce qui change dans l'application

| Lot | Contenu |
|---|---|
| **M1. Données** | Liste des monnaies de facturation dans `@fove/shared` (distincte des monnaies des programmes de fidélité). Table des **prix par offre et par monnaie**, avec l'identifiant Stripe pour USD et EUR. Monnaie de l'abonnement et du contrat Sur-mesure. Monnaie de facturation du commerce (défaut selon le pays). Table des taux comptables. Reprise : prix USD actuels conservés, prix EUR / MAD / DZD / CDF de la grille. |
| **M2. Vitrine** | Sélecteur des 5 monnaies (au lieu de « $ / € »), détection par pays (comme la langue), choix mémorisé. Cartes d'offres, comparatif, FAQ (« payé en … »), données structurées pour Google, accroche « dès … » dans la monnaie choisie. Mention « paiement en ligne en dollars ou en euros » pour les monnaies locales. |
| **M3. Espace commerçant et paiement** | Page Abonnement dans la monnaie du commerce, choix de la monnaie avant le premier paiement. Paiement Stripe en USD ou EUR selon la règle de la section 4, mode simulé compris. Factures, relances et incitations au payant dans la bonne monnaie. |
| **M4. Admin** | Éditeur d'offres : un prix par monnaie et un identifiant Stripe pour USD et EUR. Contrats Sur-mesure : prix et monnaie. Monnaie visible et modifiable sur la fiche d'un commerce. Page des taux comptables. |
| **M5. Finance** | Totaux **par monnaie**, et un total consolidé en euros avec la table des taux. Factures, paiements, remboursements, dépenses et rapprochements affichés dans leur monnaie. |
| **M6. Parrainage et partenaires** | Remise, crédit et plafond du parrainage dans la monnaie du commerce (grille de la section 3) ; le solde client Stripe suit la monnaie de l'abonnement. Commissions calculées dans la monnaie du paiement et converties dans la monnaie de versement du partenaire. |
| **M7. Textes et référentiel** | Montants formatés selon la monnaie et la langue partout (emails compris), 4 langues, tests, `docs/fonctionnalites.md`. |

## 6. Prérequis et points ouverts

1. **Taux** : confirmer les taux de la grille au moment de publier.
2. **Stripe** : créer les tarifs USD et EUR de chaque offre (ou un tarif avec un montant par monnaie) et le coupon de parrainage dans chaque monnaie.
3. **Expert-comptable** : facturation en MAD, DZD ou CDF par FOVE ; TVA pour les clients hors Union européenne.

## 7. Réalisation (26 novembre 2026)

- **Prix** : table `PlanPrice` (offre × monnaie, tarif Stripe pour EUR et USD) ; les colonnes de prix uniques de l'offre sont supprimées (les prix en dollars et leurs tarifs Stripe sont repris par la migration, les autres monnaies sont ajoutées au démarrage et par le seed).
- **Monnaie** : `TenantSettings.billingCurrency` (vide = celle du pays), `Subscription.currency` (fixe pendant la période ; un renouvellement simulé ou hors ligne prend la monnaie choisie entre-temps). Un abonnement Stripe en cours garde sa monnaie : un changement s'applique à la prochaine souscription.
- **Taux comptables** : table `ExchangeRate`, page Finance > Taux comptables (associés et direction financière). Valeurs initiales : USD 1,12 ; MAD 10,8 ; **DZD 150** (taux officiel, pour la comptabilité ; la grille de prix reste calculée sur 200) ; CDF 3 300.
- **Finance** : tous les totaux sont convertis dans la monnaie du rapport (EUR par défaut) ; les pages Vue d'ensemble, Rapport mensuel, Abonnements et Partenaires ont été réparées au passage (leur format de réponse ne correspondait pas à l'interface).
- **Partenaires** : `Partner.payoutCurrency` ; la commission garde sa monnaie et reçoit `payoutCurrency`, `payoutAmountCents` et `fxRate` quand elle devient disponible (tâche planifiée).
- **Parrainage** : grille par monnaie dans `@fove/shared` (`REFERRAL_REWARD`, `REFERRAL_YEARLY_CAP`) ; un crédit n'est utilisé que sur une facture de la même monnaie.

