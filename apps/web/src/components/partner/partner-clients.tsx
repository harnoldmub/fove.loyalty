"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Badge, Panel } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { formatDate, formatPrice } from "@/lib/utils";
import { DataLoader } from "@/components/navigation/data-loader";

interface PartnerClient {
  tenantId: string;
  name: string;
  planName: string | null;
  periodEnd: string | null;
  /** free : Gratuit ; pending : référence en attente ; provisional : accès provisoire en attente du paiement ; paid : payé ; expired : échu. */
  payment: "free" | "pending" | "provisional" | "paid" | "expired";
  pending: { reference: string; amountCents: number; currency: string } | null;
  registeredAt: string;
}

const TONE = { free: "neutral", pending: "stamp", provisional: "stamp", paid: "mint", expired: "danger" } as const;

/**
 * Onglet « Clients » de l'espace partenaire : inscrire un commerce (lien pré-rempli, le compte reste au
 * commerçant) et suivre ses clients, leur échéance et l'état de leur paiement. Le partenaire accompagne
 * le paiement (virement avec la référence, carte) mais n'encaisse jamais.
 */
export function PartnerClients({ partnerCode }: { partnerCode: string }) {
  const t = useTranslations("partner.clientsTab");
  const locale = useLocale();
  const { data: clients = [], isLoading } = useQuery({ queryKey: ["partner-clients"], queryFn: () => api.get<PartnerClient[]>("/partner/clients") });
  const [invite, setInvite] = useState({ name: "", business: "", email: "" });

  const signupLink = () => {
    const url = new URL(`/p/${partnerCode}`, window.location.origin);
    url.searchParams.set("to", "signup");
    if (invite.name) url.searchParams.set("name", invite.name);
    if (invite.business) url.searchParams.set("business", invite.business);
    if (invite.email) url.searchParams.set("email", invite.email);
    return url.toString();
  };

  return (
    <div className="space-y-6">
      <Panel className="grid gap-3 p-6">
        <h2 className="font-display text-lg font-bold text-ink">{t("invite.title")}</h2>
        <p className="text-sm text-ink-2">{t("invite.help")}</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <Field label={t("invite.name")}>{(f) => <Input {...f} value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} />}</Field>
          <Field label={t("invite.business")}>{(f) => <Input {...f} value={invite.business} onChange={(e) => setInvite({ ...invite, business: e.target.value })} />}</Field>
          <Field label={t("invite.email")}>{(f) => <Input {...f} type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />}</Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              void navigator.clipboard?.writeText(signupLink());
              toast.success(t("invite.copied"));
            }}
          >
            {t("invite.copy")}
          </Button>
          <Button variant="secondary" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(t("invite.message", { url: signupLink() }))}`, "_blank", "noopener")}>
            {t("invite.whatsapp")}
          </Button>
          <Button variant="ghost" onClick={() => window.open(signupLink(), "_blank", "noopener")}>
            {t("invite.open")}
          </Button>
        </div>
      </Panel>

      <Panel className="grid gap-3 p-6">
        <div>
          <h2 className="font-display text-lg font-bold text-ink">{t("title")}</h2>
          <p className="text-sm text-ink-2">{t("help")}</p>
        </div>
        {isLoading ? (
          <DataLoader className="min-h-48" />
        ) : clients.length === 0 ? (
          <p className="text-sm text-ink-3">{t("empty")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {clients.map((c) => (
              <li key={c.tenantId} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <div className="min-w-40 flex-1">
                  <p className="font-semibold text-ink">{c.name}</p>
                  <p className="text-xs text-ink-3">
                    {c.planName && c.periodEnd ? t("until", { plan: c.planName, date: formatDate(c.periodEnd, false, locale) }) : t("registered", { date: formatDate(c.registeredAt, false, locale) })}
                  </p>
                  {c.pending && (
                    <p className="mt-1 text-xs text-ink-2">
                      {t("pendingDetail", { amount: formatPrice(c.pending.amountCents, c.pending.currency, locale) })}{" "}
                      <span className="font-mono font-semibold" dir="ltr">{c.pending.reference}</span>
                    </p>
                  )}
                </div>
                <Badge tone={TONE[c.payment]}>{t(`payment.${c.payment}`)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
