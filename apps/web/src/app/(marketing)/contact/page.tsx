import Link from "next/link";
import { Building2, Clock, MessageSquare, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pageMeta } from "@/lib/og";
import { ContactForm } from "./contact-form";

export const metadata = pageMeta(
  "Contact & Démonstration",
  "Demandez une démonstration personnalisée de FOVE, un accompagnement au déploiement en magasin ou un devis multi-établissements.",
  "/contact",
  ["contact FOVE", "démo programme de fidélité", "accompagnement fidélisation retail", "devis fidélité multi-boutiques"],
);

const highlights = [
  {
    icon: Clock,
    title: "Mise en route en 15 minutes",
    text: "Création de votre programme à points ou à tampons, personnalisation aux couleurs de votre enseigne et génération de votre affiche QR comptoir.",
  },
  {
    icon: Building2,
    title: "Commerces indépendants & réseaux",
    text: "Adapté aux boutiques, restaurants, salons, pharmacies, supermarchés et réseaux multi-points de vente en RDC et à l’international.",
  },
  {
    icon: ShieldCheck,
    title: "Accompagnement & formation inclus",
    text: "Formation de vos caissiers au scanner mobile et prise en main des relances clients WhatsApp et du tableau de bord RFM.",
  },
];

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-14 sm:px-6">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.25fr] lg:items-start">
        <div className="grid content-start gap-8">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-cobalt-soft px-3 py-1 text-xs font-semibold text-cobalt">
              <MessageSquare className="size-3.5" aria-hidden /> Parlons de votre commerce
            </span>
            <h1 className="mt-4 font-display text-4xl font-bold sm:text-5xl">
              Lançons votre programme de fidélité.
            </h1>
            <p className="mt-4 text-lg text-ink-2">
              Vous souhaitez une démonstration en direct, un déploiement sur plusieurs points de vente ou un règlement annuel sur facture ? Notre équipe vous accompagne de A à Z.
            </p>
          </div>

          <dl className="grid gap-6">
            {highlights.map((h) => (
              <div key={h.title} className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <dt className="contents">
                  <span className="grid size-10 place-items-center rounded-md bg-surface text-cobalt shadow-1">
                    <h.icon className="size-5" aria-hidden />
                  </span>
                  <span className="self-center font-display text-lg font-semibold">{h.title}</span>
                </dt>
                <dd className="col-start-2 text-sm text-ink-2 leading-relaxed">{h.text}</dd>
              </div>
            ))}
          </dl>

          <div className="rounded-[var(--radius-lg)] border border-line bg-surface p-5">
            <h2 className="font-display text-lg font-semibold">Vous préférez tester immédiatement ?</h2>
            <p className="mt-1 text-sm text-ink-2">
              Créez votre compte en autonomie en 2 minutes. Essai gratuit sans carte bancaire.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button asChild size="sm">
                <Link href="/signup">Démarrer l’essai gratuit</Link>
              </Button>
              <Button asChild variant="secondary" size="sm">
                <Link href="/tarifs">Consulter les offres</Link>
              </Button>
            </div>
          </div>
        </div>

        <ContactForm />
      </div>
    </div>
  );
}

