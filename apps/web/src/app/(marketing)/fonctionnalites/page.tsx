import Link from "next/link";
import { Button } from "@/components/ui/button";
import { pageMeta } from "@/lib/og";

export const metadata = pageMeta("Fonctionnalités", "Programme de points ou de tampons, cartes numériques, scanner, récompenses, équipe et statistiques.", "/fonctionnalites");

const groups = [
  {
    title: "Votre programme",
    items: [
      ["Points ou tampons", "Choisissez le ratio (ex. 1 000 CDF = 1 point) ou le nombre de tampons pour une récompense."],
      ["Règles", "Montant minimum, plafond par achat, expiration après une période sans visite."],
      ["Récompenses", "Catalogue, coût, stock, dates de disponibilité. Activez ou retirez une récompense sans perdre son historique."],
    ],
  },
  {
    title: "Vos clients",
    items: [
      ["Inscription par QR code", "Un QR public à vos couleurs, par établissement. Le client crée sa carte depuis son téléphone."],
      ["Carte numérique", "Logo, nom, numéro, QR personnel, solde, progression et récompenses disponibles. Ajoutable à l’écran d’accueil."],
      ["Fichier clients", "Recherche, création, import, historique complet. Pas de doublon sur un même téléphone ou email."],
    ],
  },
  {
    title: "Votre équipe",
    items: [
      ["Rôles", "Propriétaire, manager, caissier, lecteur. Chaque droit est vérifié par le serveur."],
      ["Établissements", "Un caissier peut être limité à une boutique."],
      ["Traçabilité", "Chaque opération garde l’employé, l’établissement, l’heure et la référence de vente. Une erreur se corrige par une annulation, jamais en effaçant."],
    ],
  },
  {
    title: "Vos outils",
    items: [
      ["Statistiques", "Membres, nouveaux membres, clients qui reviennent, points distribués et utilisés, activité par jour."],
      ["Boutique en ligne", "API, SDK et connecteur e-commerce : une commande payée crédite la carte, un remboursement la débite."],
      ["Widget", "Un bouton fidélité sur votre site, compatible WordPress, Astro, React, Next.js, Symfony ou HTML."],
    ],
  },
];

export default function FeaturesPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-14 sm:px-6">
      <h1 className="font-display text-4xl font-bold sm:text-5xl">Fonctionnalités</h1>
      <p className="mt-3 max-w-xl text-lg text-ink-2">Tout ce qu’il faut pour qu’un client revienne, et rien que vous ayez à configurer avec un technicien.</p>
      <div className="mt-14 grid gap-16">
        {groups.map((g) => (
          <section key={g.title} aria-labelledby={g.title} className="grid gap-6 md:grid-cols-[14rem_1fr]">
            <h2 id={g.title} className="font-display text-2xl font-semibold">{g.title}</h2>
            <dl className="grid gap-6 sm:grid-cols-3">
              {g.items.map(([t, d]) => (
                <div key={t} className="grid content-start gap-1.5 border-t border-line pt-4">
                  <dt className="font-medium">{t}</dt>
                  <dd className="text-ink-2">{d}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <div className="mt-20 flex flex-wrap items-center gap-4 rounded-[var(--radius-lg)] bg-cobalt px-6 py-8 text-cobalt-ink sm:px-10">
        <p className="mr-auto max-w-lg font-display text-2xl font-semibold">Votre QR code peut être au comptoir dès aujourd’hui.</p>
        <Button asChild variant="stamp" size="lg">
          <Link href="/signup">Commencer l’essai</Link>
        </Button>
      </div>
    </div>
  );
}
