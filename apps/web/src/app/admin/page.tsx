"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Badge, PageHeader, Panel } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { formatDate, formatNumber, formatPrice } from "@/lib/utils";

interface Stats { tenants: number; suspended: number; newTenants30d: number; subscriptionsByStatus: Record<string, number>; activeByPlan: Record<string, number>; mrrCents: number; customers: number; accounts: number; transactions30d: number }
interface TenantRow { id: string; name: string; slug: string; status: string; createdAt: string; subscription: { status: string; provider: string; plan: { code: string; name: string } } | null; _count: { customers: number; accounts: number; memberships: number } }

export default function AdminHome() {
  const [q, setQ] = useState("");
  const { data: stats } = useQuery({ queryKey: ["admin-stats"], queryFn: () => api.get<Stats>("/admin/stats") });
  const { data: tenants = [] } = useQuery({ queryKey: ["admin-tenants", q], queryFn: () => api.get<TenantRow[]>(`/admin/tenants${q ? `?q=${encodeURIComponent(q)}` : ""}`) });
  return (
    <>
      <PageHeader title="Entreprises" description="Toutes les entreprises de la plateforme." />
      {stats && (
        <Panel className="mb-6 p-5">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
            {[
              ["Entreprises", stats.tenants, `${formatNumber(stats.newTenants30d)} nouvelles en 30 jours`],
              ["Payantes", (stats.subscriptionsByStatus.ACTIVE ?? 0) + (stats.subscriptionsByStatus.PAST_DUE ?? 0), `${formatNumber(stats.subscriptionsByStatus.TRIALING ?? 0)} en essai`],
              ["Cartes", stats.accounts, `${formatNumber(stats.transactions30d)} opérations en 30 jours`],
              ["Suspendues", stats.suspended, "accès bloqué"],
            ].map(([l, v, help]) => (
              <div key={l as string} className="grid content-start gap-0.5">
                <dt className="text-sm text-ink-2">{l}</dt>
                <dd className="font-display text-3xl font-semibold tabular">{formatNumber(v as number)}</dd>
                <dd className="text-xs text-ink-3">{help}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 border-t border-line pt-4 text-sm text-ink-2">
            Revenu mensuel facturé par Stripe : <strong className="text-ink tabular">{formatPrice(stats.mrrCents)}</strong>. Les essais et abonnements simulés ne sont pas comptés.
          </p>
        </Panel>
      )}
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
        <Input type="search" aria-label="Rechercher une entreprise" placeholder="Nom, adresse ou email d’un membre" className="pl-10" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {/* Mobile : une ligne par entreprise ; le tableau complet à partir de la tablette. */}
      <Panel className="overflow-hidden md:hidden">
        <ul className="divide-y divide-line">
          {tenants.map((t) => (
            <li key={t.id}>
              <Link href={`/admin/tenants/${t.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">{t.name}</span>
                  <span className="block truncate text-sm text-ink-3">
                    {t.subscription ? t.subscription.plan.name : "Sans offre"} · {formatNumber(t._count.customers)} client{t._count.customers > 1 ? "s" : ""}
                  </span>
                </span>
                {t.status === "SUSPENDED" ? (
                  <Badge tone="danger">Suspendue</Badge>
                ) : t.subscription?.status === "TRIALING" ? (
                  <Badge tone="cobalt">Essai</Badge>
                ) : t.subscription?.status === "ACTIVE" ? (
                  <Badge tone="mint">Payant</Badge>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="text-ink-3">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Entreprise</th>
              <th scope="col" className="px-4 py-3 font-medium">Offre</th>
              <th scope="col" className="px-4 py-3 font-medium">Clients</th>
              <th scope="col" className="px-4 py-3 font-medium">Cartes</th>
              <th scope="col" className="px-4 py-3 font-medium">Équipe</th>
              <th scope="col" className="px-4 py-3 font-medium">Créée le</th>
              <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {tenants.map((t) => {
              const subStatus = t.subscription?.status;
              const isTrial = subStatus === "TRIALING";
              const isActive = subStatus === "ACTIVE";

              return (
                <tr key={t.id} className="transition-colors hover:bg-surface-2">
                  <td className="px-4 py-3">
                    <Link href={`/admin/tenants/${t.id}`} className="font-semibold text-ink hover:text-cobalt hover:underline">
                      {t.name}
                    </Link>
                    <span className="block text-xs text-ink-3">{t.slug}</span>
                  </td>
                  <td className="px-4 py-3">
                    {t.subscription ? (
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-ink">{t.subscription.plan.name}</span>
                        <Badge tone={isActive ? "mint" : isTrial ? "cobalt" : "neutral"}>
                          {isTrial ? "Essai" : isActive ? "Payant" : t.subscription.status}
                        </Badge>
                      </div>
                    ) : (
                      <Badge tone="neutral">Aucune</Badge>
                    )}
                    {t.status === "SUSPENDED" && <Badge tone="danger" className="ml-2">Suspendue</Badge>}
                  </td>
                  <td className="px-4 py-3 tabular font-semibold text-ink">{formatNumber(t._count.customers)}</td>
                  <td className="px-4 py-3 tabular text-ink-2">{formatNumber(t._count.accounts)}</td>
                  <td className="px-4 py-3 tabular text-ink-2">{t._count.memberships}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink-3">{formatDate(t.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <Button asChild variant="secondary" size="sm">
                      <Link href={`/admin/tenants/${t.id}`} aria-label={`Ouvrir ${t.name}`}>Ouvrir</Link>
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
