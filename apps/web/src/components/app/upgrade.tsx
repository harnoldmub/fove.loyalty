"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { QUOTA_KEYS, resolveFeatures, resolveLimits, type PlanFeatures, type PlanLimits, type QuotaKey } from "@fove/shared";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/misc";
import { ApiError, api } from "@/lib/api";
import { formatNumber, formatPrice } from "@/lib/utils";
import { useActiveTenant, useCan } from "./me-context";

/**
 * Invitations à passer à une offre payante, pour un commerce sur l'offre
 * Gratuite : encart de la vue d'ensemble, bandeau ponctuel quand un quota
 * approche, explication quand une création est refusée faute de quota.
 * Les limites et fonctions viennent toujours de l'API (offres modifiables
 * dans l'administration), jamais de valeurs codées ici.
 */

interface PlanRow {
  code: string;
  kind: "FREE" | "PAID" | "CUSTOM";
  name: string;
  currency: string;
  priceYearlyCents: number;
  trialDays: number;
  sortOrder: number;
  limits: unknown;
  features: unknown;
}
interface BillingSummary {
  currentPlan: { code: string; name: string; kind: PlanRow["kind"] };
  plans: PlanRow[];
  usage: Record<QuotaKey, number>;
  limits: Record<QuotaKey, number | null>;
}
interface PaidPlan {
  code: string;
  name: string;
  currency: string;
  priceYearlyCents: number;
  trialDays: number;
  limits: PlanLimits;
  features: PlanFeatures;
}

/** Fonctions mises en avant, dans l'ordre où elles parlent le plus à un commerçant. */
const FEATURE_PERKS = ["walletCampaigns", "whatsappAuto", "removeBranding", "referral", "integrations", "api"] as const satisfies readonly (keyof PlanFeatures)[];
/** Ordre des avantages de l'encart : quotas et fonctions intercalés. */
const PERK_ORDER = ["customers", "walletCampaigns", "staff", "whatsappAuto", "programs", "establishments", "removeBranding", "referral", "integrations", "api"] as const;
const MAX_PERKS = 4;

/** Le bandeau revient au plus une fois tous les 4 jours, par commerce. */
const NUDGE_INTERVAL_MS = 4 * 86_400_000;
/** Une création refusée reste un signal pertinent pendant deux semaines. */
const BLOCK_SIGNAL_MS = 14 * 86_400_000;
/** Seuil d'usage à partir duquel le quota de clients est jugé proche. */
const NEAR_RATIO = 0.8;

export function isQuotaError(error: unknown): boolean {
  return error instanceof ApiError && error.code === "quota_exceeded";
}

/** Résumé d'abonnement du commerce actif (même requête que la page Abonnement). */
function useBillingSummary() {
  const canRead = useCan("billing.read");
  const { data } = useQuery({
    queryKey: ["billing"],
    queryFn: () => api.get<BillingSummary>("/app/billing"),
    enabled: canRead,
    staleTime: 60_000,
  });
  if (!canRead || !data) return null;
  const paid: PaidPlan[] = data.plans
    .filter((p) => p.kind === "PAID")
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((p) => ({ ...p, limits: resolveLimits(p.limits), features: resolveFeatures(p.features) }));
  return { ...data, isFree: data.currentPlan.kind === "FREE", paid };
}

/** Première offre payante (la moins chère) qui dépasse la limite actuelle de ce quota. */
function unlockingPlan(paid: PaidPlan[], key: QuotaKey, current: number | null | undefined): PaidPlan | null {
  if (current === null) return null;
  return paid.find((p) => p.limits[key] === null || p.limits[key]! > (current ?? 0)) ?? null;
}

// --- Mémoire par commerce (navigateur) ----------------------------------------

interface NudgeMemory {
  shownAt?: number;
  blocked?: { key: QuotaKey; at: number };
}
const memoryKey = (tenantId: string) => `fove.upgrade.${tenantId}`;

function readMemory(tenantId: string): NudgeMemory {
  try {
    const saved = JSON.parse(localStorage.getItem(memoryKey(tenantId)) ?? "null") as NudgeMemory | null;
    return saved && typeof saved === "object" ? saved : {};
  } catch {
    return {};
  }
}

function writeMemory(tenantId: string, patch: NudgeMemory): void {
  try {
    localStorage.setItem(memoryKey(tenantId), JSON.stringify({ ...readMemory(tenantId), ...patch }));
  } catch {
    // Stockage indisponible (navigation privée) : le bandeau peut simplement revenir.
  }
}

// --- Phrases communes ---------------------------------------------------------

function useUnlockSentence() {
  const t = useTranslations("app.upgrade");
  return useCallback(
    (key: QuotaKey, plan: PaidPlan) => {
      const limit = plan.limits[key];
      const price = formatPrice(plan.priceYearlyCents, plan.currency);
      return limit === null
        ? t("unlockUnlimited", { plan: plan.name, price })
        : t("unlock", { plan: plan.name, price, count: formatNumber(limit), noun: t(`nouns.${key}`, { count: limit }) });
    },
    [t],
  );
}

// --- 1. Encart permanent de la vue d'ensemble ---------------------------------

export function UpgradeCard() {
  const t = useTranslations("app.upgrade");
  const summary = useBillingSummary();
  if (!summary?.isFree || summary.paid.length === 0) return null;

  const cheapest = summary.paid[0]!;
  // Fonctions de l'offre actuelle, telles que réglées dans l'administration.
  const currentFeatures = resolveFeatures(summary.plans.find((p) => p.code === summary.currentPlan.code)?.features);
  const perks = PERK_ORDER.flatMap((key) => {
    if ((QUOTA_KEYS as readonly string[]).includes(key)) {
      const q = key as QuotaKey;
      const plan = unlockingPlan(summary.paid, q, summary.limits[q]);
      if (!plan) return [];
      const limit = plan.limits[q];
      // Sans limite : forme plurielle générale (3 évite le duel arabe).
      const noun = t(`nouns.${q}`, { count: limit ?? 3 });
      return [{
        key,
        title: limit === null ? t("perks.unlimited", { noun }) : t("perks.quota", { count: formatNumber(limit), noun }),
        detail: summary.limits[q] != null ? t("perks.withQuota", { plan: plan.name, current: formatNumber(summary.limits[q]!) }) : t("perks.with", { plan: plan.name }),
      }];
    }
    const f = key as (typeof FEATURE_PERKS)[number];
    if (currentFeatures[f]) return [];
    const plan = summary.paid.find((p) => p.features[f]);
    return plan ? [{ key, title: t(`perks.features.${f}`), detail: t("perks.with", { plan: plan.name }) }] : [];
  }).slice(0, MAX_PERKS);
  if (perks.length === 0) return null;

  const price = formatPrice(cheapest.priceYearlyCents, cheapest.currency);
  return (
    <Panel className="mt-6 grid gap-5 p-5 sm:p-6" aria-labelledby="upgrade-title">
      <div className="grid gap-1">
        <h2 id="upgrade-title" className="font-display text-lg font-semibold">{t("card.title", { plan: summary.currentPlan.name })}</h2>
        <p className="text-sm text-ink-2">
          {cheapest.trialDays > 0 ? t("card.fromTrial", { price, days: cheapest.trialDays }) : t("card.from", { price })}
        </p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2">
        {perks.map((p) => (
          <li key={p.key} className="flex gap-3">
            <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-cobalt-soft text-cobalt" aria-hidden>
              <Check className="size-3.5" strokeWidth={2.5} />
            </span>
            <span className="grid gap-0.5">
              <span className="text-sm font-medium text-ink">{p.title}</span>
              <span className="text-xs text-ink-3">{p.detail}</span>
            </span>
          </li>
        ))}
      </ul>
      <div>
        <Button asChild variant="secondary">
          <Link href="/app/billing">{t("cta")}</Link>
        </Button>
      </div>
    </Panel>
  );
}

// --- 2. Bandeau ponctuel, sur un signal pertinent -----------------------------

/** Quota qui justifie le bandeau : une création refusée récemment, ou des clients proches de la limite. */
function nudgeSignal(memory: NudgeMemory, usage: Record<QuotaKey, number>, limits: Record<QuotaKey, number | null>): QuotaKey | null {
  const now = Date.now();
  if (memory.shownAt && now - memory.shownAt < NUDGE_INTERVAL_MS) return null;
  const blocked = memory.blocked;
  if (blocked && now - blocked.at < BLOCK_SIGNAL_MS && (QUOTA_KEYS as readonly string[]).includes(blocked.key) && limits[blocked.key] != null) return blocked.key;
  const limit = limits.customers;
  return limit != null && limit > 0 && (usage.customers ?? 0) / limit >= NEAR_RATIO ? "customers" : null;
}

export function UpgradeNudge() {
  const t = useTranslations("app.upgrade");
  const unlock = useUnlockSentence();
  const pathname = usePathname();
  const tenant = useActiveTenant();
  const summary = useBillingSummary();
  // Mémoire lue une fois à l'ouverture de l'espace : le bandeau reste affiché
  // pendant la navigation, puis ne revient pas avant quelques jours.
  const tenantId = tenant?.id ?? null;
  const [memory] = useState<NudgeMemory | null>(() => (typeof window === "undefined" || !tenantId ? null : readMemory(tenantId)));
  const [dismissed, setDismissed] = useState(false);

  // La vue d'ensemble a déjà son encart, la page Abonnement montre les offres.
  const hiddenHere = pathname === "/app" || pathname.startsWith("/app/billing");
  const signal = memory && summary?.isFree && !dismissed ? nudgeSignal(memory, summary.usage, summary.limits) : null;
  const show = signal !== null && !hiddenHere;

  useEffect(() => {
    if (show && tenantId) writeMemory(tenantId, { shownAt: Date.now() });
  }, [show, tenantId]);

  if (!show || !summary) return null;
  const used = summary.usage[signal] ?? 0;
  const limit = summary.limits[signal];
  if (limit == null) return null;
  const plan = unlockingPlan(summary.paid, signal, limit);
  const noun = t(`nouns.${signal}`, { count: limit });
  const status = used >= limit
    ? t("reached", { limit: formatNumber(limit), noun, plan: summary.currentPlan.name })
    : t("near", { used: formatNumber(used), limit: formatNumber(limit), noun, plan: summary.currentPlan.name });

  return (
    <aside aria-label={t("nudgeLabel")} className="mb-6 flex items-start gap-3 rounded-[var(--radius-lg)] border border-line bg-surface px-4 py-3 text-sm shadow-1 sm:items-center">
      <p className="min-w-0 flex-1 text-ink-2">
        <span className="text-ink">{status}</span> {plan && unlock(signal, plan)}{" "}
        <Link href="/app/billing" className="font-medium text-cobalt underline-offset-4 hover:underline">{t("cta")}</Link>
      </p>
      <Button variant="ghost" size="icon" className="-my-1 -me-2 shrink-0" onClick={() => setDismissed(true)} aria-label={t("dismiss")}>
        <X />
      </Button>
    </aside>
  );
}

// --- 3. Création refusée faute de quota ---------------------------------------

/** Explique quelle offre lève la limite atteinte, avec le lien vers Abonnement. */
export function QuotaUpgradeHint({ quota }: { quota: QuotaKey }) {
  const t = useTranslations("app.upgrade");
  const unlock = useUnlockSentence();
  const tenant = useActiveTenant();
  const canRead = useCan("billing.read");
  const summary = useBillingSummary();

  // Un refus est le meilleur signal pour reproposer une offre plus tard.
  const tenantId = tenant?.id;
  useEffect(() => {
    if (tenantId) writeMemory(tenantId, { blocked: { key: quota, at: Date.now() } });
  }, [tenantId, quota]);

  if (!canRead) return <p className="rounded-md bg-surface-2 px-3.5 py-2.5 text-sm text-ink-2">{t("askOwner")}</p>;
  if (!summary) return null;
  const plan = unlockingPlan(summary.paid, quota, summary.limits[quota]);
  return (
    <div className="grid gap-3 rounded-md bg-cobalt-soft px-3.5 py-3 text-sm text-ink sm:flex sm:items-center sm:justify-between">
      <p>{plan ? unlock(quota, plan) : t("custom")}</p>
      <Button asChild size="sm" className="justify-self-start shrink-0">
        {plan ? <Link href="/app/billing">{t("cta")}</Link> : <Link href="/contact?offre=sur-mesure">{t("contact")}</Link>}
      </Button>
    </div>
  );
}

/** Suivi d'un refus de quota dans un formulaire : `track(err)` dans le catch, `hint` sous le message d'erreur. */
export function useQuotaBlock(quota: QuotaKey) {
  const [blocked, setBlocked] = useState(false);
  const track = useCallback((error: unknown) => setBlocked(isQuotaError(error)), []);
  const clear = useCallback(() => setBlocked(false), []);
  return { track, clear, hint: blocked ? <QuotaUpgradeHint quota={quota} /> : null };
}
