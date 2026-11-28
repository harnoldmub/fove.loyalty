# Chantier — Parrainage entre clients d'un commerce

> Statut : **livré** le 28 novembre 2026 (P1 à P3, branche `feat/parrainage-clients`). Distinct du parrainage entre commerçants ([chantier-parrainage.md](chantier-parrainage.md)). Référentiel : [fonctionnalites.md](fonctionnalites.md).

## 1. Principe

Un client fidèle invite un ami chez son commerce. Quand l'ami vient vraiment, les deux sont récompensés : le commerçant gagne un nouveau client recommandé.

## 2. Décisions

| Sujet | Décision |
|---|---|
| Offres | Offres payantes (fonction « Campagnes Wallet »). |
| Activation | Par chaque commerce, depuis son espace (désactivé par défaut). Récompenses et plafond réglables. |
| Lien | « Parrainer un ami » sur la carte du client : lien personnel vers l'inscription du commerce, partage WhatsApp. |
| Filleul | Nouveau client du commerce seulement (fiche créée par l'inscription : téléphone et email inconnus), jamais le même compte FOVE que le parrain. Bienvenue à l'inscription : **+1 tampon** (programme à tampons), 0 point par défaut. |
| Parrain | Récompensé au **premier passage en caisse** du filleul, jamais à la simple inscription : **+2 tampons** ou **+50 points** ; notification sur sa carte. |
| Plafond | **5 parrainages récompensés par client et par mois** (mois du commerce) ; au-delà, parrainage noté sans récompense. |
| Traçabilité | Bienvenue et récompense sont des opérations de fidélité « Parrainage » dans l'historique. |

## 3. Découpage

| Lot | Contenu |
|---|---|
| P1 | Lien de parrainage par carte, enregistrement à l'inscription, garde-fous, bienvenue du filleul. |
| P2 | Récompense du parrain au premier passage, plafond mensuel, notification, réglages du commerce. |
| P3 | Bouton sur la carte, partage WhatsApp, suivi pour le commerçant, 4 langues, tests, docs. |

## 4. Mise en œuvre

- `LoyaltyAccount.referralCode` (7 caractères, créé à la première demande de lien), `CustomerReferralSettings` (par commerce), `CustomerReferral` (SIGNED_UP → REWARDED ou CAPPED ; unique par filleul et commerce).
- `CustomerReferralService` : `onSignup` dans la transaction d'inscription (`ClientEnrollmentService`, fiche créée seulement), `onVisit` après chaque passage en caisse non rejoué (`LoyaltyService.earn`), récompense réclamée par mise à jour conditionnelle (une seule fois même en cas de passages simultanés), opérations idempotentes `referral-welcome:` / `referral-reward:`.
- API : `GET/PUT /app/customer-referrals[/settings]`, `POST /public/cards/:token/referral-link` ; `referral` sur la carte publique et la page d'inscription.
- Web : encadré « Parrainer un ami » sur la carte, bandeau d'invitation et code transmis à l'inscription (`?parrain=`, gardé en sessionStorage), onglet « Parrainage clients » dans Relances.
