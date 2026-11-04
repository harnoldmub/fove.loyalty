"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText, Printer, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, Panel } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { FinanceNav } from "@/components/admin/finance/finance-nav";
import { formatFinance } from "@/components/admin/finance/finance-utils";

const MONTHS = [
  { value: 1, label: "Janvier" },
  { value: 2, label: "Février" },
  { value: 3, label: "Mars" },
  { value: 4, label: "Avril" },
  { value: 5, label: "Mai" },
  { value: 6, label: "Juin" },
  { value: 7, label: "Juillet" },
  { value: 8, label: "Août" },
  { value: 9, label: "Septembre" },
  { value: 10, label: "Octobre" },
  { value: 11, label: "Novembre" },
  { value: 12, label: "Décembre" },
];

export default function AssociateReportsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-finance-monthly-report", year, month],
    queryFn: () =>
      api.get<any>(`/admin/finance/reports/monthly?year=${year}&month=${month}`),
  });

  const cur = data?.current;
  const monthName = MONTHS.find((m) => m.value === month)?.label ?? "";

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <PageHeader
          title="Rapports financiers pour les Associés"
          description="Synthèse analytique mensuelle pour Sid Ali, Arnold & associés."
        />
        <Button onClick={handlePrint} className="gap-2" variant="primary">
          <Printer className="size-4" />
          Imprimer / Exporter PDF
        </Button>
      </div>

      <div className="print:hidden">
        <FinanceNav />
      </div>

      {/* Sélecteur de période */}
      <div className="mb-6 flex items-center gap-3 rounded-lg border border-line bg-surface p-3 print:hidden">
        <span className="text-xs font-medium text-ink-2">Sélectionner le relevé :</span>
        <select
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
          className="rounded-md border border-line bg-surface px-3 py-1.5 text-xs text-ink"
        >
          {MONTHS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>

        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="rounded-md border border-line bg-surface px-3 py-1.5 text-xs text-ink"
        >
          <option value={2025}>2025</option>
          <option value={2026}>2026</option>
          <option value={2027}>2027</option>
        </select>
      </div>

      {isLoading ? (
        <div className="py-20 text-center text-sm text-ink-3">Génération du rapport en cours...</div>
      ) : cur ? (
        <div className="space-y-6 print:space-y-4">
          {/* En-tête officiel du rapport imprimable */}
          <Panel className="p-8 border-line print:shadow-none print:border-none print:p-0">
            <div className="flex items-start justify-between border-b border-line pb-6">
              <div>
                <div className="text-2xl font-black font-display tracking-tight text-ink">FOVE DIGITAL</div>
                <div className="text-xs text-ink-3">Plateforme de cartes de fidélité dématérialisées & wallets</div>
                <div className="text-xs text-ink-3 font-mono mt-1">https://fove.digital</div>
              </div>
              <div className="text-right">
                <div className="rounded bg-surface-2 px-2.5 py-1 text-xs font-bold text-ink inline-block">
                  RAPPORT ASSOCIÉS
                </div>
                <div className="mt-1 font-display text-lg font-bold text-ink">
                  {monthName} {year}
                </div>
                <div className="text-xs text-ink-3">Devise de référence : USD</div>
              </div>
            </div>

            {/* Tableau de Compte de Résultat Provisoire */}
            <div className="mt-6 space-y-4">
              <h3 className="font-display text-base font-bold text-ink">
                Compte d&apos;exploitation & Résultat de la période
              </h3>

              <div className="divide-y divide-line rounded-lg border border-line text-sm">
                {/* Ligne 1 : CA Facturé HT */}
                <div className="flex items-center justify-between p-3.5 bg-surface-2 font-medium">
                  <span className="text-ink">1. Chiffre d&apos;affaires facturé (HT)</span>
                  <span className="font-mono text-ink font-bold">
                    {formatFinance(cur.revenueInvoicedHtCents, "USD")}
                  </span>
                </div>

                {/* Ligne 2 : Taxes */}
                <div className="flex items-center justify-between p-3 text-ink-2 text-xs">
                  <span className="pl-4">TVA / Taxes collectées</span>
                  <span className="font-mono">{formatFinance(cur.taxesCollectedCents, "USD")}</span>
                </div>

                {/* Ligne 3 : Total Facturé TTC */}
                <div className="flex items-center justify-between p-3.5 bg-surface font-semibold text-xs border-b border-line">
                  <span className="text-ink-2 pl-4">Total facturé TTC</span>
                  <span className="font-mono text-ink">{formatFinance(cur.revenueInvoicedCents, "USD")}</span>
                </div>

                {/* Ligne 4 : Encaissements Réels */}
                <div className="flex items-center justify-between p-3.5 bg-emerald-500/5 font-medium">
                  <span className="text-ink">2. Encaissements réels reçus (Brut)</span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                    {formatFinance(cur.grossCollectedCents, "USD")}
                  </span>
                </div>

                {/* Ligne 5 : Frais Stripe */}
                <div className="flex items-center justify-between p-3 text-rose-500 text-xs">
                  <span className="pl-4">Moins : Frais des prestataires (Stripe / banques)</span>
                  <span className="font-mono">-{formatFinance(cur.providerFeesCents, "USD")}</span>
                </div>

                {/* Ligne 6 : Remboursements */}
                <div className="flex items-center justify-between p-3 text-rose-500 text-xs">
                  <span className="pl-4">Moins : Remboursements clients émis</span>
                  <span className="font-mono">-{formatFinance(cur.refundedCents, "USD")}</span>
                </div>

                {/* Ligne 7 : Net Encaissé */}
                <div className="flex items-center justify-between p-3.5 bg-surface font-semibold">
                  <span className="text-ink">Net réellement disponible à l&apos;encaissement</span>
                  <span className="font-mono text-ink font-bold">
                    {formatFinance(cur.netCollectedCents, "USD")}
                  </span>
                </div>

                {/* Ligne 8 : Charges d'exploitation */}
                <div className="flex items-center justify-between p-3.5 bg-rose-500/5 font-medium">
                  <span className="text-ink">3. Dépenses opérationnelles réelles (Serveurs, DB, SaaS)</span>
                  <span className="font-mono text-rose-500 font-bold">
                    -{formatFinance(cur.operatingExpensesCents, "USD")}
                  </span>
                </div>

                {/* Ligne 9 : Commissions partenaires */}
                <div className="flex items-center justify-between p-3.5 text-rose-500 text-xs">
                  <span className="pl-4">Moins : Commissions partenaires FOVE dues</span>
                  <span className="font-mono">-{formatFinance(cur.partnerCommissionsCents, "USD")}</span>
                </div>

                {/* Ligne 10 : RÉSULTAT NET */}
                <div className="flex items-center justify-between p-4 bg-surface-2 font-bold text-base">
                  <span className="text-ink">RÉSULTAT NET DU MOIS (Provisoire)</span>
                  <span
                    className={`font-mono text-lg ${
                      cur.provisionalNetProfitCents >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {formatFinance(cur.provisionalNetProfitCents, "USD")}
                  </span>
                </div>
              </div>
            </div>

            {/* Métriques Saas du mois */}
            <div className="mt-8">
              <h4 className="font-display text-sm font-bold text-ink mb-3">
                Indicateurs Saas & Récurrence commerciale
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div className="rounded-lg border border-line p-3">
                  <div className="text-ink-3">MRR lissé</div>
                  <div className="mt-1 font-mono text-base font-bold text-ink">
                    {formatFinance(cur.mrrCents, "USD")}
                  </div>
                </div>
                <div className="rounded-lg border border-line p-3">
                  <div className="text-ink-3">ARR annualisé</div>
                  <div className="mt-1 font-mono text-base font-bold text-ink">
                    {formatFinance(cur.arrCents, "USD")}
                  </div>
                </div>
                <div className="rounded-lg border border-line p-3">
                  <div className="text-ink-3">Commerces payants actifs</div>
                  <div className="mt-1 font-mono text-base font-bold text-ink">
                    {cur.activePaidSubscriptionsCount}
                  </div>
                </div>
                <div className="rounded-lg border border-line p-3">
                  <div className="text-ink-3">Nouveaux abonnements</div>
                  <div className="mt-1 font-mono text-base font-bold text-emerald-500">
                    +{cur.newPaidSubscriptionsCount}
                  </div>
                </div>
              </div>
            </div>

            {/* Signatures & Certification */}
            <div className="mt-12 border-t border-line pt-6">
              <div className="flex items-center gap-2 text-xs text-ink-3">
                <ShieldCheck className="size-4 text-emerald-500" />
                <span>
                  Relevé certifié conforme aux données comptables et transactions bancaires enregistrées au{" "}
                  {new Date().toLocaleDateString("fr-FR")}.
                </span>
              </div>
              <div className="mt-8 grid grid-cols-2 gap-8 text-xs text-ink-3">
                <div className="border-t border-dashed border-line pt-2">
                  Signature Direction Générale / Associé
                </div>
                <div className="border-t border-dashed border-line pt-2 text-right">
                  Visa Responsable Financier
                </div>
              </div>
            </div>
          </Panel>
        </div>
      ) : null}
    </>
  );
}

