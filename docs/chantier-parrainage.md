# Chantier — Parrainage entre commerçants

> Statut : **validée le 25 novembre 2026**. Rien n'est codé.

## 1. Ce qui existe et ne va pas

Aujourd'hui, la carte « Parrainage entre commerçants » des Paramètres donne un lien `fove.digital/signup?ref=<adresse-du-commerce>` et promet « 20 $ de crédit déduits de votre abonnement dès sa première souscription ».

| Constat | Détail |
|---|---|
| Crédit jamais utilisé | Aucune facture ne déduit les 20 $ (référentiel, section 9). |
| Crédit accordé trop tôt | Dès la **création** du commerce filleul, même s'il ne paie jamais. |
| Facile à abuser | Une personne peut parrainer ses propres commerces, sans plafond. |
| Rien pour le filleul | Seul le parrain est récompensé. |
| Aucun suivi pour le parrain | Filleuls et crédit ne sont visibles que dans l'admin (Finance > Parrainages). |
| Double récompense possible | Un même commerce peut rapporter une commission à un partenaire **et** un crédit à un parrain. |

## 2. Décisions

| Sujet | Décision |
|---|---|
| Qui peut parrainer | **Les commerces sur une offre payante** (Essentiel, Business, Réseau ; réglable par offre dans l'admin, y compris Sur-mesure). En Gratuit, la page est visible mais verrouillée, avec l'invitation à passer à une offre payante |
| Récompense du parrain | **20 USD** de crédit par filleul, déduits de ses prochaines factures |
| Récompense du filleul | **20 USD** de remise sur sa **première souscription annuelle** |
| Quand le crédit est gagné | Au **premier paiement annuel** du filleul, après **14 jours** sans remboursement ni résiliation |
| Plafond de gain | Par **année civile** : **le plus petit de 200 USD ou du prix annuel de l'offre du parrain** au moment où le crédit est acquis. Aucune limite sur le nombre de filleuls |
| Au-delà du plafond | Le filleul garde sa remise ; le parrain ne gagne plus de crédit jusqu'au 1er janvier, et il est **invité** (pas basculé) à devenir **partenaire** |
| Utilisation du crédit | Déduit automatiquement de la **prochaine facture** ; le plus ancien d'abord ; jamais versé en argent |
| Expiration | **3 ans** après l'acquisition, crédit par crédit |
| Anti-abus | Aucun crédit si parrain et filleul ont **un propriétaire en commun** ou paient avec **la même carte bancaire** |
| Partenaire et parrain en même temps | **Un seul** est récompensé : celui dont le lien a été cliqué **en premier** (le filleul garde sa remise s'il est arrivé par un lien de parrainage) |
| Page | Une page **« Parrainage »** dans l'espace commerçant remplace la carte des Paramètres |
| Parrainages déjà enregistrés | Repassés au nouveau régime : en attente du premier paiement annuel du filleul |

Le délai de 14 jours n'est pas une obligation légale (le droit de rétractation protège les consommateurs, pas les professionnels ; à confirmer par le juriste, notamment pour la RDC) : c'est une protection contre le remboursement après coup.

### Plafond selon l'offre du parrain

| Offre du parrain | Prix annuel | Plafond par année civile | Soit |
|---|---|---|---|
| Essentiel | 99 USD | 99 USD | 5 filleuls, une année offerte |
| Business | 199 USD | 199 USD | 10 filleuls, une année offerte |
| Réseau | 399 USD | 200 USD | 10 filleuls, la moitié de l'année |

Le parrain ne peut ainsi jamais gagner plus que ce qu'il peut consommer à son renouvellement suivant ; l'expiration ne joue que s'il arrête de payer ou change d'offre.

**Parrain qui repasse en Gratuit** : il garde le crédit déjà acquis (déduit s'il reprend une offre payante, jusqu'à son expiration), mais ses nouveaux filleuls ne lui rapportent plus rien. Les filleuls, eux, gardent leur remise de 20 USD : c'est une promesse qui leur est faite.

## 3. Règles détaillées

### 3.1 Attribution

- Lien de parrainage : `fove.digital/signup?ref=<adresse-du-commerce>`, valable **30 jours** (cookie), comme le lien partenaire `fove.digital/p/<CODE>`.
- Chaque cookie garde la **date du clic**. À la création du commerce, si les deux existent, seul le plus ancien est retenu (partenaire **ou** parrain).
- Le parrainage est enregistré à la création du commerce, à l'état **« inscrit »**. Aucun crédit à ce stade.
- Exclusions vérifiées à l'enregistrement et à nouveau au paiement :
  - un propriétaire commun aux deux commerces ;
  - le commerce qui se parraine lui-même ;
  - au paiement : la même carte bancaire (empreinte de carte fournie par Stripe) qu'un paiement du parrain.

### 3.2 Remise du filleul

- 20 USD déduits **une seule fois**, sur sa première souscription annuelle payante (coupon Stripe appliqué automatiquement au paiement ; en mode simulé, montant réduit).
- Affichée avant le paiement sur la page Abonnement : « Parrainé par <commerce> : 20 $ offerts sur votre premier abonnement ».

### 3.3 Crédit du parrain

| État | Quand |
|---|---|
| **Inscrit** | Le filleul a créé son commerce |
| **En attente** | Premier paiement annuel du filleul ; date d'acquisition prévue = paiement + 14 jours |
| **Acquis** | 14 jours écoulés, sans remboursement ni résiliation ; expiration = acquisition + 3 ans |
| **Hors plafond** | Acquis mais plafond de l'année civile atteint : 0 $ pour le parrain (le filleul garde sa remise) |
| **Annulé** | Remboursement ou résiliation dans les 14 jours, ou exclusion anti-abus |
| **Expiré** | Crédit non utilisé 3 ans après l'acquisition |

- Le crédit acquis est ajouté au **solde client Stripe** du parrain : Stripe le déduit de sa prochaine facture.
- Un crédit n'est acquis que si le parrain est **sur une offre payante** à la date d'acquisition ; sinon le parrainage passe « hors offre » (0 $ pour le parrain, remise maintenue pour le filleul).
- Plafond : calculé sur l'**année civile de l'acquisition**, avec l'offre du parrain à ce moment-là.
- Un remboursement **après** les 14 jours ne retire pas le crédit, sauf fraude constatée : l'admin peut alors l'annuler à la main.

### 3.4 Invitation à devenir partenaire

- À **80 %** du plafond puis au plafond atteint : encart sur la page Parrainage et email.
- Un clic ouvre la candidature partenaire **pré-remplie** (nom, email, commerce, ville) ; il complète et accepte les conditions du programme partenaires.
- Validation prioritaire par l'équipe FOVE.
- Une fois partenaire, ses nouveaux liens rapportent une **commission** et plus de crédit (une seule récompense par nouveau client).

## 4. Page « Parrainage » (`/app/parrainage`)

- **Mon lien** : copier, partager sur WhatsApp, QR à montrer.
- **Mes gains** : crédit acquis, utilisé, disponible, en attente ; plafond de l'année et ce qu'il en reste ; prochaine expiration.
- **Mes filleuls** : nom du commerce, date d'inscription, état (section 3.3), montant, date d'acquisition prévue.
- **Conditions du parrainage** : le texte de la section 5, en entier.
- **Devenir partenaire** : l'encart de la section 3.4 quand il s'applique.
- Dans les Paramètres, la carte actuelle est remplacée par un lien vers cette page. Accès : propriétaire du commerce (permission facturation).
- **En offre Gratuite** : la page est visible mais verrouillée : « Passez à une offre payante pour parrainer vos confrères et gagner jusqu'à une année offerte », avec le bouton vers les offres. Le lien de parrainage n'est pas affiché.

**Vitrine** : une ligne « Programme de parrainage — jusqu'à une année offerte » dans le tableau comparatif de la page Tarifs (incluse dans Essentiel, Business et Réseau, absente de Gratuit), et dans les avantages des offres payantes. 4 langues.

## 5. Conditions du parrainage (texte affiché, premier jet)

> **Conditions du programme de parrainage FOVE** — version du [date de publication]
>
> 1. **Qui peut parrainer.** Tout commerçant abonné à une offre payante FOVE. Un crédit n'est acquis que si votre commerce est sur une offre payante à la date d'acquisition.
> 2. **Comment parrainer.** Partagez votre lien de parrainage. Le commerce que vous recommandez (le « filleul ») doit créer son compte FOVE dans les 30 jours qui suivent son clic sur votre lien.
> 3. **Ce que gagne le filleul.** 20 USD déduits de sa première souscription annuelle à une offre payante. Une seule fois par commerce.
> 4. **Ce que vous gagnez.** 20 USD de crédit par filleul, acquis 14 jours après son premier paiement annuel, à condition qu'il n'ait été ni remboursé ni résilié pendant ce délai.
> 5. **Plafond.** Par année civile (du 1er janvier au 31 décembre), vos gains sont plafonnés au plus petit de ces deux montants : 200 USD, ou le prix annuel de votre offre au moment où le crédit est acquis. Exemples : Essentiel, 99 USD ; Business, 199 USD ; Réseau, 200 USD. Au-delà, vos filleuls gardent leur remise, mais vous ne gagnez plus de crédit avant le 1er janvier suivant. Le nombre de filleuls n'est pas limité.
> 6. **Utilisation du crédit.** Votre crédit est déduit automatiquement de vos prochaines factures FOVE, en commençant par le plus ancien. Il ne peut être ni versé en argent, ni transféré, ni échangé.
> 7. **Expiration.** Chaque crédit expire 3 ans après avoir été acquis s'il n'a pas été utilisé.
> 8. **Exclusions.** Aucun crédit n'est accordé lorsque le parrain et le filleul ont un propriétaire en commun, utilisent le même moyen de paiement, ou lorsqu'un même commerce est parrainé plusieurs fois. Si le filleul est arrivé par le lien d'un partenaire commercial FOVE avant votre lien, c'est le partenaire qui est récompensé.
> 9. **Fraude.** FOVE peut annuler un crédit obtenu de manière abusive ou frauduleuse.
> 10. **Programme partenaires.** Si vous recommandez FOVE régulièrement, vous pouvez rejoindre le programme partenaires et percevoir une commission à la place du crédit.
> 11. **Évolution du programme.** FOVE peut modifier ou arrêter ce programme ; les crédits déjà acquis restent utilisables jusqu'à leur expiration.

Traduit dans les 4 langues ; à faire relire par le juriste avec les autres textes.

## 6. Données

- `ReferralReward` évolue : état (section 3.3), date du clic, date d'acquisition prévue et effective, montant acquis (20 ou 0 si hors plafond), montant utilisé, expiration, motif d'annulation, paiement déclencheur.
- Utilisations du crédit : lien entre crédit et facture (pour le « plus ancien d'abord » et l'historique).
- Remise du filleul : coupon Stripe unique, et trace de son application.
- Parrainages existants : passés à l'état « inscrit », crédits remis à zéro (jamais appliqués).

## 7. Découpage

| Lot | Contenu |
|---|---|
| **P1. Attribution** | Fonction d'offre `referral` (payantes ; réglable dans l'admin) ; date du clic dans les deux cookies, règle « premier lien », exclusion du propriétaire commun, état « inscrit », reprise des parrainages existants |
| **P2. Récompenses** | Remise du filleul au paiement ; crédit en attente puis acquis (tâche planifiée), annulation au remboursement, plafond par année civile, solde Stripe, expiration ; mode simulé ; carte bancaire identique |
| **P3. Page Parrainage et vitrine** | Lien, gains, filleuls, conditions (4 langues) ; version verrouillée en Gratuit ; remise visible sur la page Abonnement ; carte des Paramètres remplacée ; ligne « Programme de parrainage » sur la page Tarifs |
| **P4. Invitation partenaire** | Encart et email à 80 % et 100 %, candidature pré-remplie |
| **P5. Admin et référentiel** | Finance > Parrainages avec les nouveaux états et l'annulation manuelle ; `docs/fonctionnalites.md` (section 9 corrigée) |

## 8. Prérequis et points ouverts

1. **Stripe** : vérifier le solde client (crédit déduit automatiquement des factures) et créer le coupon « 20 USD, une fois » en mode test, puis en production.
2. **Juriste** : relecture des conditions de la section 5 ; confirmation que le délai de 14 jours n'est pas une obligation légale.
3. **Empreinte de carte** : disponible uniquement pour les paiements Stripe par carte ; sans carte (mode simulé, virement), seule l'exclusion par propriétaire s'applique.
