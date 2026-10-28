"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
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
          <dl className="grid grid-cols-2 gap-5 md:grid-cols-4 lg:grid-cols-7">
            {[
              ["Entreprises", stats.tenants],
              ["Nouvelles (30 j)", stats.newTenants30d],
              ["Suspendues", stats.suspended],
              ["En essai", stats.subscriptionsByStatus.TRIALING ?? 0],
              ["Payantes", (stats.subscriptionsByStatus.ACTIVE ?? 0) + (stats.subscriptionsByStatus.PAST_DUE ?? 0)],
              ["Cartes", stats.accounts],
              ["Opérations (30 j)", stats.transactions30d],
            ].map(([l, v]) => (
              <div key={l as string}>
                <dt className="text-sm text-ink-2">{l}</dt>
                <dd className="font-display text-2xl font-semibold tabular">{formatNumber(v as number)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-sm text-ink-2">Revenu mensuel récurrent facturé par Stripe : <strong className="text-ink">{formatPrice(stats.mrrCents)}</strong> (les essais et abonnements simulés ne sont pas comptés).</p>
        </Panel>
      )}
      <Input type="search" aria-label="Rechercher une entreprise" placeholder="Nom, adresse ou email d’un membre" className="mb-4" value={q} onChange={(e) => setQ(e.target.value)} />
      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-ink-3">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Entreprise</th>
              <th scope="col" className="px-4 py-3 font-medium">Offre</th>
              <th scope="col" className="px-4 py-3 font-medium">Clients</th>
              <th scope="col" className="px-4 py-3 font-medium">Équipe</th>
              <th scope="col" className="px-4 py-3 font-medium">Créée le</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {tenants.map((t) => (
              <tr key={t.id} className="hover:bg-surface-2">
                <td className="px-4 py-3">
                  <Link href={`/admin/tenants/${t.id}`} className="font-medium hover:underline">{t.name}</Link>
                  <span className="block text-ink-3">{t.slug}</span>
                </td>
                <td className="px-4 py-3">
                  {t.subscription ? `${t.subscription.plan.name} · ${t.subscription.status.toLowerCase()}` : "Aucune"}
                  {t.status === "SUSPENDED" && <Badge tone="danger" className="ml-2">Suspendue</Badge>}
                </td>
                <td className="px-4 py-3 tabular">{formatNumber(t._count.customers)}</td>
                <td className="px-4 py-3 tabular">{t._count.memberships}</td>
                <td className="px-4 py-3">{formatDate(t.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
