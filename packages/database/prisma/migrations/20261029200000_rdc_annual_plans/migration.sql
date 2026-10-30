-- Mise à jour des seules offres initiales non reliées à Stripe.
-- Les offres personnalisées et les abonnements Stripe existants sont préservés.
UPDATE "SubscriptionPlan" AS p
SET "name" = v.name,
    "description" = v.description,
    "currency" = 'USD',
    "priceYearlyCents" = v.annual,
    "limits" = jsonb_set(jsonb_set(p."limits"::jsonb, '{customers}', to_jsonb(v.customers)), '{establishments}', to_jsonb(v.establishments)),
    "updatedAt" = CURRENT_TIMESTAMP
FROM (VALUES
  ('starter', 'Essentiel', 'Pour les petits commerces, salons et indépendants.', 12900, 9900, 500, 1),
  ('business', 'Business', 'Pour les boutiques qui veulent développer leur clientèle.', 24900, 19900, 2000, 1),
  ('premium', 'Réseau', 'Pour les enseignes qui gèrent plusieurs boutiques.', 49900, 39900, 10000, 3)
) AS v(code, name, description, old_annual, annual, customers, establishments)
WHERE p.code = v.code AND p."priceYearlyCents" = v.old_annual AND p.currency = 'EUR'
  AND p."stripePriceMonthlyId" IS NULL AND p."stripePriceYearlyId" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "Subscription" s WHERE s."planId" = p.id AND s.provider = 'STRIPE');
