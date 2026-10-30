# Offres FOVE — lancement RDC

Grille de départ à tester : souscription annuelle en USD, payée à l’avance, sans commission sur les ventes. L’essai reste disponible ; choisir une offre déclenche le paiement de la première année sans reporter le débit à la fin de l’essai.

| Offre | Annuel | Points de vente inclus | Clients inclus |
| --- | --- | --- | --- |
| Essentiel (`starter`) | 99 $ | 1 | 500 |
| Business (`business`) | 199 $ | 1 | 2 000 |
| Réseau (`premium`) | 399 $ | 3 | 10 000 |

Business est recommandé. Installation, personnalisation, affiche QR et formation offertes. Les limites clients sont globales à l’entreprise, y compris pour Réseau. Aucun supplément automatique par boutique n’est défini au-delà du forfait.

## Offre de lancement à activer dans Stripe

149 $ la première année de Business pour les 20 premiers commerces, puis 199 $/an. Configurer sur le produit Business une remise de 50 USD applicable une seule fois, limitée à 20 utilisations et aux nouveaux abonnements. Ne pas créer un prix récurrent à 149 $, qui reconduirait la remise chaque année. Vérifier le total du premier paiement et le montant du renouvellement avant de publier l’offre. Cette promotion n’est pas encore créée ni annoncée dans l’application.

## Fonctionnalités et limites actuelles

- Cartes, QR d’inscription, scan, récompenses, statistiques et accès employés existent.
- Google Wallet et ses notifications existent, mais nécessitent le compte émetteur et ses identifiants. Les droits Wallet spécifiques Business/Réseau restent à implémenter avant de vendre cette distinction.
- Apple Wallet reste à implémenter ; ne pas le présenter comme disponible.
- SMS et WhatsApp automatisés : hors abonnement, crédits prépayés à implémenter. Aucun crédit ni débit d’envoi n’est actuellement facturé.

## Mise en service

Le seed crée ces tarifs pour les nouvelles bases. La migration `20261029200000_rdc_annual_plans` actualise uniquement les anciens tarifs initiaux sans identifiant Stripe et sans abonnement Stripe ; les offres personnalisées sont conservées et doivent être revues dans l’administration. Les codes techniques restent inchangés. Les anciennes périodes mensuelles restent lisibles et synchronisables, mais les nouvelles souscriptions sont annuelles.

Créer les trois prix annuels USD dans le nouveau compte Stripe FOVE et renseigner leurs identifiants dans l’administration. Aucun abonnement ne peut être activé en mode simulé en production. Le compte Stripe, les prix, le webhook et le portail client restent à configurer ; l’intégration ne doit pas être annoncée comme active avant validation.
