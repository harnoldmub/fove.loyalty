# Chantier — Encaissement hors ligne (virement, espèces)

> Statut : H1 (virement direct) et H2 (rapprochement bancaire) **livrés** le 26 novembre 2026. H3 (encaissement par les partenaires) et H4 (relevés mensuels) **livrés puis retirés** le même jour : voir la révision en section 0. Référentiel : [fonctionnalites.md](fonctionnalites.md).

## 0. Révision du 26 novembre 2026 : les partenaires n'encaissent plus

**Décision** : le commerçant paie toujours FOVE directement. Plus d'argent confié à un tiers : un partenaire pouvait encaisser et ne jamais reverser, ou valider un abonnement sans rien encaisser ; les garde-fous (plafond, relevés, blocage, signalement) ajoutaient de la complexité sans supprimer ce risque.

| Avant (H3, H4) | Maintenant |
|---|---|
| Le partenaire encaisse en espèces ou en mobile money et valide l'abonnement | Le partenaire **vend et accompagne** : inscription du commerce (lien pré-rempli), aide au paiement (virement avec la référence, carte) ; il n'encaisse jamais |
| Espèces remises au partenaire | Dépôt d'espèces au guichet de la banque de FOVE avec la référence, ou espèces remises à FOVE et saisies dans le back-office (« Enregistrer un paiement reçu », fiche entreprise) |
| Frais d'encaissement 5 %, plafond d'encours, relevé mensuel et compensation, signalement du commerçant | Retirés (migration `20261126150000_remove_partner_collection`) |
| Demande de virement par le partenaire, à partir de 50 | **Versement mensuel automatique** : le 1er, regroupement des commissions disponibles (après la garantie de 30 jours), payé avant le 10, frais de transfert à la charge de FOVE ; sous 50 $ ou 50 €, report au mois suivant ; récapitulatif par email ; onglet « Versements » dans Admin > Partenaires |

La commission d'apport naît quand FOVE reçoit le paiement (carte, virement validé, paiement saisi), comme avant. Plus tard, d'autres moyens de paiement directs (mobile money intégré, carte Edahabia en Algérie) pourront s'ajouter sans changer le rôle du partenaire. Si un marché exige un jour des agents qui encaissent, le modèle à retenir est le **prépayé** (le partenaire achète d'avance des activations), jamais le crédit.

**Mobile money (27 novembre 2026)** : rien n'est décidé, c'est un projet futur. Il est retiré de l'application : moyens de paiement saisis par l'admin (virement ou espèces), coordonnées de versement des partenaires (virement bancaire uniquement), textes (migration `20261127100000_remove_mobile_money`). Les mentions du mobile money plus bas décrivent la version initiale.

Les sections 2, 6, 7 et 8 ci-dessous décrivent la version initiale, retirée pour ce qui concerne l'encaissement par les partenaires.

## 1. Pourquoi

FOVE est centralisé en Europe ; beaucoup de commerçants en Algérie, au Maroc ou en RDC n'ont pas de paiement en ligne. Il faut pouvoir **encaisser hors ligne** et **retrouver chaque paiement sans effort** dans le back-office. Aujourd'hui, un paiement hors ligne ne peut pas être saisi (référentiel, section 9).

## 2. Les trois scénarios

| | Qui encaisse | Activation de l'abonnement | Argent vers FOVE | Identifiant dans le motif |
|---|---|---|---|---|
| **1. Direct** : le commerçant souscrit ou renouvelle seul | FOVE, par virement | **Tout de suite, pour 7 jours** d'accès provisoire, confirmé à réception du virement | Virement du commerçant | Référence de la **facture** |
| **2. Première souscription par un partenaire** | Le partenaire, au moment de la souscription | **Immédiate** à sa validation (il a l'argent en main) | Relevé mensuel : le partenaire vire le total encaissé moins sa commission | Référence du **relevé** |
| **3. Renouvellement par un partenaire** (« agent encaisseur ») | Le partenaire | **Immédiate** à sa validation | Même relevé mensuel : total encaissé moins ses frais d'encaissement | Référence du **relevé** |

**Règle : pas d'argent, pas d'abonnement.** Si le commerçant ne paie pas le partenaire, rien n'est validé : il reste en offre Gratuite. Il n'existe aucun abonnement « à encaisser plus tard ».

**Algérie** : les virements restent **dans le pays** (compte bancaire local) ; la validation se fait dans le back-office FOVE, sans transfert vers l'Europe.

## 3. Références de paiement

- **Une référence par facture**, et une **par relevé de partenaire** (chaque virement correspond à un seul document).
- Format court et sans ambiguïté : `FV-7KQ4M2-X` (facture), `FV-RL-…` (relevé, avec le code du partenaire pour la lisibilité). Alphabet sans caractères confondables (ni 0/O, ni 1/I) ; **lettre de contrôle** finale qui détecte une faute de frappe.
- Affichée partout où il le faut : page Abonnement, facture, email d'instructions, relevé — avec « À indiquer obligatoirement dans le motif du virement ».
- La même référence sert au partenaire : le commerçant la lui montre pour un encaissement hors de ses propres clients.

## 4. Coordonnées bancaires par pays

Réglables dans l'admin : bénéficiaire, banque, RIB ou IBAN, instructions (espèces, mobile money). Le commerçant et le partenaire voient celles de **leur pays** (compte local pour l'Algérie). À vérifier : un compte en Algérie suppose en général une entité ou un représentant sur place.

## 5. Back-office FOVE

- **Factures hors ligne en attente** : liste filtrable, recherche directe par référence.
- **Validation manuelle** : moyen de paiement (virement, espèces, mobile money), montant reçu et monnaie, date, référence bancaire, justificatif. La validation active ou confirme l'abonnement et déclenche commission et parrainage comme un paiement Stripe.
- **Rapprochement bancaire automatique** : import d'un relevé bancaire (CSV) ou saisie d'une ligne ; le système retrouve la référence dans le libellé (même avec minuscules, espaces ou tiret oublié), propose la facture ou le relevé correspondant, validation en un clic ; un écart de montant (frais bancaires) est signalé. S'appuie sur les lignes de relevé déjà présentes en trésorerie (l'import CSV n'est pas codé aujourd'hui).
- **Accès provisoire de 7 jours (scénario 1)** : sans paiement validé à l'échéance, le commerce revient à son offre précédente (en général le Gratuit), avec un email ; rien n'est supprimé.

## 6. Espace partenaire

Aujourd'hui : lien et QR personnels, prospects, clients attribués, commissions, versements. Aucun encaissement.

**Tout partenaire validé peut encaisser.** Nouveautés :

| Action | Détail |
|---|---|
| **Inscrire un commerce** | Depuis une fiche prospect ou un bouton direct : lien d'inscription personnalisé (code du partenaire, nom du commerce et email pré-remplis), envoyé par WhatsApp ou email, ou ouvert sur le téléphone du commerçant. Le compte appartient au commerçant (il confirme son email) et il est attribué au partenaire. Le partenaire **ne crée pas** le compte à sa place. |
| **Encaisser la souscription** | Liste « Clients » : choisir l'offre, montant dans la monnaie locale, confirmer avoir reçu l'argent (numéro de reçu) → abonnement actif. Pas de référence nécessaire pour ses propres clients. |
| **Renouveler** | Liste « Clients » avec la date d'échéance de chacun ; même confirmation. |
| **Encaisser par référence** | Pour le commerce d'un autre partenaire ou d'un commerçant venu seul : saisir la référence que montre le commerçant, vérifier le commerce, l'offre et le montant, confirmer. |
| **Suivi** | Onglet « Encaissements » : historique, encours dû à FOVE, plafond, relevés mensuels et leur état. |

### Rémunération

| Situation | Ce que touche le partenaire |
|---|---|
| Première souscription d'un client qu'il a amené | Sa **commission d'acquisition** (règle actuelle : premier paiement seulement) |
| Renouvellement qu'il encaisse | **Frais d'encaissement : 5 %** |
| Première souscription d'un client amené par un autre partenaire, qu'il encaisse | Frais d'encaissement ; l'autre partenaire garde sa commission d'acquisition |

## 7. Relevé mensuel et compensation

- Établi le **1er de chaque mois** pour le mois écoulé : sommes encaissées − commissions et frais dus au partenaire (y compris ses commissions sur les paiements **en ligne** de ses clients).
- **Solde positif** : le partenaire vire à FOVE sous **15 jours**, avec la référence du relevé (rapprochement automatique). **Solde négatif** : FOVE lui verse la différence (versement habituel).
- Dans la monnaie encaissée, avec l'équivalent dans sa monnaie de versement (USD ou EUR).
- Paiement partiel accepté ; un relevé encore impayé 30 jours après son établissement bloque les nouveaux encaissements (section 8).

## 8. Garde-fous

- **Plafond d'encours** par partenaire : **300 € par défaut** (équivalent dans la monnaie encaissée), relevable par l'admin selon l'historique. Au-delà, ou avec un relevé encore impayé 30 jours après son établissement, le partenaire ne peut plus valider d'encaissement. Les abonnements déjà validés restent actifs : le commerçant n'est jamais pénalisé.
- L'admin peut **désactiver l'encaissement** d'un partenaire.
- **Confirmation au commerçant** après chaque encaissement par un partenaire : « Vous avez payé 990 MAD à X le … : est-ce exact ? », avec un lien « Signaler un problème » qui alerte l'équipe FOVE.
- Tout est inscrit au journal d'audit (montant, monnaie, reçu, partenaire).

## 9. Données (indicatif)

- Facture hors ligne : référence, état (en attente, payée, expirée), monnaie et montant ; paiement avec moyen (virement, espèces, mobile money), partenaire encaisseur éventuel, justificatif.
- Relevé de partenaire : période, référence, monnaie, encaissé, commissions, frais, solde, état, échéance, date de paiement.
- Partenaire : encaissement autorisé, plafond d'encours, monnaie de versement.
- Coordonnées bancaires par pays.

## 10. Découpage

| Lot | Contenu | Dépend de |
|---|---|---|
| **H1. Virement direct** | Références de facture, factures hors ligne, coordonnées par pays, validation manuelle, accès provisoire de 7 jours (scénario 1) | M1 (monnaies) |
| **H2. Rapprochement bancaire** | Import CSV d'un relevé, détection des références, validation en un clic | H1 |
| **H3. Encaissement par les partenaires** | Inscrire un commerce, encaisser la souscription, renouveler, encaisser par référence, confirmation au commerçant, plafond (scénarios 2 et 3) | H1 |
| **H4. Relevés et compensation** | Relevé mensuel, référence, échéance, compensation avec les commissions en ligne, blocage à l'impayé | H3, H2 |
| **H5. Admin et référentiel** | Réglages des partenaires (encaissement, plafond, monnaie de versement), emails en 4 langues, `docs/fonctionnalites.md` | H1 à H4 |

## 11. À faire valider

1. **Juridique et comptable** : mandat d'encaissement (le partenaire encaisse au nom de FOVE, qui facture le commerçant — modèle retenu ici) ou revendeur, selon le pays ; entité ou compte local en Algérie.
2. Taux et montants de la grille (chantier lié).

## 12. Réalisation (26 novembre 2026)

- **Références** : `@fove/shared` (`payment-reference.ts`) ; alphabet sans 0/O/1/I/L, clé de contrôle pondérée (détecte une faute de frappe et la plupart des inversions). Relevé : `FV-RL-XXXXXX-C` aléatoire (le code du partenaire est affiché à côté plutôt que dans la référence, pour garder une saisie courte et un contrôle fiable).
- **Accès provisoire** : une seule fois par commerce (un accès provisoire expiré sans paiement n'est pas redonné : l'offre s'active alors au paiement). Le paiement par carte remplace un accès provisoire en attente.
- **Validation** : fournisseur `BANK_TRANSFER`, `MANUAL` (espèces) ou `MOBILE_MONEY` ; un montant inférieur au dû doit être accepté explicitement (frais bancaires) ; le rapprochement bancaire l'accepte après confirmation (l'écart est affiché).
- **Partenaire** : il encaisse le montant exact ; la facture de ses propres clients est créée sans accès provisoire ni email d'instructions. Frais d'encaissement : commission `COLLECTION_FEE`, compensée dans le relevé.
- **Relevés** : un par partenaire et par monnaie encaissée ; les commissions disponibles sont déduites du relevé le plus important ; émis par la tâche planifiée dès le 1er du mois, ou depuis le back-office.
- **Signalement** : page publique `/signalement?token=…` (jeton signé), alerte email à l'équipe, paiement marqué « signalé ».
- **Non fait** : relance du commerçant avant la fin de l'accès provisoire ; justificatif en pièce jointe (lien seulement) ; écran de saisie d'un versement du partenaire autre que le montant (le rapprochement bancaire et « Paiement reçu » couvrent le cas).

