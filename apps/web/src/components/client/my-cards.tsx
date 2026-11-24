"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge, ErrorNote, Panel, Skeleton, SuccessNote } from "@/components/ui/misc";
import { AddToHomeScreenButton } from "@/components/add-to-home-screen";
import { api, useErrorMessage } from "@/lib/api";
import { formatNumber } from "@/lib/utils";

interface Tenant {
  name: string;
  logoUrl: string | null;
  primaryColor: string;
}
interface Program {
  name: string;
  mode: "POINTS" | "STAMPS";
  stampsTarget: number;
}
interface MyCardsData {
  cards: { id: string; tenant: Tenant; program: Program; balance: number; status: string; cardPath: string }[];
  linkable: { customerId: string; firstName: string; tenant: Tenant; cards: { program: Program; balance: number }[] }[];
}

function Logo({ tenant, className = "size-11" }: { tenant: Tenant; className?: string }) {
  return tenant.logoUrl ? (
    <img src={tenant.logoUrl} alt="" className={`${className} shrink-0 rounded-full bg-white object-cover`} />
  ) : (
    <span className={`${className} grid shrink-0 place-items-center rounded-full bg-white/25 font-display text-lg font-bold`}>{tenant.name.slice(0, 1)}</span>
  );
}

/** Solde lisible : « 12 points » ou « 3 / 10 tampons ». */
function useBalance() {
  const t = useTranslations("client.home");
  const tCard = useTranslations("public.card");
  const locale = useLocale();
  return (program: Program, balance: number) =>
    program.mode === "STAMPS" ? t("stamps", { count: balance, target: program.stampsTarget }) : `${formatNumber(balance, locale)} ${tCard("pointsUnit", { count: balance })}`;
}

/** Cartes du compte, chacune aux couleurs de son commerce, et fiches à rattacher (sous-lot A3). */
export function MyCards({ email }: { email: string }) {
  const t = useTranslations("client.home");
  const errorMessage = useErrorMessage();
  const balance = useBalance();
  const [data, setData] = useState<MyCardsData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setData(await api.get<MyCardsData>("/client/me/cards"));
  }, []);
  useEffect(() => {
    let cancelled = false;
    api
      .get<MyCardsData>("/client/me/cards")
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setLoadError(true));
    return () => {
      cancelled = true;
    };
  }, []);

  async function decide(customerId: string, accept: boolean) {
    setBusy(customerId);
    setError(null);
    setNotice(null);
    try {
      if (accept) await api.post(`/client/me/linkable/${customerId}`);
      else await api.delete(`/client/me/linkable/${customerId}`);
      await reload();
      if (accept) setNotice(t("accepted"));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  if (loadError) return <ErrorNote>{t("cardsLoadError")}</ErrorNote>;
  if (!data) {
    return (
      <div className="grid gap-3" aria-busy="true">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    );
  }

  return (
    <div className="grid gap-8">
      {data.linkable.length > 0 && (
        <section className="grid gap-3" aria-labelledby="a-rattacher">
          <div className="grid gap-1">
            <h2 id="a-rattacher" className="font-display text-xl font-semibold">
              {t("linkableTitle")}
            </h2>
            <p className="text-sm text-ink-2">{t("linkableBody", { email })}</p>
          </div>
          {error && <ErrorNote>{error}</ErrorNote>}
          {data.linkable.map((l) => (
            <Panel key={l.customerId} className="grid gap-4 p-4">
              <div className="flex items-center gap-3">
                <span className="rounded-full p-0.5" style={{ background: l.tenant.primaryColor }}>
                  <Logo tenant={l.tenant} className="size-10 text-white" />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{l.tenant.name}</p>
                  <p className="text-sm text-ink-3">{t("linkableOwner", { name: l.firstName })}</p>
                </div>
              </div>
              {l.cards.length > 0 && (
                <ul className="grid gap-1 text-sm text-ink-2">
                  {l.cards.map((c, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span className="truncate">{c.program.name}</span>
                      <span className="shrink-0 font-medium text-ink">{balance(c.program, c.balance)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-2">
                <Button loading={busy === l.customerId} disabled={busy !== null} onClick={() => decide(l.customerId, true)}>
                  {t("accept")}
                </Button>
                <Button variant="ghost" disabled={busy !== null} onClick={() => decide(l.customerId, false)}>
                  {t("dismiss")}
                </Button>
              </div>
            </Panel>
          ))}
        </section>
      )}

      <section className="grid gap-3" aria-labelledby="cartes">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="cartes" className="font-display text-xl font-semibold">
            {t("cardsTitle")}
          </h2>
          <AddToHomeScreenButton tenantName="FOVE" texts={{ description: t("installDescription"), androidDone: t("installDone") }} />
        </div>
        {notice && <SuccessNote>{notice}</SuccessNote>}
        {data.cards.length === 0 ? (
          <Panel className="grid gap-1 p-5 text-sm text-ink-2">
            <p>{t("cardsEmpty")}</p>
            <p className="text-ink-3">{t("cardsEmptyHint")}</p>
          </Panel>
        ) : (
          <ul className="grid gap-3">
            {data.cards.map((c) => (
              <li key={c.id}>
                <Link
                  href={c.cardPath}
                  aria-label={t("openCard", { tenant: c.tenant.name })}
                  className="flex items-center gap-3 rounded-[var(--radius-lg)] p-4 text-white shadow-1 transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cobalt focus-visible:ring-offset-2"
                  style={{ background: c.tenant.primaryColor }}
                >
                  <Logo tenant={c.tenant} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-lg font-semibold leading-tight">{c.tenant.name}</p>
                    <p className="truncate text-sm text-white/80">{c.program.name}</p>
                    {c.status !== "ACTIVE" && (
                      <Badge tone={c.status === "BLOCKED" ? "danger" : "stamp"} className="mt-1">
                        {c.status === "BLOCKED" ? t("statusBlocked") : t("statusPending")}
                      </Badge>
                    )}
                  </div>
                  <span className="shrink-0 text-end font-semibold tabular-nums">{balance(c.program, c.balance)}</span>
                  <ChevronRight className="size-5 shrink-0 text-white/70 rtl-flip" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
