# Compte client FOVE — points à faire valider par un juriste

> Statut : **premier jet à relire**, rédigé le 24 novembre 2026. Les textes sont en ligne sur la branche `feat/compte-fove`, marqués « projet » : `/compte/conditions` et `/compte/confidentialite`. Leur contenu est dans `apps/web/messages/fr/client.json`, clé `legal`.

## 1. Ce qui change

Jusqu'ici, le client final n'avait pas de compte : chaque commerçant était **responsable de traitement** des données de ses clients, et Dizayna (FOVE) n'était que son **sous-traitant**.

Avec le compte client FOVE, une personne a une **identité unique** qui regroupe ses cartes de tous les commerces. Dizayna décide seule de la finalité et des moyens de ce compte. Dizayna devient donc **responsable de traitement** pour :
- l'email, le prénom, le nom, le téléphone de contact et l'identifiant Google du compte ;
- les sessions, les codes de connexion et le journal de sécurité ;
- **la liste des commerces où la personne a une carte** (lien entre le compte et les fiches).

Les fiches et cartes chez chaque commerce restent sous la responsabilité du commerçant, avec FOVE comme sous-traitant. Le commerçant ne voit pas le compte : ni son existence, ni les autres commerces du client.

## 2. Ce que fait concrètement le produit

Pour que la relecture porte sur le fonctionnement réel :

| Sujet | Fonctionnement |
|---|---|
| Connexion | Google, ou code à 6 chiffres par email (10 min, 5 essais). Pas de mot de passe. Le téléphone n'est jamais un identifiant. |
| Création au scan du QR | Le compte est créé, non confirmé, en même temps que la carte. Un email de bienvenue permet de confirmer l'adresse. |
| Email déjà inscrit | Si quelqu'un tape un email déjà connu, un code est envoyé au lieu de créer la carte. La personne qui tape l'email apprend donc qu'il est inscrit (choix produit assumé). |
| Rattachement des cartes | Uniquement sur l'email **confirmé** du compte. Le client accepte, ou refuse (« Ce n'est pas moi »), les cartes qu'un commerce a enregistrées avec son email. |
| Acceptation des textes | Mention « En continuant, vous acceptez… » sous chaque bouton qui crée le compte ou y connecte. La date et la version acceptées sont enregistrées en base à la création et à chaque connexion. Il n'y a pas de case à cocher dédiée. |
| Suppression | Immédiate, par le client, dans « Mes cartes ». Les cartes restent chez les commerces, détachées. Le journal ne garde que l'identifiant technique du compte. |
| Cookies | Cookie de session strictement nécessaire (180 jours glissants), cookie temporaire de 10 minutes pendant la connexion Google, cookie de langue. |
| Prestataires | Railway (hébergement), Neon (base de données, région de Francfort), Resend (emails), Google (connexion, si choisie). |

## 3. Points marqués « à valider » dans les textes

1. **Identité de l'éditeur** : forme sociale, siège social et immatriculation de Dizayna. Une adresse email dédiée aux données personnelles.
2. **Mode d'acceptation** : la mention sous le bouton suffit-elle, ou faut-il une case à cocher dédiée aux conditions du compte FOVE ? Au scan, une case existe déjà, mais pour les conditions du **programme du commerce**.
3. **Âge minimum** pour créer un compte, et accord parental en dessous.
4. **Valeur des points** : la clause « sans valeur monétaire, ni remboursables, ni transférables » est-elle compatible avec les programmes des commerces ?
5. **Limitation de responsabilité** de FOVE vis-à-vis des programmes des commerces et des services tiers (Google, messagerie).
6. **Suspension ou suppression** d'un compte frauduleux : modalités et préavis.
7. **Nouvelles versions des textes** : information, ré-acceptation, et ce qui se passe en cas de refus.
8. **Droit applicable, juridiction, médiation de la consommation**, compte tenu des pays visés : la France, la RDC (Code du numérique de 2023) et l'Afrique francophone.
9. **Transferts hors de l'Union européenne** (Railway, Resend et Google sont américains) : garanties à citer (clauses contractuelles types, cadre UE–États-Unis) et région d'hébergement Railway à confirmer.
10. **Durées de conservation** :
    - comptes inactifs : à décider (par exemple 3 ans), car aucune suppression automatique n'existe aujourd'hui ;
    - journal de sécurité.
11. **Portabilité** : il n'y a pas d'export en libre-service, le client passe par le contact. Ce délai est-il acceptable ?
12. **Autorités de contrôle** à citer en dehors de la CNIL.

## 4. Effets sur les textes existants

- **CGU commerçant** (`/cgu`, clé `marketing.terms`) : il faudrait ajouter que les clients peuvent rattacher leur fiche à un compte FOVE, dont Dizayna est responsable, sans accès du commerçant. La clause « un client inscrit chez plusieurs commerçants possède des fiches et des soldes totalement indépendants » reste vraie, puisque les soldes restent séparés. **Non modifiée** : c'est un texte contractuel, à faire évoluer avec le juriste.
- **Accord de sous-traitance (DPA)** avec les commerçants : préciser que FOVE est aussi responsable de traitement du compte client et du lien compte–fiche.
- **Page « Données personnelles » du site** (`/confidentialite`) : une section « Compte client FOVE » a été ajoutée, avec un renvoi vers la politique du compte. Elle est traduite dans les 4 langues.
- **Registre des traitements** de Dizayna : ajouter le traitement « compte client FOVE ».

## 5. Après validation

1. Remplacer le texte du projet dans `apps/web/messages/fr/client.json` (clé `legal`), et vider la clé `legal.draft` pour retirer le bandeau « projet ».
2. Traduire les deux textes en anglais, arabe et espagnol, puis vider `legal.frenchOnly` dans ces langues.
3. Changer `CLIENT_TERMS_VERSION` (`apps/api/src/client-account/client-account.service.ts`) et la date « Version du … » des textes.
