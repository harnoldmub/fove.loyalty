import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Check,
  ChevronRight,
  CreditCard,
  Gift,
  HelpCircle,
  QrCode,
  ShieldCheck,
  Smartphone,
  TrendingUp,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PartnerCommissions } from "@/components/marketing/partner-commissions";

export const metadata: Metadata = {
  title: "Devenez partenaire commercial FOVE · Programme Partenaires",
  description:
    "Recommandez la solution de cartes de fidélité dématérialisées FOVE aux commerçants et percevez des commissions attractives sur chaque abonnement.",
};

const STEPS = [
  {
    num: "01",
    title: "Vous postulez",
    desc: "Remplissez le formulaire en 2 minutes en indiquant votre profil, votre ville et vos canaux de recommandation.",
  },
  {
    num: "02",
    title: "Validation FOVE",
    desc: "Notre équipe examine votre candidature sous 24 à 48 heures et active votre statut partenaire.",
  },
  {
    num: "03",
    title: "Votre lien personnel",
    desc: "Vous recevez votre code unique, votre lien de recommandation, vos QR codes et vos ressources marketing.",
  },
  {
    num: "04",
    title: "Gagnez des commissions",
    desc: "Chaque commerce qui souscrit un abonnement payant via votre lien génère 20% de commission nette.",
  },
];

const PROFILES = [
  {
    title: "Agences digitales & Médias",
    desc: "Enrichissez votre offre d'accompagnement digital pour les enseignes locales et commerces de proximité.",
  },
  {
    title: "Développeurs & Intégrateurs",
    desc: "Connectez FOVE aux caisses enregistreuses et sites e-commerce de vos clients professionnels.",
  },
  {
    title: "Commerciaux indépendants",
    desc: "Commercialisez une solution SaaS moderne, prête à l'emploi et très simple à démontrer sur smartphone.",
  },
  {
    title: "Consultants & Coachs Retail",
    desc: "Aidez les commerçants à moderniser leur relation client et booster leur rétention grâce au mobile.",
  },
  {
    title: "Entrepreneurs & Apporteurs",
    desc: "Monétisez votre réseau de commerçants, restaurateurs et boutiques avec des revenus prévisibles.",
  },
  {
    title: "Réseaux de commerçants",
    desc: "Proposez un outil moderne à vos adhérents pour dynamiser la fréquentation commerciale de votre ville.",
  },
];

const FAQS = [
  {
    q: "Qui peut devenir partenaire commercial FOVE ?",
    a: "Le programme s'adresse à toute personne ou entité disposant d'un réseau professionnel auprès de commerçants : agences, freelances, développeurs, consultants retail, associations de commerçants ou apporteurs d'affaires.",
  },
  {
    q: "Comment fonctionne l'attribution des ventes ?",
    a: "Chaque partenaire dispose d'un lien personnalisé (ex: https://fove.digital/p/VOTRECODE). Lorsqu'un commerçant clique sur votre lien, un cookie first-party de 30 jours est déposé. S'il s'inscrit durant cette fenêtre, son entreprise vous est rattachée définitivement en base de données.",
  },
  {
    q: "Sur quel montant la commission est-elle calculée ?",
    a: "La commission est de 20% calculée sur le montant réellement encaissé par FOVE (hors taxes et déduction faite d'éventuels coupons promotionnels). Elle s'applique dès la souscription du premier abonnement payant.",
  },
  {
    q: "Quand et comment puis-je retirer mes gains ?",
    a: "Dès que votre solde de commissions disponibles atteint le seuil minimum de 50 $ ou 50 € (selon votre devise), vous pouvez déclencher une demande de virement directement depuis votre espace partenaire. Nous réglons par virement bancaire ou Mobile Money (Airtel Money, Orange Money, M-Pesa selon disponibilité géographique).",
  },
  {
    q: "Y a-t-il des frais ou des engagements ?",
    a: "Non, l'adhésion au programme partenaires FOVE est 100% gratuite, sans aucun droit d'entrée ni quota obligatoire.",
  },
  {
    q: "Puis-je être à la fois commerçant FOVE et partenaire ?",
    a: "Absolument. Votre compte utilisateur FOVE unique vous donne accès à votre espace commerçant (/app) et à votre espace partenaire (/partner) en toute simplicité.",
  },
];

export default function PartenairesPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
      {/* HERO SECTION */}
      <section className="text-center max-w-3xl mx-auto mb-20 sm:mb-28">
        <div className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-ink-2 shadow-xs mb-6">
          <span className="size-2 rounded-full bg-[#C7FF3D]" />
          Programme Partenaires Officiel FOVE
        </div>

        <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-ink mb-6">
          Devenez partenaire FOVE.
        </h1>

        <p className="text-lg sm:text-xl text-ink-2 leading-relaxed mb-10">
          Recommandez FOVE aux commerçants, développez votre réseau et gagnez des commissions sur les abonnements que vous
          apportez.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button asChild size="lg" className="w-full sm:w-auto font-semibold shadow-md">
            <Link href="/partenaires/rejoindre">
              Devenir partenaire
              <ArrowRight className="size-4 ml-1.5" />
            </Link>
          </Button>

          <Button asChild variant="secondary" size="lg" className="w-full sm:w-auto">
            <a href="#comment-ca-marche">Comment ça marche ?</a>
          </Button>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-ink-3">
          <span className="flex items-center gap-1.5">
            <Check className="size-4 text-emerald-500" /> Inscription 100% gratuite
          </span>
          <span className="flex items-center gap-1.5">
            <Check className="size-4 text-emerald-500" /> 20% de commission nette
          </span>
          <span className="flex items-center gap-1.5">
            <Check className="size-4 text-emerald-500" /> Paiement Virement & Mobile Money
          </span>
        </div>
      </section>

      {/* SECTION : COMMENT ÇA MARCHE */}
      <section id="comment-ca-marche" className="mb-24 scroll-mt-20">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-ink mb-3">
            Comment fonctionne le programme ?
          </h2>
          <p className="text-sm text-ink-2">Un parcours transparent et fluide, de votre candidature à vos premiers versements.</p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => (
            <div
              key={step.num}
              className="relative rounded-2xl border border-line bg-surface p-6 shadow-xs flex flex-col justify-between"
            >
              <div>
                <span className="font-mono text-3xl font-black text-[#C7FF3D] mb-4 block">
                  {step.num}
                </span>
                <h3 className="font-display text-lg font-semibold text-ink mb-2">
                  {step.title}
                </h3>
                <p className="text-xs text-ink-2 leading-relaxed">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION : PROFILS CIBLÉS */}
      <section className="mb-24">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-ink mb-3">
            À qui s&apos;adresse le partenariat ?
          </h2>
          <p className="text-sm text-ink-2">
            Des professionnels qui accompagnent au quotidien le commerce de détail et les services de proximité.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {PROFILES.map((p) => (
            <div
              key={p.title}
              className="rounded-xl border border-line bg-surface p-5 hover:border-cobalt/40 transition-colors shadow-xs"
            >
              <h3 className="font-display text-base font-semibold text-ink mb-2 flex items-center gap-2">
                <span className="size-2 rounded-full bg-[#C7FF3D]" />
                {p.title}
              </h3>
              <p className="text-xs text-ink-2 leading-relaxed">{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION : GRILLE DES COMMISSIONS */}
      <PartnerCommissions />

      {/* SECTION : AVANTAGES DU PARTENAIRE */}
      <section className="mb-24 rounded-2xl border border-line bg-surface p-8 sm:p-12 shadow-xs">
        <div className="max-w-2xl mb-8">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-ink mb-3">
            Des outils conçus pour vous faire réussir
          </h2>
          <p className="text-sm text-ink-2">
            Nous mettons à votre disposition une plateforme complète pour recommander FOVE sans friction.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <span className="grid size-10 place-items-center rounded-lg bg-cobalt/10 text-cobalt">
              <QrCode className="size-5" />
            </span>
            <h3 className="font-display text-sm font-semibold text-ink">QR Code & Lien unique</h3>
            <p className="text-xs text-ink-2">
              Un lien permanent et un QR code officiel prêt à imprimer ou à afficher sur vos présentations et flyers.
            </p>
          </div>

          <div className="space-y-2">
            <span className="grid size-10 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Smartphone className="size-5" />
            </span>
            <h3 className="font-display text-sm font-semibold text-ink">Partage WhatsApp en 1 clic</h3>
            <p className="text-xs text-ink-2">
              Messages pré-rédigés pour prospecter directement les commerçants de votre carnet d&apos;adresses.
            </p>
          </div>

          <div className="space-y-2">
            <span className="grid size-10 place-items-center rounded-lg bg-[#C7FF3D]/20 text-black dark:text-[#C7FF3D]">
              <TrendingUp className="size-5" />
            </span>
            <h3 className="font-display text-sm font-semibold text-ink">Pipeline de prospection</h3>
            <p className="text-xs text-ink-2">
              Enregistrez vos prospects pour suivre vos démarches commerciales de la prise de contact à la conversion.
            </p>
          </div>

          <div className="space-y-2">
            <span className="grid size-10 place-items-center rounded-lg bg-amber-500/10 text-amber-500">
              <Wallet className="size-5" />
            </span>
            <h3 className="font-display text-sm font-semibold text-ink">Paiements flexibles</h3>
            <p className="text-xs text-ink-2">
              Encaissez par virement bancaire ou par Mobile Money dès 50 $ de gains cumulés.
            </p>
          </div>

          <div className="space-y-2">
            <span className="grid size-10 place-items-center rounded-lg bg-cobalt/10 text-cobalt">
              <ShieldCheck className="size-5" />
            </span>
            <h3 className="font-display text-sm font-semibold text-ink">Attribution first-party 30 jours</h3>
            <p className="text-xs text-ink-2">
              Même si le commerçant s&apos;inscrit plusieurs jours après sa visite, la vente vous est créditée.
            </p>
          </div>

          <div className="space-y-2">
            <span className="grid size-10 place-items-center rounded-lg bg-rose-500/10 text-rose-500">
              <Zap className="size-5" />
            </span>
            <h3 className="font-display text-sm font-semibold text-ink">Support prioritaire</h3>
            <p className="text-xs text-ink-2">
              Accès direct à l&apos;équipe FOVE pour répondre aux questions techniques ou commerciales de vos prospects.
            </p>
          </div>
        </div>
      </section>

      {/* SECTION : FAQ */}
      <section className="mb-24 max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-ink mb-3">
            Questions fréquentes
          </h2>
          <p className="text-sm text-ink-2">Tout ce que vous devez savoir avant de postuler.</p>
        </div>

        <div className="divide-y divide-line rounded-2xl border border-line bg-surface p-6">
          {FAQS.map((faq) => (
            <div key={faq.q} className="py-4 first:pt-0 last:pb-0">
              <h3 className="font-display text-sm font-semibold text-ink mb-1.5 flex items-start gap-2">
                <HelpCircle className="size-4 text-cobalt shrink-0 mt-0.5" />
                <span>{faq.q}</span>
              </h3>
              <p className="text-xs text-ink-2 pl-6 leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="rounded-2xl bg-black text-white p-8 sm:p-14 text-center border border-white/10 shadow-2xl">
        <h2 className="font-display text-3xl sm:text-4xl font-bold mb-4 tracking-tight">
          Prêt à développer votre activité avec FOVE ?
        </h2>
        <p className="text-sm sm:text-base text-neutral-300 max-w-xl mx-auto mb-8 leading-relaxed">
          Rejoignez le programme de partenariat commercial. Candidature gratuite et réponse garantie sous 48h.
        </p>
        <Button asChild size="lg" className="bg-[#C7FF3D] text-black hover:bg-[#b8f52e] font-bold text-sm px-8 shadow-lg">
          <Link href="/partenaires/rejoindre">
            Déposer ma candidature
            <ArrowRight className="size-4 ml-1.5" />
          </Link>
        </Button>
      </section>
    </div>
  );
}
