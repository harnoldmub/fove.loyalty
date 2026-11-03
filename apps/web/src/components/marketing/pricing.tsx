import Link from "next/link";
import { Check, X } from "lucide-react";
import type { ReactNode } from "react";
import type { PlanFeatures, PlanLimits, QuotaKey } from "@fove/shared";
import { Button } from "@/components/ui/button";
import { serverGet } from "@/lib/server-api";
import { cn, formatPrice } from "@/lib/utils";

interface Plan {
  code: string;
  kind: "FREE" | "PAID" | "CUSTOM";
  name: string;
  currency: string;
  priceYearlyCents: number;
  features: Partial<PlanFeatures>;
  limits: PlanLimits;
}

const FEATURED = "business";

/** Quantités incluses : un chiffre par offre. */
const QUOTA_ROWS: { key: QuotaKey; label: string }[] = [
  { key: "customers", label: "Clients" },
  { key: "establishments", label: "Établissements" },
  { key: "staff", label: "Collaborateurs" },
  { key: "programs", label: "Programmes de fidélité" },
];

/** Fonctions : incluse ou non. Uniquement des fonctions réellement disponibles. */
const FEATURE_ROWS: { label: string; included: (f: Partial<PlanFeatures>) => boolean }[] = [
  { label: "Cartes, QR d’inscription et scanner", included: () => true },
  { label: "Apple Wallet et Google Wallet", included: () => true },
  { label: "Export des données client (RGPD)", included: (f) => Boolean(f.exports) },
  { label: "Widget pour votre site", included: (f) => Boolean(f.widget) },
  { label: "Sans mention « Propulsé par FOVE »", included: (f) => Boolean(f.removeBranding) },
  { label: "Campagnes Wallet à tous vos clients", included: (f) => Boolean(f.walletCampaigns) },
  { label: "Envoi WhatsApp automatique", included: (f) => Boolean(f.whatsappAuto) },
  { label: "API et webhooks", included: (f) => Boolean(f.api) },
  { label: "Connexion boutique en ligne (via API)", included: (f) => Boolean(f.integrations) },
];

function quota(plan: Plan, key: QuotaKey): string {
  if (plan.kind === "CUSTOM") return "Sur mesure";
  const n = plan.limits[key];
  if (n === null) return "Illimités";
  if (key === "staff" && n === 1) return "1 (vous)";
  return new Intl.NumberFormat("fr-FR").format(n);
}

function cta(plan: Plan): { href: string; label: string } {
  if (plan.kind === "CUSTOM") return { href: "/contact?offre=sur-mesure", label: "Nous contacter" };
  if (plan.kind === "FREE") return { href: "/signup", label: "Commencer" };
  return { href: "/signup", label: `Choisir ${plan.name}` };
}

/** Première colonne : reste visible quand le tableau défile horizontalement sur mobile. */
const stickyCol = "sticky left-0 z-10 bg-surface";

/** Offres lues depuis l’API : les prix se modifient dans l’administration FOVE, jamais dans le code. */
export async function Pricing() {
  const { data: plans } = await serverGet<Plan[]>("/plans");
  if (!plans?.length) {
    return <p className="rounded-md bg-surface px-4 py-3 text-ink-2 shadow-1">Les tarifs sont momentanément indisponibles. Réessayez dans un instant.</p>;
  }
  const featuredCell = (plan: Plan) => plan.code === FEATURED && "bg-cobalt-soft/50";

  const groupRow = (label: string) => (
    <tr>
      <th scope="colgroup" colSpan={plans.length + 1} className="bg-surface-2 px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-ink-3">
        <span className="sticky left-5">{label}</span>
      </th>
    </tr>
  );

  const row = (label: string, cells: (plan: Plan) => ReactNode) => (
    <tr key={label} className="border-t border-line">
      <th scope="row" className={cn(stickyCol, "px-5 py-3.5 text-left font-normal text-ink-2")}>
        {label}
      </th>
      {plans.map((plan) => (
        <td key={plan.code} className={cn("px-3 py-3.5 text-center", featuredCell(plan))}>
          {cells(plan)}
        </td>
      ))}
    </tr>
  );

  const included = (plan: Plan, f: (typeof FEATURE_ROWS)[number]) => plan.kind === "CUSTOM" || f.included(plan.features);
  const price = (plan: Plan) => (
    <>
      {plan.kind === "CUSTOM" ? "Sur devis" : formatPrice(plan.priceYearlyCents, plan.currency)}
      {plan.kind === "PAID" && <span className="text-sm font-normal text-ink-3"> /an</span>}
    </>
  );
  const priceNote = (plan: Plan) => (plan.kind === "FREE" ? "Sans carte bancaire, sans limite de durée" : plan.kind === "CUSTOM" ? "Contrat adapté à votre réseau" : "Payé à l’avance, en dollars US");

  return (
    <div className="grid gap-4">
      {/* Mobile : une carte par offre, avec la même liste inclus / non inclus. */}
      <div className="grid gap-4 md:hidden">
        {plans.map((plan) => {
          const action = cta(plan);
          return (
            <article key={plan.code} className={cn("rounded-[var(--radius-lg)] bg-surface p-5 shadow-1", plan.code === FEATURED && "ring-2 ring-cobalt")}>
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-display text-lg font-semibold">{plan.name}</h3>
                {plan.code === FEATURED && <span className="text-xs font-medium text-cobalt">Recommandé</span>}
              </div>
              <p className="mt-2 font-display text-2xl font-semibold tabular">{price(plan)}</p>
              <p className="text-xs text-ink-3">{priceNote(plan)}</p>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {QUOTA_ROWS.map((q) => (
                  <div key={q.key} className="flex justify-between gap-2 border-b border-line pb-1.5">
                    <dt className="text-ink-2">{q.label}</dt>
                    <dd className="font-medium tabular">{quota(plan, q.key)}</dd>
                  </div>
                ))}
              </dl>
              <ul className="mt-4 grid gap-2 text-sm">
                {FEATURE_ROWS.map((f) => (
                  <li key={f.label} className={cn("flex gap-2.5", !included(plan, f) && "text-ink-3")}>
                    {included(plan, f) ? <Check className="mt-0.5 size-4 shrink-0 text-mint" aria-hidden /> : <X className="mt-0.5 size-4 shrink-0 text-ink-3/70" aria-hidden />}
                    <span>
                      {f.label}
                      {!included(plan, f) && <span className="sr-only"> : non inclus</span>}
                    </span>
                  </li>
                ))}
              </ul>
              <Button asChild size="sm" className="mt-5 w-full" variant={plan.code === FEATURED ? "primary" : "secondary"}>
                <Link href={action.href}>{action.label}</Link>
              </Button>
            </article>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto rounded-[var(--radius-lg)] bg-surface shadow-1 md:block">
        <table className="w-full min-w-[760px] border-collapse text-[0.95rem]">
          <caption className="sr-only">Comparatif des offres FOVE : capacité et fonctions incluses</caption>
          <thead>
            <tr>
              <th scope="col" className={cn(stickyCol, "w-[22%] p-5 text-left align-bottom text-sm font-medium text-ink-2")}>
                Comparez les offres
              </th>
              {plans.map((plan) => {
                const action = cta(plan);
                return (
                  <th key={plan.code} scope="col" className={cn("p-4 text-left align-top font-normal", featuredCell(plan), plan.code === FEATURED && "rounded-t-[var(--radius)]")}>
                    <div className="flex min-h-full flex-col gap-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-display text-lg font-semibold text-ink">{plan.name}</span>
                        {plan.code === FEATURED && <span className="text-xs font-medium text-cobalt">Recommandé</span>}
                      </div>
                      <p className="mt-2 font-display text-2xl font-semibold tabular text-ink">{price(plan)}</p>
                      {/* Hauteur fixe : les boutons restent alignés quelle que soit la longueur de la mention. */}
                      <p className="min-h-8 text-xs text-ink-3">{priceNote(plan)}</p>
                      <Button asChild size="sm" className="mt-4 w-full" variant={plan.code === FEATURED ? "primary" : "secondary"}>
                        <Link href={action.href}>{action.label}</Link>
                      </Button>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {groupRow("Capacité")}
            {QUOTA_ROWS.map((q) => row(q.label, (plan) => <span className="font-medium tabular text-ink">{quota(plan, q.key)}</span>))}
            {groupRow("Fonctions")}
            {FEATURE_ROWS.map((f) =>
              row(f.label, (plan) =>
                included(plan, f) ? (
                  <>
                    <Check className="mx-auto size-5 text-mint" aria-hidden />
                    <span className="sr-only">Inclus</span>
                  </>
                ) : (
                  <>
                    <X className="mx-auto size-5 text-ink-3/70" aria-hidden />
                    <span className="sr-only">Non inclus</span>
                  </>
                ),
              ),
            )}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-ink-3">Toutes les offres démarrent sur le Gratuit : vous changez d’offre à tout moment depuis votre espace, sans perdre vos clients ni leurs points.</p>
    </div>
  );
}
