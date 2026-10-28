import { Pricing } from "@/components/marketing/pricing";
import { pageMeta } from "@/lib/og";

export const metadata = pageMeta("Tarifs", "Trois offres FOVE, essai gratuit, sans commission sur vos ventes.", "/tarifs");

const faq = [
  { q: "Que se passe-t-il à la fin de l’essai ?", a: "Rien n’est supprimé. Si vous ne choisissez pas d’offre, votre compte passe sur les limites Starter : vos clients gardent leurs cartes et leurs points." },
  { q: "Puis-je changer d’offre ?", a: "Oui, à tout moment depuis l’espace Abonnement. Le changement est calculé au prorata. Un passage à une offre inférieure n’efface aucune carte : seules les nouvelles créations au-delà des limites sont bloquées." },
  { q: "Mes clients paient-ils quelque chose ?", a: "Non. La carte est gratuite pour eux et s’ouvre dans le navigateur du téléphone." },
  { q: "Comment payer ?", a: "Par carte bancaire, mensuellement ou annuellement. Les factures sont disponibles dans votre espace." },
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-14 sm:px-6">
      <h1 className="font-display text-4xl font-bold sm:text-5xl">Tarifs</h1>
      <p className="mt-3 max-w-xl text-lg text-ink-2">Un abonnement fixe par entreprise. Aucune commission sur vos ventes, aucun frais pour vos clients.</p>
      <div className="mt-10">
        <Pricing />
      </div>
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
