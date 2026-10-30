import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { serverGet } from "@/lib/server-api";
import { cn, formatPrice } from "@/lib/utils";

interface Plan {
  code: string;
  name: string;
  description: string;
  currency: string;
  priceMonthlyCents: number;
  priceYearlyCents: number;
  trialDays: number;
  features: { api: boolean; widget: boolean; integrations: boolean; exports: boolean };
  limits: { customers: number | null; establishments: number | null; staff: number | null; programs: number | null };
}

function limit(n: number | null, one: string, many: string) {
  if (n === null) return `${many} illimités`;
  return `${new Intl.NumberFormat("fr-FR").format(n)} ${n > 1 ? many : one}`;
}

/** Offres lues depuis l’API : les prix se modifient dans l’administration FOVE, jamais dans le code. */
export async function Pricing() {
  const { data: plans } = await serverGet<Plan[]>("/plans");
  if (!plans?.length) {
    return <p className="rounded-md bg-surface px-4 py-3 text-ink-2 shadow-1">Les tarifs sont momentanément indisponibles. Réessayez dans un instant.</p>;
  }
  const featured = "business";
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {plans.map((plan) => (
        <article
          key={plan.code}
          className={cn("flex flex-col rounded-[var(--radius-lg)] bg-surface p-6 shadow-1", plan.code === featured && "ring-2 ring-cobalt")}
        >
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-display text-xl font-semibold">{plan.name}</h3>
            {plan.code === featured && <span className="text-sm font-medium text-cobalt">Recommandé</span>}
          </div>
          <p className="mt-1 min-h-12 text-sm text-ink-2">{plan.description}</p>
          <p className="mt-5 font-display text-4xl font-semibold tabular">
            {formatPrice(plan.priceYearlyCents, plan.currency)}
            <span className="text-base font-normal text-ink-3"> /an</span>
          </p>
          <p className="text-sm text-ink-3">Paiement annuel à l’avance · dollars US</p>
          <ul className="mt-6 grid gap-2.5 text-[0.95rem]">
            {[
              limit(plan.limits.customers, "client", "clients"),
              limit(plan.limits.establishments, "établissement", "établissements"),
              limit(plan.limits.staff, "collaborateur", "collaborateurs"),
              "Cartes de fidélité et QR d’inscription",
              "Scan et récompenses",
              plan.features.widget && "Widget pour votre site",
              plan.features.api && "API et webhooks",
              plan.features.integrations && "Connexion boutique en ligne",
            ]
              .filter(Boolean)
              .map((f) => (
                <li key={String(f)} className="flex gap-2.5">
                  <Check className="mt-0.5 size-4.5 shrink-0 text-mint" aria-hidden />
                  {f}
                </li>
              ))}
          </ul>
          <Button asChild className="mt-8" variant={plan.code === featured ? "primary" : "secondary"}>
            <Link href="/signup">Essayer {plan.trialDays} jours gratuitement</Link>
          </Button>
        </article>
      ))}
    </div>
  );
}
