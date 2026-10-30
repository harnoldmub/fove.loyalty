import { pageMeta } from "@/lib/og";

export const metadata = pageMeta(
  "Documentation développeur — API REST Fidélité, SDK TypeScript & Webhooks",
  "Intégrez FOVE à votre boutique e-commerce ou logiciel de caisse : API REST v1 idempotente, SDK TypeScript @fove/sdk, webhooks signés HMAC-SHA256 et widget web.",
  "/developpeurs",
  ["API fidélité e-commerce", "SDK TypeScript fidélité", "webhook fidélité caisse", "widget fidélité site web"],
);

const endpoints = [
  ["GET", "/api/v1/customers", "Lister et rechercher les clients (pagination par curseur, filtre q)"],
  ["GET", "/api/v1/customers/lookup", "Trouver un client par externalId, email ou phone"],
  ["POST", "/api/v1/customers", "Créer un client"],
  ["GET", "/api/v1/programs", "Lister les programmes"],
  ["POST", "/api/v1/loyalty/accounts", "Créer la carte d’un client dans un programme"],
  ["GET", "/api/v1/loyalty/accounts/{id}", "Solde, historique récent, récompenses disponibles"],
  ["GET", "/api/v1/loyalty/transactions", "Historique des opérations"],
  ["POST", "/api/v1/loyalty/transactions", "Créditer un achat (points calculés par FOVE)"],
  ["POST", "/api/v1/loyalty/transactions/{id}/reverse", "Annuler une opération par écriture compensatoire"],
  ["GET", "/api/v1/rewards", "Catalogue de récompenses"],
  ["POST", "/api/v1/redemptions", "Utiliser une récompense"],
  ["POST", "/api/v1/integrations/commerce/orders/paid", "Commande payée : client rattaché, carte créée si besoin, points crédités"],
  ["POST", "/api/v1/integrations/commerce/orders/refunded", "Remboursement total ou partiel"],
];

function Code({ children, label }: { children: string; label: string }) {
  return (
    <pre aria-label={label} className="overflow-x-auto rounded-[var(--radius)] bg-[#14204a] p-4 text-[0.82rem] leading-relaxed text-[#dfe5ff]">
      <code>{children}</code>
    </pre>
  );
}

export default function DevelopersPage() {
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 pt-14 sm:px-6 lg:grid-cols-[13rem_1fr]">
      <nav aria-label="Sommaire" className="hidden lg:block">
        <ul className="sticky top-24 grid gap-2 text-sm text-ink-2">
          {[
            ["#auth", "Authentification"],
            ["#idempotence", "Idempotence"],
            ["#endpoints", "Endpoints"],
            ["#sdk", "SDK TypeScript"],
            ["#webhooks", "Webhooks"],
            ["#widget", "Widget"],
            ["#erreurs", "Erreurs et limites"],
          ].map(([href, label]) => (
            <li key={href}>
              <a className="hover:text-ink" href={href}>{label}</a>
            </li>
          ))}
        </ul>
      </nav>
      <article className="grid min-w-0 gap-12">
        <header>
          <h1 className="font-display text-4xl font-bold sm:text-5xl">Documentation développeur</h1>
          <p className="mt-3 max-w-2xl text-lg text-ink-2">
            L’API REST de FOVE relie une caisse, une boutique en ligne ou un back-office à vos programmes de fidélité. Référence complète et interactive : <a className="text-cobalt underline underline-offset-4" href="/api/docs">OpenAPI</a>.
          </p>
        </header>

        <section id="auth" className="grid gap-4">
          <h2 className="font-display text-2xl font-semibold">Authentification</h2>
          <p className="max-w-2xl text-ink-2">
            Créez une clé secrète dans <strong>Intégrations</strong>, avec seulement les droits nécessaires (scopes). Elle s’utilise côté serveur, jamais dans un navigateur. Les clés <code>fove_sk_test_</code> et <code>fove_sk_live_</code> sont séparées.
          </p>
          <Code label="Requête authentifiée">{`curl https://api.fove.digital/api/v1/programs \\
  -H "Authorization: Bearer fove_sk_live_…"`}</Code>
        </section>

        <section id="idempotence" className="grid gap-4">
          <h2 className="font-display text-2xl font-semibold">Idempotence</h2>
          <p className="max-w-2xl text-ink-2">
            Chaque <code>POST</code> exige un en-tête <code>Idempotency-Key</code> unique (8 à 120 caractères). Rejouer la même requête renvoie la réponse d’origine avec <code>Idempotent-Replayed: true</code> ; la même clé avec un autre corps est refusée (422). Les commandes e-commerce sont en plus dédupliquées par <code>externalOrderId</code>.
          </p>
          <Code label="Créditer un achat">{`curl -X POST https://api.fove.digital/api/v1/loyalty/transactions \\
  -H "Authorization: Bearer fove_sk_live_…" \\
  -H "Idempotency-Key: vente-2026-10-28-0042" \\
  -H "Content-Type: application/json" \\
  -d '{ "accountId": "…", "amount": "15000", "saleReference": "T-0042" }'`}</Code>
        </section>

        <section id="endpoints" className="grid gap-4">
          <h2 className="font-display text-2xl font-semibold">Endpoints</h2>
          <div className="overflow-x-auto rounded-[var(--radius)] bg-surface shadow-1">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-ink-3">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Méthode</th>
                  <th scope="col" className="px-4 py-3 font-medium">Chemin</th>
                  <th scope="col" className="px-4 py-3 font-medium">Usage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {endpoints.map(([m, p, d]) => (
                  <tr key={`${m}${p}`}>
                    <td className="px-4 py-2.5 font-medium">{m}</td>
                    <td className="px-4 py-2.5"><code className="break-all">{p}</code></td>
                    <td className="px-4 py-2.5 text-ink-2">{d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="sdk" className="grid gap-4">
          <h2 className="font-display text-2xl font-semibold">SDK TypeScript</h2>
          <p className="max-w-2xl text-ink-2">Le paquet <code>@fove/sdk</code> gère l’authentification, les clés d’idempotence et les nouvelles tentatives sur erreur réseau.</p>
          <Code label="Exemple SDK">{`import { FoveClient } from "@fove/sdk";

const fove = new FoveClient({ apiKey: process.env.FOVE_SECRET_KEY! });

// Dans le webhook de paiement de votre boutique
const result = await fove.orderPaid({
  programId: process.env.FOVE_PROGRAM_ID!,
  externalOrderId: order.id,
  orderNumber: order.orderNumber,
  customer: { externalId: user.id, email: user.email, firstName: user.firstName },
  amount: order.total.toString(),
  currency: order.currency,
  paidAt: order.paidAt.toISOString(),
});

// Remboursement
await fove.orderRefunded({ programId, externalOrderId: order.id, externalRefundId: refund.id, amount: "25.00" });`}</Code>
        </section>

        <section id="webhooks" className="grid gap-4">
          <h2 className="font-display text-2xl font-semibold">Webhooks</h2>
          <p className="max-w-2xl text-ink-2">
            Événements : <code>customer.created</code>, <code>loyalty_account.created</code>, <code>loyalty_transaction.created</code>, <code>redemption.created</code>, <code>redemption.cancelled</code>. Chaque envoi est signé (en-tête <code>fove-signature</code>, HMAC-SHA256) et réessayé jusqu’à 8 fois en cas d’échec. Les livraisons sont visibles dans Intégrations.
          </p>
          <Code label="Vérifier une signature">{`import { verifyWebhookSignature } from "@fove/sdk";

const ok = verifyWebhookSignature(rawBody, req.headers["fove-signature"], process.env.FOVE_WEBHOOK_SECRET!);
if (!ok) return res.status(400).end();`}</Code>
        </section>

        <section id="widget" className="grid gap-4">
          <h2 className="font-display text-2xl font-semibold">Widget</h2>
          <p className="max-w-2xl text-ink-2">
            Un script indépendant de tout framework. Il utilise une clé publique (<code>fove_pk_</code>) limitée aux domaines que vous déclarez : elle lit la configuration publique et ne peut jamais créditer de points. Collez-le avant <code>&lt;/body&gt;</code> (WordPress, Astro, Next.js, Symfony ou HTML).
          </p>
          <Code label="Intégration du widget">{`<script src="https://app.fove.digital/widget/fove-widget.js"
        data-key="fove_pk_live_…"
        data-position="right" defer></script>`}</Code>
        </section>

        <section id="erreurs" className="grid gap-4">
          <h2 className="font-display text-2xl font-semibold">Erreurs et limites</h2>
          <p className="max-w-2xl text-ink-2">
            Les erreurs ont la forme <code>{`{ "error": { "code", "message", "details" } }`}</code>. Codes fréquents : <code>insufficient_balance</code>, <code>account_inactive</code>, <code>customer_exists</code>, <code>quota_exceeded</code> (402), <code>rate_limited</code> (429). Limite par défaut : 300 requêtes par minute et par clé.
          </p>
        </section>
      </article>
    </div>
  );
}
