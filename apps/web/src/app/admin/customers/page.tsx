"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ExternalLink, Search, Smartphone, UserCheck, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/field";
import { Badge, PageHeader, Panel } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { formatDate, formatNumber } from "@/lib/utils";

interface PlatformCustomer {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  tags: string[];
  notes: string | null;
  totalVisits: number;
  totalSpend: string | number;
  lastVisitAt: string | null;
  createdAt: string;
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
  segment?: {
    segment: "VIP" | "REGULAR" | "AT_RISK" | "DORMANT" | "NEW";
    label: string;
    color: string;
  };
  accounts: {
    id: string;
    cardNumber: string;
    balance: number;
    status: string;
    accessToken: string | null;
    program: {
      name: string;
      mode: "POINTS" | "STAMPS";
      stampsTarget: number;
    };
  }[];
}

const SEGMENT_BADGES: Record<string, { label: string; tone: "mint" | "cobalt" | "stamp" | "danger" | "neutral" }> = {
  VIP: { label: "⭐ VIP", tone: "mint" },
  REGULAR: { label: "Actif régulier", tone: "cobalt" },
  AT_RISK: { label: "⚠️ En risque", tone: "stamp" },
  DORMANT: { label: "💤 Dormant", tone: "danger" },
  NEW: { label: "🌱 Nouveau", tone: "neutral" },
};

export default function AdminCustomersPage() {
  const [q, setQ] = useState("");

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["admin-customers", q],
    queryFn: () => api.get<PlatformCustomer[]>(`/admin/customers${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  });

  return (
    <>
      <PageHeader
        title="Clients & Cartes de fidélité"
        description="Vue globale de tous les clients et cartes enregistrés sur les commerces de la plateforme."
        actions={
          <div className="flex items-center gap-2 text-sm text-ink-3">
            <UserCheck className="size-4 text-emerald-600" />
            <span>{customers.length} client{customers.length > 1 ? "s" : ""} référencé{customers.length > 1 ? "s" : ""}</span>
          </div>
        }
      />

      <div className="mb-4">
        <Input
          type="search"
          aria-label="Rechercher un client"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <Panel className="overflow-x-auto p-0">
        <table className="w-full min-w-[850px] text-left text-sm">
          <thead className="border-b border-line bg-surface-2 text-ink-3">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Client</th>
              <th scope="col" className="px-4 py-3 font-medium">Commerce</th>
              <th scope="col" className="px-4 py-3 font-medium">Segment</th>
              <th scope="col" className="px-4 py-3 font-medium">Carte & Solde</th>
              <th scope="col" className="px-4 py-3 font-medium">Activité</th>
              <th scope="col" className="px-4 py-3 font-medium text-right">Lien direct carte</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {isLoading && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-ink-3">
                  Chargement des clients...
                </td>
              </tr>
            )}

            {!isLoading && customers.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-ink-3">
                  Aucun client trouvé pour cette recherche.
                </td>
              </tr>
            )}

            {customers.map((c) => {
              const account = c.accounts[0];
              const seg = c.segment ? SEGMENT_BADGES[c.segment.segment] : null;
              const cardUrl = account?.accessToken ? `/card/${account.accessToken}` : null;

              return (
                <tr key={c.id} className="hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-3.5">
                    <span className="font-semibold text-ink block">
                      {c.firstName} {c.lastName}
                    </span>
                    <span className="block text-xs text-ink-3">
                      {c.phone ?? c.email ?? "Sans coordonnées"}
                    </span>
                    {c.tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {c.tags.map((t) => (
                          <span key={t} className="rounded bg-surface-3 px-1.5 py-0.5 text-[0.68rem] text-ink-2">
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>

                  <td className="px-4 py-3.5">
                    <Link href={`/admin/tenants/${c.tenant.id}`} className="font-medium text-cobalt hover:underline">
                      {c.tenant.name}
                    </Link>
                    <span className="block text-xs text-ink-3">{c.tenant.slug}</span>
                  </td>

                  <td className="px-4 py-3.5">
                    {seg ? <Badge tone={seg.tone}>{seg.label}</Badge> : <Badge tone="neutral">Standard</Badge>}
                  </td>

                  <td className="px-4 py-3.5">
                    {account ? (
                      <div>
                        <span className="font-mono text-xs font-semibold text-ink">
                          {account.cardNumber}
                        </span>
                        <span className="block text-xs font-semibold text-cobalt">
                          {account.balance} {account.program.mode === "POINTS" ? "points" : "tampons"}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-ink-3">Aucune carte</span>
                    )}
                  </td>

                  <td className="px-4 py-3.5 text-xs text-ink-2">
                    <span className="block font-medium text-ink">{c.totalVisits} passage{c.totalVisits > 1 ? "s" : ""}</span>
                    <span>Dernière : {c.lastVisitAt ? formatDate(c.lastVisitAt) : "N/A"}</span>
                  </td>

                  <td className="px-4 py-3.5 text-right">
                    {cardUrl ? (
                      <a
                        href={cardUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink shadow-xs transition-colors hover:border-cobalt hover:text-cobalt"
                      >
                        <Smartphone className="size-3.5 text-cobalt" />
                        <span>Ouvrir la carte</span>
                        <ExternalLink className="size-3 opacity-60" />
                      </a>
                    ) : (
                      <span className="text-xs text-ink-3">—</span>
                    )}
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
