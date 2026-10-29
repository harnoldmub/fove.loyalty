# Intégration Match Kwata

Match Kwata (Astro, React, Prisma) est le premier tenant. **FOVE n'accède jamais à la base de Match Kwata** : c'est la boutique qui appelle l'API FOVE avec une clé secrète.

## Ce qui a été analysé dans le dépôt Match Kwata

- `User` (id UUID, email unique, prénom, nom, téléphone, `newsletterOptIn`) → client FOVE, référence externe stable = `User.id`.
- `Order` (id UUID, `orderNumber`, `status` PENDING_PAYMENT → **PAID** → … → REFUNDED, `currency`, `total`) → crédit de points au passage à `PAID`, référence = `Order.id`.
- Paiement : webhook Stripe et FlexPay de la boutique (`src/pages/api/webhooks/*`). Remboursements : statut `REFUNDED`.
- La boutique possède déjà un module de fidélité interne (`LoyaltyProgram`, `LoyaltyAccount`…). **Décision à prendre** : désactiver ce module au profit de FOVE et migrer les soldes (import), ou les faire coexister le temps du pilote.

Le dépôt Match Kwata **n'a pas été modifié**.

## Fonctions de la carte Match Kwata reprises dans FOVE

Carte à passages (un par jour), tampons numérotés avec la récompense sur la dernière case, lien de carte stable envoyé par WhatsApp (renouvellement confirmé), carte en image/PDF 9:16, carte mémorisée sur le téléphone, « Retrouver ma carte » par email ou téléphone sans renouveler le lien, affiche A4, scanner plein cadre avec fiche caisse dédiée, Google Wallet (ajout, notifications individuelles et groupées), redirection vers la connexion quand la session expire, recherche par téléphone saisi au format local, registre et audit immuables en SQL.

Différence assumée : la réduction en pourcentage de Match Kwata (« 10 passages = 10 % ») devient une récompense du catalogue FOVE (« Réduction de 10 % », coût 10 tampons), validée en caisse comme les autres récompenses.

## Contrat d'intégration

Auth : `Authorization: Bearer fove_sk_live_…` (scopes `integrations:write`, `customers:read`, `loyalty:read`).

| Événement boutique | Appel FOVE | Garantie |
|---|---|---|
| Commande passée à `PAID` | `POST /api/v1/integrations/commerce/orders/paid` | Dédupliqué par `externalOrderId` : un renvoi ne crédite jamais deux fois (`replayed: true`). La réponse contient `cardUrl` : la boutique peut proposer « Voir ma carte » sur sa page de confirmation, comme aujourd'hui |
| Remboursement (total ou partiel) | `POST /api/v1/integrations/commerce/orders/refunded` | Calculé sur le cumul remboursé, arrondi au point supérieur (règle Match Kwata), plafonné aux points de la commande, dédupliqué par `externalRefundId` ; en carte à passages, le passage n'est retiré que si la commande est entièrement remboursée |
| Inscription / connexion d'un client | `POST /api/v1/integrations/commerce/customers` | Rattachement par `externalId`, puis par email ; jamais par nom |
| Affichage du solde dans « Mon compte » | `GET /api/v1/customers/lookup?externalId=<User.id>` | Lecture seule |

Rattachement d'un client : référence externe connue → même client ; sinon email déjà connu → rattachement et ajout de la référence ; sinon création. Un téléphone appartenant à un autre client renvoie `customer_conflict` (rattachement manuel dans FOVE) plutôt qu'une fusion.

La devise de la commande doit être celle du programme (`currency_mismatch` sinon) : créer le programme Match Kwata en **EUR**, par exemple `1 € = 1 point`.

## Code côté Match Kwata (à ajouter, non fait)

```ts
// src/lib/fove.ts
import { FoveClient } from "@fove/sdk";
export const fove = process.env.FOVE_SECRET_KEY ? new FoveClient({ apiKey: process.env.FOVE_SECRET_KEY }) : null;

// Dans le traitement qui passe la commande à PAID (webhook Stripe / FlexPay)
if (fove) {
  await fove.orderPaid({
    programId: process.env.FOVE_PROGRAM_ID!,
    externalOrderId: order.id,
    orderNumber: order.orderNumber,
    customer: { externalId: order.userId ?? `guest:${order.email}`, email: order.email, firstName: user?.firstName ?? "", lastName: user?.lastName ?? "", marketingEmailConsent: user?.newsletterOptIn ?? false },
    amount: order.total.toFixed(2),
    currency: order.currency,
    paidAt: new Date().toISOString(),
  }).catch((e) => console.error("FOVE indisponible, à rejouer", e));
}
```

Un échec réseau ne doit pas bloquer la commande : journaliser et rejouer (la déduplication FOVE rend le rejeu sûr). Prévoir un script de rattrapage qui renvoie les commandes `PAID` des N derniers jours.

## Tests

`apps/api/test/matchkwata.test.ts` simule la boutique avec les mêmes formes de données et appelle l'API FOVE réelle via le SDK : création, rejeu, rattachement par référence puis par email, homonyme non fusionné, remboursements partiels, devise refusée, journal de synchronisation. **Cette simulation ne remplace pas un test sur la vraie boutique** : la synchronisation réelle sera validée en staging avec une clé de test.
