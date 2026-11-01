/**
 * Script de configuration automatique de Stripe en Production (Live).
 *
 * Utilisation :
 *   node scripts/setup-stripe-live.mjs sk_live_... [whsec_...]
 *
 * Actions automatiques :
 * 1. Validation de la clé secrète Live Stripe.
 * 2. Création/récupération des 3 produits et prix récurrents annuels en USD (Essentiel $99/an, Business $199/an, Réseau $399/an).
 * 3. Configuration automatique du webhook Stripe vers l'API de production.
 * 4. Mise à jour des identifiants de prix dans la base de données PostgreSQL de production.
 * 5. Mise à jour des variables d'environnement sur Railway (fove-api) : STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_ALLOW_LIVE=true.
 */

import { execSync as runCommand } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const secretKey = process.argv[2] || process.env.STRIPE_SECRET_KEY;
  let webhookSecret = process.argv[3] || process.env.STRIPE_WEBHOOK_SECRET;

  if (!secretKey) {
    console.error(`
❌ Clé Stripe Live manquante.

Usage :
  node scripts/setup-stripe-live.mjs <sk_live_votre_cle_secrete> [whsec_optionnel]

Exemple :
  node scripts/setup-stripe-live.mjs sk_live_51...
`);
    process.exit(1);
  }

  if (!secretKey.startsWith("sk_live_") && !secretKey.startsWith("rk_live_")) {
    console.warn("⚠️ Attention : La clé fournie ne commence pas par 'sk_live_' ou 'rk_live_'.");
  }

  // Chargement dynamique de Stripe depuis apps/api
  const StripeModule = await import(resolve(root, "apps/api/node_modules/stripe/esm/index.js")).catch(
    async () => await import("stripe")
  );
  const Stripe = StripeModule.default || StripeModule;
  const stripe = new Stripe(secretKey);

  console.log("1️⃣ Connexion à Stripe...");
  const account = await stripe.accounts.retrieve();
  console.log(`✅ Connecté au compte Stripe : ${account.business_profile?.name || account.id} (${account.country || "Live"})`);

  console.log("\n2️⃣ Configuration des 3 offres et prix annuels en USD...");
  const PLANS_DEF = [
    {
      code: "starter",
      name: "FOVE Essentiel",
      description: "Pour les petits commerces, salons et indépendants.",
      amount: 9900, // $99.00 / an
    },
    {
      code: "business",
      name: "FOVE Business",
      description: "Pour les boutiques qui veulent développer leur clientèle.",
      amount: 19900, // $199.00 / an
    },
    {
      code: "premium",
      name: "FOVE Réseau",
      description: "Pour les enseignes qui gèrent plusieurs boutiques.",
      amount: 39900, // $399.00 / an
    },
  ];

  const livePrices = {};

  for (const p of PLANS_DEF) {
    // Vérifier si le produit existe déjà
    const existingProducts = await stripe.products.search({
      query: `name:'${p.name}' AND active:'true'`,
    }).catch(() => ({ data: [] }));

    let productId = existingProducts.data?.[0]?.id;

    if (!productId) {
      const prod = await stripe.products.create({
        name: p.name,
        description: p.description,
        metadata: { fove_plan_code: p.code },
      });
      productId = prod.id;
      console.log(`  ➕ Produit créé : ${p.name} (${productId})`);
    } else {
      console.log(`  ✓ Produit existant : ${p.name} (${productId})`);
    }

    // Vérifier ou créer le prix récurrent annuel
    const prices = await stripe.prices.list({
      product: productId,
      active: true,
      currency: "usd",
    });

    let price = prices.data.find(
      (pr) => pr.unit_amount === p.amount && pr.recurring?.interval === "year"
    );

    if (!price) {
      price = await stripe.prices.create({
        product: productId,
        unit_amount: p.amount,
        currency: "usd",
        recurring: { interval: "year" },
        metadata: { fove_plan_code: p.code },
      });
      console.log(`  ➕ Prix annuel créé : $${p.amount / 100}/an -> ${price.id}`);
    } else {
      console.log(`  ✓ Prix annuel existant : $${p.amount / 100}/an -> ${price.id}`);
    }

    livePrices[p.code] = price.id;
  }

  console.log("\n3️⃣ Configuration du webhook Stripe...");
  const webhookUrl = "https://fove-api-production.up.railway.app/api/billing/stripe/webhook";
  const requiredEvents = [
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "checkout.session.completed",
    "invoice.paid",
    "invoice.payment_failed",
  ];

  if (!webhookSecret) {
    // Lister les webhooks existants
    const endpoints = await stripe.webhookEndpoints.list({ limit: 10 });
    const existingEp = endpoints.data.find((e) => e.url === webhookUrl && e.status === "enabled");

    if (existingEp && existingEp.secret) {
      webhookSecret = existingEp.secret;
      console.log(`  ✓ Webhook existant trouvé : ${existingEp.id}`);
    } else {
      // Créer un nouvel endpoint webhook
      const newEp = await stripe.webhookEndpoints.create({
        url: webhookUrl,
        enabled_events: requiredEvents,
        description: "FOVE Production Webhook",
      });
      webhookSecret = newEp.secret;
      console.log(`  ➕ Nouveau Webhook créé : ${newEp.id}`);
      console.log(`  🔑 Signing Secret généré : ${webhookSecret}`);
    }
  } else {
    console.log(`  ✓ Webhook secret fourni : ${webhookSecret.slice(0, 10)}...`);
  }

  console.log("\n4️⃣ Mise à jour de la base de données Neon PostgreSQL de production...");
  const PgModule = await import(resolve(root, "packages/database/node_modules/pg/lib/index.js")).catch(
    async () => await import("pg")
  );
  const { Client } = PgModule.default || PgModule;
  const dbUrl =
    process.env.DATABASE_URL ||
    "postgresql://fove_owner:npg_vFwW2BqdE3PI@ep-nameless-fog-b1rehkjg.c-5.eu-central-1.aws.neon.tech/fove_digital?sslmode=require";

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  for (const [code, priceId] of Object.entries(livePrices)) {
    await client.query(
      `UPDATE "SubscriptionPlan" SET "stripePriceYearlyId" = $1 WHERE "code" = $2;`,
      [priceId, code]
    );
    console.log(`  ✓ Plan '${code}' mis à jour avec le prix Live : ${priceId}`);
  }
  await client.end();

  console.log("\n5️⃣ Mise à jour des variables d'environnement sur Railway...");
  try {
    const cmd = `railway variables --service fove-api --set "STRIPE_SECRET_KEY=${secretKey}" --set "STRIPE_WEBHOOK_SECRET=${webhookSecret}" --set "STRIPE_ALLOW_LIVE=true"`;
    runCommand(cmd, { stdio: "inherit" });
    console.log("✅ Variables Railway mises à jour avec succès !");
  } catch (err) {
    console.error("⚠️ Impossible de mettre à jour Railway via CLI. Vous pouvez poser les variables manuellement :");
    console.log(`  STRIPE_SECRET_KEY=${secretKey}`);
    console.log(`  STRIPE_WEBHOOK_SECRET=${webhookSecret}`);
    console.log(`  STRIPE_ALLOW_LIVE=true`);
  }

  console.log("\n🎉 Stripe Production est entièrement configuré et opérationnel !");
}

main().catch((err) => {
  console.error("❌ Erreur lors de la configuration Stripe :", err);
  process.exit(1);
});
