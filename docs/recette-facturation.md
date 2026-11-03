# Recette de la facturation (Stripe en mode test)

Les tests automatisés couvrent le mode simulé et des webhooks Stripe signés fabriqués à la main. Le parcours réel avec Stripe (Checkout, 3-D Secure, prorata, portail) se vérifie à la main, avec des clés **de test**, avant chaque mise en ligne qui touche la facturation.

## Préparation

1. Dans `.env.local` : `STRIPE_SECRET_KEY=sk_test_…`, et les identifiants de prix annuels de test dans `/admin/plans` pour Essentiel, Business et Réseau.
2. Relayer les webhooks vers l'API locale : `stripe listen --forward-to localhost:5291/api/billing/stripe/webhook`, puis copier le secret affiché dans `STRIPE_WEBHOOK_SECRET`.
3. Créer un commerçant neuf (il démarre sur l'offre Gratuite). Pour le scénario 1, ne pas confirmer l'email.

Cartes de test Stripe : `4242 4242 4242 4242` (paiement accepté), `4000 0025 0000 3155` (authentification 3-D Secure demandée), `4000 0000 0000 0341` (carte enregistrée, puis prélèvements refusés).

## Scénarios

| # | Scénario | Résultat attendu |
|---|---|---|
| 1 | Sur `/tarifs`, « Choisir Essentiel », inscription sans confirmer l'email, création du commerce, paiement avec `4242…` | Arrivée directe sur le paiement Stripe, qui demande l'email de facturation ; retour sur `/app/billing?checkout=success`, offre Essentiel active après le webhook, quota de 500 clients |
| 2 | Essentiel → Business | Facture du prorata émise et payée **immédiatement** dans Stripe ; offre Business active |
| 3 | Passage à une offre supérieure avec `4000 0025 0000 3155` sans valider l'authentification | L'offre ne change pas (mise à jour en attente dans Stripe) |
| 4 | Business → Essentiel | Avoir du prorata sur le solde client Stripe ; quotas d'Essentiel |
| 5 | Résilier, puis « Reprendre l'abonnement » | `cancel_at_period_end` passe à vrai puis faux dans Stripe ; aucune coupure |
| 6 | Résilier puis avancer une horloge de test Stripe après l'échéance | Webhook `customer.subscription.deleted` : offre Gratuite, cartes et historique intacts |
| 7 | Carte `4000 0000 0000 0341` puis avancer l'horloge jusqu'au renouvellement | Statut « Paiement en échec », droits gardés 7 jours, puis offre Gratuite ; un paiement réussi rétablit l'offre |
| 8 | « Factures et moyen de paiement » | Ouverture du portail client Stripe, retour sur `/app/billing` |
| 9 | Rejouer un webhook depuis le tableau de bord Stripe | Réponse `duplicate: true`, aucun changement |
| 10 | Tenter d'acheter Gratuit ou Sur-mesure par l'API (`POST /api/app/billing/checkout`) | Refus `plan_not_purchasable` |

Les horloges de test (« test clocks ») du tableau de bord Stripe permettent d'avancer le temps d'un abonnement sans attendre un an.
