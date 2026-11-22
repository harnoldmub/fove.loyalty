import { getTranslations } from "next-intl/server";
import { localizedPageMeta } from "@/lib/og";

export async function generateMetadata() {
  return localizedPageMeta("developers", "/developpeurs");
}

const endpoints = [
  ["GET", "/api/v1/customers", "customersList"],
  ["GET", "/api/v1/customers/lookup", "customersLookup"],
  ["POST", "/api/v1/customers", "customersCreate"],
  ["GET", "/api/v1/programs", "programsList"],
  ["POST", "/api/v1/loyalty/accounts", "accountsCreate"],
  ["GET", "/api/v1/loyalty/accounts/{id}", "accountsGet"],
  ["GET", "/api/v1/loyalty/transactions", "transactionsList"],
  ["POST", "/api/v1/loyalty/transactions", "transactionsCreate"],
  ["POST", "/api/v1/loyalty/transactions/{id}/reverse", "transactionsReverse"],
  ["GET", "/api/v1/rewards", "rewardsList"],
  ["POST", "/api/v1/redemptions", "redemptionsCreate"],
  ["POST", "/api/v1/integrations/commerce/orders/paid", "ordersPaid"],
  ["POST", "/api/v1/integrations/commerce/orders/refunded", "ordersRefunded"],
] as const;

function Code({ children, label }: { children: string; label: string }) {
  return (
    <pre aria-label={label} dir="ltr" className="overflow-x-auto rounded-[var(--radius)] bg-[#14204a] p-4 text-[0.82rem] leading-relaxed text-[#dfe5ff]">
      <code>{children}</code>
    </pre>
  );
}

/** Balise de texte riche remplacée par un littéral de code (identique dans toutes les langues). */
function literal(text: string) {
  return function CodeLiteral() {
    return <code>{text}</code>;
  };
}

export default async function DevelopersPage() {
  const t = await getTranslations("marketing.developers");
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 pt-14 sm:px-6 lg:grid-cols-[13rem_1fr]">
      <nav aria-label={t("toc")} className="hidden lg:block">
        <ul className="sticky top-24 grid gap-2 text-sm text-ink-2">
          {(["auth", "idempotence", "endpoints", "sdk", "webhooks", "widget", "errors"] as const).map((key) => (
            <li key={key}>
              <a className="hover:text-ink" href={`#${key === "errors" ? "erreurs" : key}`}>{t(`nav.${key}`)}</a>
            </li>
          ))}
        </ul>
      </nav>
      <article className="grid min-w-0 gap-12">
        <header>
          <h1 className="font-display text-4xl font-bold sm:text-5xl">{t("title")}</h1>
          <p className="mt-3 max-w-2xl text-lg text-ink-2">
            {t.rich("intro", {
              // /api/docs est servi par l'API (réécriture Next) : un vrai chargement de page, pas une route du routeur.
              // eslint-disable-next-line @next/next/no-html-link-for-pages
              link: (chunks) => <a className="text-cobalt underline underline-offset-4" href="/api/docs">{chunks}</a>,
            })}
          </p>
        </header>

        <section id="auth" className="grid gap-4">
          <h2 className="font-display text-2xl font-semibold">{t("nav.auth")}</h2>
          <p className="max-w-2xl text-ink-2">
            {t.rich("auth.text", {
              strong: (chunks) => <strong>{chunks}</strong>,
              test: literal("fove_sk_test_"),
              live: literal("fove_sk_live_"),
            })}
          </p>
          <Code label={t("auth.codeLabel")}>{`curl https://api.fove.digital/api/v1/programs \\
  -H "Authorization: Bearer fove_sk_live_…"`}</Code>
        </section>

        <section id="idempotence" className="grid gap-4">
          <h2 className="font-display text-2xl font-semibold">{t("nav.idempotence")}</h2>
          <p className="max-w-2xl text-ink-2">
            {t.rich("idempotence.text", {
              post: literal("POST"),
              header: literal("Idempotency-Key"),
              replayed: literal("Idempotent-Replayed: true"),
              orderId: literal("externalOrderId"),
            })}
          </p>
          <Code label={t("idempotence.codeLabel")}>{`curl -X POST https://api.fove.digital/api/v1/loyalty/transactions \\
  -H "Authorization: Bearer fove_sk_live_…" \\
  -H "Idempotency-Key: ${t("idempotence.sampleKey")}" \\
  -H "Content-Type: application/json" \\
  -d '{ "accountId": "…", "amount": "15000", "saleReference": "T-0042" }'`}</Code>
        </section>

        <section id="endpoints" className="grid gap-4">
          <h2 className="font-display text-2xl font-semibold">{t("nav.endpoints")}</h2>
          <div className="overflow-x-auto rounded-[var(--radius)] bg-surface shadow-1">
            <table className="w-full min-w-[640px] text-start text-sm">
              <thead className="text-ink-3">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">{t("endpoints.method")}</th>
                  <th scope="col" className="px-4 py-3 font-medium">{t("endpoints.path")}</th>
                  <th scope="col" className="px-4 py-3 font-medium">{t("endpoints.usage")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {endpoints.map(([m, p, d]) => (
                  <tr key={`${m}${p}`}>
                    <td className="px-4 py-2.5 font-medium">{m}</td>
                    <td className="px-4 py-2.5" dir="ltr"><code className="break-all">{p}</code></td>
                    <td className="px-4 py-2.5 text-ink-2">{t(`endpoints.items.${d}`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="sdk" className="grid gap-4">
          <h2 className="font-display text-2xl font-semibold">{t("nav.sdk")}</h2>
          <p className="max-w-2xl text-ink-2">{t.rich("sdk.text", { pkg: literal("@fove/sdk") })}</p>
          <Code label={t("sdk.codeLabel")}>{`import { FoveClient } from "@fove/sdk";

const fove = new FoveClient({ apiKey: process.env.FOVE_SECRET_KEY! });

// ${t("sdk.commentPaid")}
const result = await fove.orderPaid({
  programId: process.env.FOVE_PROGRAM_ID!,
  externalOrderId: order.id,
  orderNumber: order.orderNumber,
  customer: { externalId: user.id, email: user.email, firstName: user.firstName },
  amount: order.total.toString(),
  currency: order.currency,
  paidAt: order.paidAt.toISOString(),
});

// ${t("sdk.commentRefund")}
await fove.orderRefunded({ programId, externalOrderId: order.id, externalRefundId: refund.id, amount: "25.00" });`}</Code>
        </section>

        <section id="webhooks" className="grid gap-4">
          <h2 className="font-display text-2xl font-semibold">{t("nav.webhooks")}</h2>
          <p className="max-w-2xl text-ink-2">
            {t.rich("webhooks.text", {
              events: () => (
                <>
                  <code>customer.created</code>, <code>loyalty_account.created</code>, <code>loyalty_transaction.created</code>, <code>redemption.created</code>, <code>redemption.cancelled</code>
                </>
              ),
              signature: literal("fove-signature"),
            })}
          </p>
          <Code label={t("webhooks.codeLabel")}>{`import { verifyWebhookSignature } from "@fove/sdk";

const ok = verifyWebhookSignature(rawBody, req.headers["fove-signature"], process.env.FOVE_WEBHOOK_SECRET!);
if (!ok) return res.status(400).end();`}</Code>
        </section>

        <section id="widget" className="grid gap-4">
          <h2 className="font-display text-2xl font-semibold">{t("nav.widget")}</h2>
          <p className="max-w-2xl text-ink-2">
            {t.rich("widget.text", { key: literal("fove_pk_"), body: literal("</body>") })}
          </p>
          <Code label={t("widget.codeLabel")}>{`<script src="https://fove.digital/widget/fove-widget.js"
        data-key="fove_pk_live_…"
        data-position="right" defer></script>`}</Code>
        </section>

        <section id="erreurs" className="grid gap-4">
          <h2 className="font-display text-2xl font-semibold">{t("nav.errors")}</h2>
          <p className="max-w-2xl text-ink-2">
            {t.rich("errors.text", {
              shape: literal(`{ "error": { "code", "message", "details" } }`),
              codes: () => (
                <>
                  <code>insufficient_balance</code>, <code>account_inactive</code>, <code>customer_exists</code>, <code>quota_exceeded</code> (402), <code>rate_limited</code> (429)
                </>
              ),
            })}
          </p>
        </section>
      </article>
    </div>
  );
}
