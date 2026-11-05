"use client";

import Link from "next/link";
import { ArrowRight, Check, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CurrencyToggle } from "./currency-toggle";
import { useMarketingCurrency } from "@/lib/marketing-currency";

const COMMISSIONS_DATA = {
  USD: [
    {
      plan: "Starter",
      price: "99 $ / an",
      subtitle: "Pour petits commerces & indépendants",
      commission: "19,80 $",
      rate: "20%",
      badge: null,
      features: [
        "Abonnement annuel 1 an",
        "Commission nette après encaissement",
        "Suivi en direct dans votre espace",
      ],
    },
    {
      plan: "Business",
      price: "199 $ / an",
      subtitle: "Pour restaurants, salons & boutiques",
      commission: "39,80 $",
      rate: "20%",
      badge: "Le plus recommandé",
      features: [
        "Abonnement annuel 1 an",
        "Commission nette après encaissement",
        "Paiement rapide virement ou mobile",
      ],
    },
    {
      plan: "Premium",
      price: "399 $ / an",
      subtitle: "Pour enseignes multi-points de vente",
      commission: "79,80 $",
      rate: "20%",
      badge: null,
      features: [
        "Abonnement annuel 1 an",
        "Commission nette après encaissement",
        "Accompagnement commercial FOVE",
      ],
    },
  ],
  EUR: [
    {
      plan: "Starter",
      price: "99 € / an",
      subtitle: "Pour petits commerces & indépendants",
      commission: "19,80 €",
      rate: "20%",
      badge: null,
      features: [
        "Abonnement annuel 1 an",
        "Commission nette après encaissement",
        "Suivi en direct dans votre espace",
      ],
    },
    {
      plan: "Business",
      price: "199 € / an",
      subtitle: "Pour restaurants, salons & boutiques",
      commission: "39,80 €",
      rate: "20%",
      badge: "Le plus recommandé",
      features: [
        "Abonnement annuel 1 an",
        "Commission nette après encaissement",
        "Paiement rapide virement ou mobile",
      ],
    },
    {
      plan: "Premium",
      price: "399 € / an",
      subtitle: "Pour enseignes multi-points de vente",
      commission: "79,80 €",
      rate: "20%",
      badge: null,
      features: [
        "Abonnement annuel 1 an",
        "Commission nette après encaissement",
        "Accompagnement commercial FOVE",
      ],
    },
  ],
};

export function PartnerCommissions() {
  const { currency } = useMarketingCurrency();
  const commissions = COMMISSIONS_DATA[currency] ?? COMMISSIONS_DATA.USD;

  return (
    <section className="mb-24">
      <div className="text-center max-w-2xl mx-auto mb-10">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-3">
          <TrendingUp className="size-3.5" /> Barème 2026
        </div>
        <h2 className="font-display text-2xl sm:text-3xl font-bold text-ink mb-3">
          Gagnez 20 % sur chaque abonnement
        </h2>
        <p className="text-sm text-ink-2 mb-6">
          Commissions calculées sur le montant net réellement payé par le commerçant. Pas de faux calculs ni de frais cachés.
        </p>

        {/* Sélecteur de devise interactif */}
        <div className="flex justify-center">
          <CurrencyToggle />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {commissions.map((c) => (
          <div
            key={c.plan}
            className={`rounded-2xl border p-6 shadow-sm flex flex-col justify-between transition-all duration-200 ${
              c.badge
                ? "border-[#C7FF3D] bg-surface relative"
                : "border-line bg-surface"
            }`}
          >
            <div>
              {c.badge && (
                <span className="absolute -top-3 right-6 rounded-full bg-[#C7FF3D] px-3 py-0.5 text-[11px] font-bold text-black uppercase tracking-wide">
                  {c.badge}
                </span>
              )}
              <h3 className="font-display text-xl font-bold text-ink">{c.plan}</h3>
              <p className="text-xs text-ink-3 mb-4">{c.subtitle}</p>

              <div className="mb-6 rounded-xl bg-surface-2 p-4">
                <div className="text-xs text-ink-3">Tarif annuel du client : {c.price}</div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="font-display text-3xl font-extrabold text-ink tabular">{c.commission}</span>
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    ({c.rate} commission)
                  </span>
                </div>
              </div>

              <ul className="space-y-2 text-xs text-ink-2">
                {c.features.map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <Check className="size-3.5 text-emerald-500 shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-10 text-center">
        <Button asChild size="lg" className="px-8 font-semibold shadow-md">
          <Link href="/partenaires/rejoindre">
            Rejoindre le réseau partenaire
            <ArrowRight className="size-4 ml-2" />
          </Link>
        </Button>
        <p className="mt-2.5 text-xs text-ink-3">
          Inscription gratuite en 2 minutes · Commissions valables sur toutes les formules souscrites
        </p>
      </div>
    </section>
  );
}
