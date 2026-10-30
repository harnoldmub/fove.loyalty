import { Pricing } from "@/components/marketing/pricing";
import { pageMeta } from "@/lib/og";

export const metadata = pageMeta(
  "Tarifs — Abonnements programme de fidélité commerçant",
  "Trois offres FOVE claires (Essentiel, Croissance, Réseau) avec essai gratuit, installation offerte et zéro commission sur vos ventes.",
  "/tarifs",
  ["tarif carte de fidélité numérique", "prix logiciel fidélité commerçant", "abonnement fidélisation boutique"],
);

const faq = [
  { q: "Que se passe-t-il à la fin de l’essai ?", a: "Rien n’est supprimé. Si vous ne choisissez pas d’offre, votre compte passe sur les limites Essentiel : vos clients gardent leurs cartes et leurs points." },
  { q: "Puis-je changer d’offre ?", a: "Oui, à tout moment depuis l’espace Abonnement. Le changement est calculé au prorata. Un passage à une offre inférieure n’efface aucune carte : seules les nouvelles créations au-delà des limites sont bloquées." },
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
      <p className="mt-3 text-sm text-ink-3">Les SMS et WhatsApp ne sont pas compris dans l’abonnement. Les envois automatisés et crédits prépayés seront proposés séparément.</p>
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
