# Chantier — Connexion des commerçants par code (sans mot de passe)

> Statut : **livré** le 26 novembre 2026 (« full OTP », branche `feat/connexion-otp`). Concerne l'espace commerçant, l'admin FOVE et les partenaires (même compte utilisateur). Le compte client FOVE fonctionne déjà ainsi ([chantier-compte-fove.md](chantier-compte-fove.md)).

## 1. Pourquoi

- **Email prouvé dès le départ** : un compte ne peut plus exister avec un email non confirmé (fin des comptes « non confirmés » et de la prise de contrôle d'un compte créé avec l'email d'autrui).
- **Le mot de passe ne protégeait pas plus** : « mot de passe oublié » passait déjà par l'email. Il ajoutait des risques (réutilisation, fuite, essais) et du code à sécuriser.
- **Cohérence** avec le compte client FOVE.

## 2. Décisions

| Sujet | Décision |
|---|---|
| Moyens de connexion | **Google** ou **code à 6 chiffres par email**. Plus aucun mot de passe. |
| Inscription | Le code est demandé **avant** la création du compte : nom et acceptation des CGU après le code juste. |
| Code | Valable **10 minutes**, **5 essais** ; nouveau code après 1 minute ; au plus 5 codes par email et 60 par adresse IP par heure. Même réponse que l'email ait un compte ou non. |
| Session | **90 jours glissants** : chaque utilisation repousse l'échéance ; on ne retape presque jamais de code sur son appareil. |
| Invitation d'équipe | Le lien de l'invitation, reçu par email, prouve l'adresse : nom seulement, pas de mot de passe. |
| Admin et finance | Même connexion par code. Double authentification par application à ajouter lors de la revue sécurité. |
| Super admin local | Seed sans mot de passe ; en local, le code s'affiche dans les journaux du serveur (emails en console). |
| Appareil partagé en caisse | Hors périmètre ; si besoin, « code caisse » pour passer d'un caissier à l'autre sur un appareil déjà connecté. |

## 3. Parcours

1. `/login` et `/signup` : « Continuer avec Google », ou « Continuer avec mon email ».
2. Email → « Code envoyé » (même message dans tous les cas).
3. Saisie du code :
   - compte existant : connecté ;
   - nouvel email : nom (pré-rempli depuis un lien partenaire) et case CGU, puis compte créé avec l'email confirmé et connexion.
4. Les paramètres actuels sont conservés : `next`, `offre` (achat depuis la page tarifs), `ref` (parrainage), lien partenaire (`name`, `email`, `business`).

## 4. Ce qui disparaît

- Inscription et connexion par mot de passe, « mot de passe oublié », réinitialisation, confirmation d'email par lien et ses relances (J1/J3/J7), bandeau et fenêtre « confirmez votre email ».
- Données : `User.passwordHash`, `failedLoginCount`, `lockedUntil`, table `AuthToken`.
- Les limites des comptes non confirmés restent dans le code comme filet de sécurité, mais ne s'appliquent plus à personne.

## 5. Découpage

| Lot | Contenu |
|---|---|
| **O1. API** | Table des codes, demande et vérification du code, création du compte à la première connexion, session glissante, invitations sans mot de passe, Google sans mot de passe, suppression des routes et données mot de passe, seed. |
| **O2. Web** | Écran unique connexion / inscription (email, code, profil), invitation, suppression des écrans mot de passe et confirmation, 4 langues. |
| **O3. Tests et docs** | Tests de l'API par code (connexion, inscription, limites, invitation), référentiel fonctionnel, sécurité. |
