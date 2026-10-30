"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Building2, QrCode, ScanLine, Sparkles, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, Panel, Skeleton } from "@/components/ui/misc";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { useActiveTenant, useCan } from "./me-context";

interface Overview {
  periodDays: number;
  members: number;
  newMembers: number;
  pointsDistributed: number;
  pointsUsed: number;
  rewardsRedeemed: number;
  returningCustomers: number;
  segments?: {
    VIP: number;
    REGULAR: number;
    NEW: number;
    AT_RISK: number;
    DORMANT: number;
  };
  atRiskCount?: number;
  establishments?: {
    id: string;
    name: string;
    city: string | null;
    scans: number;
    points: number;
  }[];
  daily: { day: string; visits: number; points: number; enrollments: number }[];
}

function Stat({ label, value, help }: { label: string; value: number; help: string }) {
  return (
    <div className="grid gap-1">
      <dt className="text-sm text-ink-2">{label}</dt>
      <dd className="font-display text-3xl font-semibold tabular">{formatNumber(value)}</dd>
      <dd className="text-xs text-ink-3">{help}</dd>
    </div>
  );
}

function ActivityChart({ daily }: { daily: Overview["daily"] }) {
  const max = Math.max(1, ...daily.map((d) => d.visits));
  const total = daily.reduce((s, d) => s + d.visits, 0);
  return (
    <figure className="grid gap-3">
      <figcaption className="flex items-baseline justify-between">
        <span className="font-display text-lg font-semibold">Passages en caisse par jour</span>
        <span className="text-sm text-ink-3 tabular">{formatNumber(total)} au total</span>
      </figcaption>
      <div className="flex h-40 items-end gap-[2px]" role="img" aria-label={`Passages par jour, maximum ${max}`}>
        {daily.map((d) => (
          <div key={d.day} className="group relative flex-1">
            <div
              className="w-full rounded-t-[3px] bg-cobalt/85 transition-colors group-hover:bg-cobalt"
              style={{ height: `${Math.max(d.visits ? 4 : 1, (d.visits / max) * 160)}px`, opacity: d.visits ? 1 : 0.25 }}
            />
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-sm bg-ink px-2 py-1 text-xs text-paper group-hover:block">
              {new Date(d.day).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} : {d.visits} passage{d.visits > 1 ? "s" : ""}
            </span>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-xs text-ink-3">
        <span>{daily[0] && new Date(daily[0].day).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>
        <span>Aujourd’hui</span>
      </div>
      <table className="sr-only">
        <caption>Passages par jour</caption>
        <tbody>
          {daily.map((d) => (
            <tr key={d.day}>
              <th scope="row">{d.day}</th>
              <td>{d.visits}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export function OverviewView({ mode }: { mode: "home" | "analytics" }) {
  const tenant = useActiveTenant();
  const canScan = useCan("transactions.create");
  const canWrite = useCan("customers.write");
  const canRead = useCan("analytics.read");
  const [days, setDays] = useState("30");
  const { data, isLoading } = useQuery({
    queryKey: ["overview", days],
    queryFn: () => api.get<Overview>(`/app/analytics/overview?days=${days}`),
    enabled: canRead,
  });

  if (!canRead) {
    return (
      <EmptyState
        icon={<ScanLine />}
        title={`Bonjour, équipe ${tenant?.name ?? ""}`}
        action={
          <Button asChild size="lg">
            <Link href="/app/scanner">Scanner une carte</Link>
          </Button>
        }
      >
        Scannez la carte d’un client à chaque achat pour lui ajouter ses points ou ses tampons.
      </EmptyState>
    );
  }

  const segments = data?.segments;
  const totalClassified = segments ? segments.VIP + segments.REGULAR + segments.NEW + segments.AT_RISK + segments.DORMANT : 0;

  return (
    <>
      <PageHeader
        title={mode === "home" ? (tenant?.name ?? "Vue d’ensemble") : "Statistiques"}
        description={mode === "home" ? "Votre programme sur les 30 derniers jours." : "Calculées sur l’historique réel de vos opérations."}
        actions={
          mode === "home" ? (
            <>
              {canScan && (
                <Button asChild>
                  <Link href="/app/scanner">
                    <ScanLine /> Scanner une carte
                  </Link>
                </Button>
              )}
              {canWrite && (
                <Button asChild variant="secondary">
                  <Link href="/app/customers?new=1">
                    <UserPlus /> Nouveau client
                  </Link>
                </Button>
              )}
            </>
          ) : (
            <Tabs value={days} onValueChange={setDays}>
              <TabsList aria-label="Période">
                <TabsTrigger value="7">7 jours</TabsTrigger>
                <TabsTrigger value="30">30 jours</TabsTrigger>
                <TabsTrigger value="90">90 jours</TabsTrigger>
              </TabsList>
            </Tabs>
          )
        }
      />

      {isLoading || !data ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : data.members === 0 ? (
        <EmptyState
          icon={<QrCode />}
          title="Aucun membre pour l’instant"
          action={
            <Button asChild>
              <Link href="/app/programs">Afficher mon QR code d’inscription</Link>
            </Button>
          }
        >
          Imprimez votre QR code et placez-le près de la caisse. Les chiffres apparaîtront ici dès la première inscription.
        </EmptyState>
      ) : (
        <div className="grid gap-6">
          {/* Métriques clés */}
          <Panel className="p-5 sm:p-6">
            <dl className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-6">
              <Stat label="Membres" value={data.members} help="cartes actives" />
              <Stat label="Nouveaux membres" value={data.newMembers} help={`sur ${data.periodDays} jours`} />
              <Stat label="Clients revenus" value={data.returningCustomers} help="2 achats ou plus" />
              <Stat label="Points distribués" value={data.pointsDistributed} help="points et tampons" />
              <Stat label="Points utilisés" value={data.pointsUsed} help="en récompenses" />
              <Stat label="Récompenses" value={data.rewardsRedeemed} help="utilisées" />
            </dl>
          </Panel>

          {/* Graphique d'activité journalière */}
          <Panel className="p-5 sm:p-6">
            <ActivityChart daily={data.daily} />
          </Panel>

          {/* Intelligence RFM & Segmentation Sidely */}
          {segments && totalClassified > 0 && (
            <div className="grid gap-6 lg:grid-cols-2">
              <Panel className="p-5 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Users className="size-5 text-cobalt" />
                    <h2 className="font-display text-lg font-semibold">Santé de la Base Client (RFM)</h2>
                  </div>
                  <Button asChild variant="ghost" size="sm" className="text-xs">
                    <Link href="/app/customers">Voir les segments</Link>
                  </Button>
                </div>

                <div className="grid gap-3 text-sm">
                  <div className="flex items-center justify-between p-2 rounded-md bg-surface">
                    <span className="flex items-center gap-2">
                      <Sparkles className="size-4 text-cobalt" />
                      <span>Habitués VIP</span>
                    </span>
                    <span className="font-semibold tabular">{segments.VIP}</span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-md bg-surface">
                    <span className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-mint" />
                      <span>Actifs réguliers</span>
                    </span>
                    <span className="font-semibold tabular">{segments.REGULAR}</span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-md bg-surface">
                    <span className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-mint/50" />
                      <span>Nouveaux membres</span>
                    </span>
                    <span className="font-semibold tabular">{segments.NEW}</span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-md bg-amber-500/10 border border-amber-500/20">
                    <span className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="size-4" />
                      <span className="font-medium">En risque d&apos;attrition</span>
                    </span>
                    <span className="font-semibold tabular text-amber-700 dark:text-amber-400">{segments.AT_RISK}</span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-md bg-surface">
                    <span className="flex items-center gap-2 text-ink-3">
                      <span className="size-2 rounded-full bg-ink-3" />
                      <span>Dormants</span>
                    </span>
                    <span className="font-semibold tabular text-ink-3">{segments.DORMANT}</span>
                  </div>
                </div>

                {segments.AT_RISK > 0 && (
                  <div className="mt-4 rounded-md bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between gap-3">
                    <span>
                      ⚠️ <strong>{segments.AT_RISK} client(s)</strong> ne sont pas revenus depuis plus de 35 jours.
                    </span>
                    <Button asChild size="sm" variant="secondary" className="shrink-0 h-7 text-xs">
                      <Link href="/app/customers">Relancer</Link>
                    </Button>
                  </div>
                )}
              </Panel>

              {/* Performance par Établissement (Retail SFA) */}
              <Panel className="p-5 sm:p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Building2 className="size-5 text-cobalt" />
                  <h2 className="font-display text-lg font-semibold">Performance des Points de Vente</h2>
                </div>

                {data.establishments && data.establishments.length > 0 ? (
                  <div className="grid gap-3">
                    {data.establishments.map((est) => (
                      <div key={est.id} className="flex items-center justify-between p-3 rounded-md bg-surface border border-line">
                        <div>
                          <p className="font-medium text-ink">{est.name}</p>
                          <p className="text-xs text-ink-3">{est.city || "Boutique principale"}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold tabular text-ink">{formatNumber(est.scans)} scans</p>
                          <p className="text-xs text-ink-3 tabular">+{formatNumber(est.points)} distribués</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-ink-3">Un seul établissement configuré.</p>
                )}
              </Panel>
            </div>
          )}
        </div>
      )}
    </>
  );
}
