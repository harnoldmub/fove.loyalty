# RGPD et responsabilités

## Rôles

- **Commerçant** : responsable de traitement pour les données de ses clients (programme de fidélité, fichier clients). Il définit la finalité, informe ses clients (page d'inscription + lien vers sa politique de confidentialité, réglable dans Paramètres) et répond à leurs demandes.
- **Dizayna (FOVE)** : sous-traitant (art. 28). Traite les données uniquement pour fournir le service, sur instruction du commerçant. Un contrat de sous-traitance (DPA) doit être annexé aux conditions commerciales avant le pilote.
- **Dizayna** est responsable de traitement pour les comptes des commerçants et de leurs équipes.

## Données et bases légales

| Données | Base légale | Conservation |
|---|---|---|
| Identité et coordonnées du client, carte, historique | Exécution du contrat (adhésion au programme) | Durée d'activité + `dataRetentionMonths` (36 mois par défaut, réglable) |
| Consentement marketing email / SMS | Consentement, **distinct** de l'adhésion, horodaté (`consentUpdatedAt`) | Jusqu'au retrait |
| Journal d'audit, opérations | Intérêt légitime (sécurité, preuve) | Durée du contrat |
| Sessions, codes de vérification | Sécurité | Supprimés automatiquement à expiration |

## Droits des personnes (outillés)

- **Accès / portabilité** : export JSON complet d'un client (`Clients > fiche > Exporter ses données`, `GET /api/app/customers/:id/export`). Audité.
- **Effacement** : anonymisation irréversible (nom, téléphone, email, identifiants effacés, cartes fermées). L'historique comptable des points est conservé sans donnée identifiante. Audité.
- **Rectification** : modification de la fiche ; les doublons sont empêchés par identifiant (téléphone, email, référence), jamais par fusion sur le nom.
- **Retrait du consentement marketing** : modifiable sur la fiche, sans effet sur la carte.

## Sécurité et localisation

Voir [sécurité](securite.md). Hébergement Railway (région à choisir à la création : privilégier l'UE) et base Neon (région `eu-central-1` actuellement). Sauvegardes : voir [déploiement](deploiement-railway.md).

## À faire avant le pilote commercial

1. Rédiger CGU commerçant + DPA (sous-traitance) + politique de confidentialité FOVE.
2. Tenir le registre des traitements de Dizayna.
3. Tâche d'anonymisation automatique des clients inactifs au-delà de `dataRetentionMonths` : le réglage existe, l'automatisation n'est **pas encore activée** (décision produit : prévenir le commerçant avant).
