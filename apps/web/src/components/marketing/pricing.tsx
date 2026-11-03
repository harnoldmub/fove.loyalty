import Link from "next/link";
import { Check } from "lucide-react";
import type { PlanFeatures, PlanLimits } from "@fove/shared";
import { Button } from "@/components/ui/button";
import { serverGet } from "@/lib/server-api";
import { cn, formatPrice } from "@/lib/utils";

interface Plan {
  code: string;
  kind: "FREE" | "PAID" | "CUSTOM";
  name: string;
  description: string;
  currency: string;
  priceYearlyCents: number;
  features: Partial<PlanFeatures>;
  limits: PlanLimits;
}

function limit(n: number | null, one: string, many: string) {
  if (n === null) return `${many[0]!.toUpperCase()}${many.slice(1)} illimités`;
  return `${new Intl.NumberFormat("fr-FR").format(n)} ${n > 1 ? many : one}`;
}

/** Ce que l'offre apporte, dans l'ordre où un commerçant compare. Uniquement des fonctions réellement disponibles. */
function highlights(plan: Plan): string[] {
  const { features: f, limits: l } = plan;
  return [
    limit(l.customers, "client", "clients"),
    limit(l.establishments, "établissement", "établissements"),
    l.staff === 1 ? "1 collaborateur (vous)" : limit(l.staff, "collaborateur", "collaborateurs"),
    limit(l.programs, "programme de fidélité", "programmes de fidélité"),
    "Cartes, QR d’inscription et scanner",
    "Apple Wallet et Google Wallet",
    f.exports && "Export des données client (RGPD)",
    f.widget && "Widget pour votre site",
    f.removeBranding && "Sans mention FOVE",
    f.walletCampaigns && "Campagnes Wallet à tous vos clients",
    f.whatsappAuto && "Envoi WhatsApp automatique",
    f.api && "API et webhooks",
    f.integrations && "Connexion boutique en ligne (via API)",
    (l.establishments === null || l.establishments > 1) && "Statistiques par établissement",
  ].filter((line): line is string => Boolean(line));
}

/** Offres lues depuis l’API : les prix se modifient dans l’administration FOVE, jamais dans le code. */
export async function Pricing() {
  const { data: plans } = await serverGet<Plan[]>("/plans");
  if (!plans?.length) {
    return <p className="rounded-md bg-surface px-4 py-3 text-ink-2 shadow-1">Les tarifs sont momentanément indisponibles. Réessayez dans un instant.</p>;
  }
  const featured = "business";
  const offers = plans.filter((p) => p.kind !== "CUSTOM");
  const custom = plans.find((p) => p.kind === "CUSTOM");
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {offers.map((plan) => (
          <article
            key={plan.code}
            className={cn("flex flex-col rounded-[var(--radius-lg)] bg-surface p-6 shadow-1", plan.code === featured && "ring-2 ring-cobalt")}
          >
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-display text-xl font-semibold">{plan.name}</h3>
              {plan.code === featured && <span className="text-sm font-medium text-cobalt">Recommandé</span>}
            </div>
            <p className="mt-1 min-h-12 text-sm text-ink-2">{plan.description}</p>
            {plan.kind === "FREE" ? (
              <>
                <p className="mt-5 font-display text-4xl font-semibold">Gratuit</p>
                <p className="text-sm text-ink-3">Sans carte bancaire · sans limite de durée</p>
              </>
            ) : (
              <>
                <p className="mt-5 font-display text-4xl font-semibold tabular">
                  {formatPrice(plan.priceYearlyCents, plan.currency)}
                  <span className="text-base font-normal text-ink-3"> /an</span>
                </p>
                <p className="text-sm text-ink-3">Paiement annuel à l’avance · dollars US</p>
              </>
            )}
            <ul className="mt-6 grid gap-2.5 text-[0.95rem]">
              {highlights(plan).map((line) => (
                <li key={line} className="flex gap-2.5">
                  <Check className="mt-0.5 size-4.5 shrink-0 text-mint" aria-hidden />
                  {line}
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-8">
              <Button asChild className="w-full" variant={plan.code === featured ? "primary" : "secondary"}>
                <Link href="/signup">{plan.kind === "FREE" ? "Commencer gratuitement" : `Démarrer avec ${plan.name}`}</Link>
              </Button>
            </div>
          </article>
        ))}
      </div>
      {custom && (
        <article className="flex flex-col gap-5 rounded-[var(--radius-lg)] bg-surface p-6 shadow-1 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <h3 className="font-display text-xl font-semibold">{custom.name}</h3>
            <p className="mt-1 text-sm text-ink-2">{custom.description}</p>
            <ul className="mt-4 grid gap-2 text-[0.95rem] sm:grid-cols-2">
              {["Clients, établissements et équipe selon vos besoins", "Toutes les fonctions, API et connexion boutique", "Accompagnement au déploiement", "Contrat et facturation sur devis"].map((line) => (
                <li key={line} className="flex gap-2.5">
                  <Check className="mt-0.5 size-4.5 shrink-0 text-mint" aria-hidden />
                  {line}
                </li>
              ))}
            </ul>
          </div>
          <Button asChild variant="secondary" className="shrink-0">
            <Link href="/contact?offre=sur-mesure">Nous contacter</Link>
          </Button>
        </article>
      )}
      <p className="text-sm text-ink-3">Toutes les offres démarrent sur le Gratuit : vous changez d’offre à tout moment depuis votre espace, sans perdre vos clients ni leurs points.</p>
    </div>
  );
}
