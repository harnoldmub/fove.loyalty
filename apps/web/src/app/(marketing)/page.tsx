import Link from "next/link";
import { BarChart3, Gift, QrCode, ScanLine, Store, Users } from "lucide-react";
import { StampDemo } from "@/components/marketing/stamp-demo";
import { Pricing } from "@/components/marketing/pricing";
import { Button } from "@/components/ui/button";
import { pageMeta } from "@/lib/og";

export const metadata = pageMeta(
  "FOVE — Transformez vos clients en habitués",
  "Cartes de fidélité numériques, QR codes et points pour les commerçants. Sans application à installer.",
  "/",
);

const steps = [
  {
    icon: QrCode,
    title: "Affichez votre QR code au comptoir",
    text: "FOVE le génère à vos couleurs. Imprimez-le, collez-le près de la caisse ou sur la vitrine.",
  },
  {
    icon: Users,
    title: "Le client crée sa carte en trente secondes",
    text: "Il scanne, donne son prénom et son téléphone. Sa carte s’ouvre dans le navigateur, rien à installer.",
  },
  {
    icon: ScanLine,
    title: "Vous scannez sa carte à chaque achat",
    text: "Depuis le téléphone de la caisse. Les points ou tampons s’ajoutent, la récompense se débloque toute seule.",
  },
];

const counter = [
  { icon: Gift, title: "Points ou tampons", text: "1 000 CDF dépensés = 1 point, ou un café offert au dixième. Vous fixez les règles, les plafonds et les récompenses." },
  { icon: Store, title: "Plusieurs points de vente", text: "Chaque établissement a son QR et son équipe. Un caissier ne voit que sa boutique." },
  { icon: BarChart3, title: "Des chiffres qui viennent de vos ventes", text: "Membres, clients qui reviennent, points distribués et récompenses utilisées, calculés sur votre historique réel." },
];

export default function HomePage() {
  return (
    <>
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-12 sm:px-6 md:grid-cols-[1.1fr_1fr] md:pt-20 lg:gap-16">
        <div>
          <h1 className="font-display text-[2.6rem] font-bold leading-[1.02] sm:text-6xl lg:text-[4.4rem]">Transformez vos clients en habitués.</h1>
          <p className="mt-6 max-w-[34rem] text-lg text-ink-2">
            Une carte de fidélité sur le téléphone de vos clients, un QR code sur votre comptoir. Ils scannent, achètent, reviennent. Sans application à installer.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/signup">Créer mon programme</Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link href="/tarifs">Voir les tarifs</Link>
            </Button>
          </div>
          <p className="mt-4 text-sm text-ink-3">Essai gratuit, sans carte bancaire. Configuration seul, en quelques minutes.</p>
        </div>
        <StampDemo />
      </section>

      <section aria-labelledby="etapes" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 id="etapes" className="max-w-xl font-display text-3xl font-semibold sm:text-4xl">Trois gestes, du comptoir à la récompense</h2>
        <ol className="mt-10 grid gap-8 md:grid-cols-3 md:gap-6">
          {steps.map((s, i) => (
            <li key={s.title} className="relative grid content-start gap-3 border-t-2 border-ink pt-5">
              <span className="font-display text-sm font-semibold text-cobalt">Étape {i + 1}</span>
              <s.icon className="size-6 text-ink" aria-hidden />
              <h3 className="font-display text-xl font-semibold">{s.title}</h3>
              <p className="text-ink-2">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="comptoir" className="bg-surface py-20">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 md:grid-cols-[1fr_1.3fr]">
          <div>
            <h2 id="comptoir" className="font-display text-3xl font-semibold sm:text-4xl">Pensé pour la caisse, pas pour le bureau</h2>
            <p className="mt-4 max-w-md text-ink-2">
              Le scanner tient dans un téléphone. Montant saisi, points calculés par FOVE, confirmation en un geste. Chaque opération garde le nom du caissier, l’établissement et l’heure.
            </p>
            <Button asChild variant="link" className="mt-4">
              <Link href="/fonctionnalites">Toutes les fonctionnalités</Link>
            </Button>
          </div>
          <dl className="grid gap-8">
            {counter.map((c) => (
              <div key={c.title} className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <dt className="contents">
                  <span className="grid size-11 place-items-center rounded-md bg-cobalt-soft text-cobalt">
                    <c.icon className="size-5" aria-hidden />
                  </span>
                  <span className="self-center font-display text-lg font-semibold">{c.title}</span>
                </dt>
                <dd className="col-start-2 text-ink-2">{c.text}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section aria-labelledby="enligne" className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 sm:px-6 md:grid-cols-2">
        <div>
          <h2 id="enligne" className="font-display text-3xl font-semibold sm:text-4xl">Votre boutique en ligne compte aussi</h2>
          <p className="mt-4 max-w-md text-ink-2">
            Une commande payée sur votre site crédite la même carte qu’un achat en magasin. Un remboursement retire les points correspondants. Un widget ajoute le bouton fidélité à votre site, quel qu’il soit.
          </p>
          <Button asChild variant="secondary" className="mt-6">
            <Link href="/developpeurs">Lire la documentation</Link>
          </Button>
        </div>
        <pre className="overflow-x-auto rounded-[var(--radius-lg)] bg-[#14204a] p-5 text-[0.82rem] leading-relaxed text-[#dfe5ff] shadow-2" aria-label="Exemple de code">
          <code>{`await fove.orderPaid({
  programId,
  externalOrderId: order.id,
  customer: { externalId: user.id, email: user.email },
  amount: "125.90",
  currency: "EUR",
  paidAt: order.paidAt,
});
// Renvoyer la même commande ne crédite jamais deux fois.`}</code>
        </pre>
      </section>

      <section aria-labelledby="tarifs" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 id="tarifs" className="font-display text-3xl font-semibold sm:text-4xl">Un prix fixe, sans commission sur vos ventes</h2>
        <p className="mt-3 max-w-xl text-ink-2">Changez d’offre quand vous voulez : vos cartes, vos clients et leur historique restent intacts.</p>
        <div className="mt-10">
          <Pricing />
        </div>
      </section>
    </>
  );
}
