"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { QrCode, ScanLine, UserPlus } from "lucide-react";
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
            <div className="w-full rounded-t-[3px] bg-cobalt/85 transition-colors group-hover:bg-cobalt" style={{ height: `${Math.max(d.visits ? 4 : 1, (d.visits / max) * 160)}px`, opacity: d.visits ? 1 : 0.25 }} />
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
  const { data, isLoading } = useQuery({ queryKey: ["overview", days], queryFn: () => api.get<Overview>(`/app/analytics/overview?days=${days}`), enabled: canRead });

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
          <Panel className="p-5 sm:p-6">
            <ActivityChart daily={data.daily} />
          </Panel>
        </div>
      )}
    </>
  );
}
