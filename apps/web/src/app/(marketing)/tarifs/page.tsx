import { Pricing } from "@/components/marketing/pricing";
import { pageMeta } from "@/lib/og";

export const metadata = pageMeta(
  "Tarifs — Abonnements programme de fidélité commerçant",
  "Commencez gratuitement jusqu’à 100 clients, puis passez à Essentiel, Business ou Réseau, ou à une offre sur-mesure. Zéro commission sur vos ventes.",
  "/tarifs",
  ["tarif carte de fidélité numérique", "prix logiciel fidélité commerçant", "abonnement fidélisation boutique"],
);

const faq = [
  { q: "L’offre Gratuite est-elle limitée dans le temps ?", a: "Non. Elle reste gratuite tant que vous restez dans ses limites : 100 clients, 1 établissement, 1 programme, sans collaborateur. Au-delà, vos clients actuels gardent leurs cartes ; seules les nouvelles inscriptions attendent un passage à une offre supérieure." },
  { q: "Puis-je changer d’offre ?", a: "Oui, à tout moment depuis l’espace Abonnement. Une offre supérieure s’applique tout de suite : la différence au prorata est facturée immédiatement. Un passage à une offre inférieure n’efface aucune carte : seules les nouvelles créations au-delà des limites sont bloquées." },
  { q: "Et si je résilie ?", a: "Votre offre reste active jusqu’à la fin de la période payée, et vous pouvez revenir sur votre décision jusque-là. Ensuite, votre compte passe sur l’offre Gratuite : rien n’est supprimé." },
  { q: "Mon besoin dépasse l’offre Réseau ?", a: "L’offre Sur-mesure s’adapte à vos volumes : nombre de clients, d’établissements et de collaborateurs, accompagnement et contrat sur devis. Contactez-nous." },
  { q: "Mes clients paient-ils quelque chose ?", a: "Non. La carte est gratuite pour eux et s’ouvre dans le navigateur du téléphone." },
  { q: "Comment payer ?", a: "En dollars US, une fois par an et à l’avance. Les factures sont disponibles dans votre espace." },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faq.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.a,
    },
  })),
};

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-14 sm:px-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <h1 className="font-display text-4xl font-bold sm:text-5xl">Tarifs</h1>
      <p className="mt-3 max-w-xl text-lg text-ink-2">Un prix annuel selon vos points de vente et le nombre de clients inclus. Aucune commission sur vos ventes, aucun frais pour vos clients.</p>
      <div className="mt-10">
        <Pricing />
      </div>
      <p className="mt-6 text-ink-2">Installation et formation offertes : configuration de la fidélité, personnalisation de la carte et affiche QR prête à imprimer.</p>
      <p className="mt-3 text-sm text-ink-3">L’envoi WhatsApp automatique couvre le partage de la carte et « Retrouver ma carte ». Les campagnes SMS et WhatsApp ne sont pas comprises dans l’abonnement ; les crédits prépayés seront proposés séparément.</p>
      <section aria-labelledby="faq" className="mt-20 max-w-3xl">
        <h2 id="faq" className="font-display text-2xl font-semibold">Questions fréquentes</h2>
        <div className="mt-6 divide-y divide-line">
          {faq.map((f) => (
            <details key={f.q} className="group py-4">
              <summary className="cursor-pointer list-none font-medium marker:hidden">
                <span className="flex items-center justify-between gap-4">
                  {f.q}
                  <span className="text-ink-3 transition-transform group-open:rotate-45" aria-hidden>+</span>
                </span>
              </summary>
              <p className="mt-2 text-ink-2">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
