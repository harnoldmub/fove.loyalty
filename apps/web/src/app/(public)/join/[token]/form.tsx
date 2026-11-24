"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { PhoneInput } from "@/components/ui/phone-input";
import { ErrorNote, Skeleton } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CodeStep } from "@/components/client/code-step";
import { ClientGoogleButton } from "@/components/client/client-google-button";
import { api, ApiError, errorMessage } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { readRememberedCards } from "@/lib/remembered-cards";

export interface JoinPage {
  tenant: { name: string; logoUrl: string | null; primaryColor: string; privacyPolicyUrl: string | null; country: string };
  establishment: string | null;
  program: { name: string; mode: "POINTS" | "STAMPS"; currency: string; spendStep: string; pointsPerStep: number; stampsTarget: number; terms: string; verification: "NONE" | "EMAIL_OTP" | "IN_STORE"; rewards: { name: string; cost: number }[] };
}

/** Situation du visiteur, calculée par l'API d'après la session de son compte FOVE. */
type JoinState =
  | { state: "anonymous" }
  | { state: "has_card"; cardPath: string }
  | { state: "can_join"; profile: { firstName: string; lastName: string; phone: string | null; email: string }; verified: boolean }
  | { state: "needs_confirmation"; email: string };

type Joined = { state: "joined"; cardPath: string } | { state: "code_sent"; email: string };

function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

export function JoinForm({ token, data }: { token: string; data: JoinPage }) {
  const router = useRouter();
  const t = useTranslations("public");
  const { tenant, program } = data;
  const [state, setState] = useState<JoinState | null>(null);
  const [loadError, setLoadError] = useState(false);

  const apply = useCallback(
    (next: JoinState) => {
      // Déjà une carte ici : elle s'ouvre directement.
      if (next.state === "has_card") router.replace(next.cardPath);
      else setState(next);
    },
    [router],
  );
  const load = useCallback(async () => {
    try {
      apply(await api.get<JoinState>(`/client/join/${token}`));
    } catch {
      setLoadError(true);
    }
  }, [token, apply]);
  useEffect(() => {
    let cancelled = false;
    api
      .get<JoinState>(`/client/join/${token}`)
      .then((next) => !cancelled && apply(next))
      .catch(() => !cancelled && setLoadError(true));
    return () => {
      cancelled = true;
    };
  }, [token, apply]);

  const openCard = (cardPath: string) => router.replace(`${cardPath}?new=1`);
  const rule =
    program.mode === "STAMPS"
      ? t("rules.stamps", { target: program.stampsTarget, reward: program.rewards[0]?.name ?? t("rules.defaultReward") })
      : t("rules.points", { amount: formatNumber(Number(program.spendStep)), currency: program.currency, points: program.pointsPerStep });

  return (
    <div className="min-h-dvh" style={{ ["--brand" as string]: tenant.primaryColor }}>
      <header className="px-5 pb-16 pt-10 text-white" style={{ background: "var(--brand)" }}>
        <div className="mx-auto flex max-w-md items-center gap-3">
          {tenant.logoUrl ? (
            <img src={tenant.logoUrl} alt="" className="size-14 rounded-full bg-white object-cover" />
          ) : (
            <span className="grid size-14 place-items-center rounded-full bg-white/20 font-display text-2xl font-bold">{tenant.name.slice(0, 1)}</span>
          )}
          <div>
            <p className="text-sm text-white/80">{data.establishment ?? t("join.programLabel")}</p>
            <h1 className="font-display text-2xl font-semibold leading-tight">{tenant.name}</h1>
          </div>
        </div>
      </header>
      <main id="contenu" className="mx-auto -mt-10 max-w-md px-4 pb-16">
        <div className="rounded-[var(--radius-lg)] bg-surface p-5 shadow-2 sm:p-6">
          {loadError ? (
            <ErrorNote>{t("account.loadError")}</ErrorNote>
          ) : !state ? (
            <div className="grid gap-4" aria-busy="true">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-11" />
              <Skeleton className="h-11" />
            </div>
          ) : state.state === "needs_confirmation" ? (
            <ConfirmFirst email={state.email} tenantName={tenant.name} onVerified={load} />
          ) : state.state === "can_join" ? (
            <ConnectedJoin token={token} data={data} rule={rule} state={state} onJoined={openCard} onLogout={load} />
          ) : (
            <AnonymousJoin token={token} data={data} rule={rule} onJoined={openCard} />
          )}
          {program.terms && state && state.state !== "needs_confirmation" && (
            <details className="mt-5 text-sm text-ink-2">
              <summary className="cursor-pointer font-medium text-ink">{t("join.programTerms")}</summary>
              <p className="mt-2 whitespace-pre-line">{program.terms}</p>
            </details>
          )}
        </div>
        <p className="mt-6 text-center text-xs text-ink-3">{t("join.poweredBy")}</p>
      </main>
    </div>
  );
}

/** Case d'acceptation des conditions du programme (et de la politique du commerce s'il en a une). */
function TermsCheckbox({ data, checked, onChange }: { data: JoinPage; checked: boolean; onChange: (v: boolean) => void }) {
  const t = useTranslations("public");
  const url = data.tenant.privacyPolicyUrl;
  return (
    <Checkbox
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      label={
        url
          ? t.rich("join.acceptTermsWithPrivacy", {
              link: (c) => (
                <a href={url} className="underline" target="_blank" rel="noreferrer">
                  {c}
                </a>
              ),
            })
          : t("join.acceptTerms")
      }
    />
  );
}

/** Compte non confirmé qui veut une carte chez un 2e commerce (ou reprendre une fiche existante). */
function ConfirmFirst({ email, tenantName, onVerified }: { email: string; tenantName: string; onVerified: () => Promise<void> }) {
  const t = useTranslations("public.account");
  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <h2 className="font-display text-xl font-semibold">{t("confirmTitle")}</h2>
        <p className="text-sm text-ink-2">{t("confirmText", { tenant: tenantName, email })}</p>
      </div>
      <CodeStep email={email} brand withGoogle onVerified={onVerified} />
    </div>
  );
}

/** Client connecté : rejoindre le programme en un geste, téléphone pré-rempli. */
function ConnectedJoin({
  token,
  data,
  rule,
  state,
  onJoined,
  onLogout,
}: {
  token: string;
  data: JoinPage;
  rule: string;
  state: Extract<JoinState, { state: "can_join" }>;
  onJoined: (cardPath: string) => void;
  onLogout: () => Promise<void>;
}) {
  const t = useTranslations("public");
  const { profile } = state;
  const needsName = !profile.firstName;
  const [f, setF] = useState({ firstName: "", lastName: "", phone: profile.phone ?? "", acceptTerms: false, marketingConsent: false });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ cardPath: string }>(`/client/join/${token}`, f);
      onJoined(res.cardPath);
    } catch (err) {
      // Le compte a perdu sa confirmation entre-temps (autre appareil) : on recharge la situation.
      if (err instanceof ApiError && err.code === "confirmation_required") await onLogout();
      else setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <div className="grid gap-1.5">
        <h2 className="font-display text-xl font-semibold">{t("account.joinTitle", { tenant: data.tenant.name })}</h2>
        <p className="text-ink-2">{rule}</p>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      {needsName && (
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("join.firstName")}>{(p) => <Input {...p} autoComplete="given-name" value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} />}</Field>
          <Field label={t("join.lastName")}>{(p) => <Input {...p} autoComplete="family-name" value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} />}</Field>
        </div>
      )}
      <Field label={t("join.phone")}>
        {(p) => <PhoneInput {...p} defaultCountry={data.tenant.country} value={f.phone} onChange={(phone) => setF({ ...f, phone })} />}
      </Field>
      <TermsCheckbox data={data} checked={f.acceptTerms} onChange={(acceptTerms) => setF({ ...f, acceptTerms })} />
      <Checkbox checked={f.marketingConsent} onChange={(e) => setF({ ...f, marketingConsent: e.target.checked })} label={t("join.marketingConsent", { tenant: data.tenant.name })} />
      <Button type="submit" size="lg" loading={busy} disabled={!f.phone || !f.acceptTerms || (needsName && !f.firstName)} style={{ background: "var(--brand)", color: "#fff" }}>
        {t("join.submit")}
      </Button>
      <p className="text-center text-xs text-ink-3">
        {t("account.signedInAs", { email: profile.email })} · {t("account.notYou")}{" "}
        <button
          type="button"
          className="underline underline-offset-4 hover:text-ink"
          onClick={async () => {
            await api.post("/client/auth/logout");
            await onLogout();
          }}
        >
          {t("account.logout")}
        </button>
      </p>
    </form>
  );
}

/** Visiteur non connecté : créer sa carte (et son compte FOVE), se connecter, ou retrouver une carte créée en caisse. */
function AnonymousJoin({ token, data, rule, onJoined }: { token: string; data: JoinPage; rule: string; onJoined: (cardPath: string) => void }) {
  const t = useTranslations("public");
  const { tenant, program } = data;
  // Le widget ouvre directement « Retrouver ma carte » via #retrouver.
  const wantsRecover = useSyncExternalStore(subscribeHash, () => window.location.hash === "#retrouver", () => false);
  const [tab, setTab] = useState<string | null>(null);
  // Carte déjà créée sur ce téléphone : on propose de l'ouvrir.
  const remembered = useSyncExternalStore(
    subscribeHash,
    () => readRememberedCards().find((c) => c.tenant === tenant.name && c.program === program.name)?.path ?? null,
    () => null,
  );
  const [showFormAnyway, setShowFormAnyway] = useState(false);
  const [f, setF] = useState({ firstName: "", lastName: "", phone: "", email: "", acceptTerms: false, marketingConsent: false, website: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [knownEmail, setKnownEmail] = useState<string | null>(null);
  const [recoverId, setRecoverId] = useState("");
  const [recovered, setRecovered] = useState(false);
  const loginHref = typeof window === "undefined" ? "/mes-cartes/connexion" : `/mes-cartes/connexion?next=${encodeURIComponent(window.location.pathname)}`;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<Joined>(`/client/join/${token}/signup`, {
        firstName: f.firstName,
        lastName: f.lastName,
        phone: f.phone,
        email: f.email,
        acceptTerms: f.acceptTerms,
        marketingConsent: f.marketingConsent,
        website: f.website || undefined,
      });
      if (res.state === "joined") return onJoined(res.cardPath);
      // Email déjà connu : le code prouve que c'est bien le sien avant de toucher à son compte.
      setKnownEmail(res.email);
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  };

  /** Code saisi : le téléphone est connecté au compte, la carte se crée (ou se retrouve) dedans. */
  const joinAfterCode = async () => {
    const res = await api.post<{ cardPath: string }>(`/client/join/${token}`, {
      firstName: f.firstName,
      lastName: f.lastName,
      phone: f.phone,
      acceptTerms: true,
      marketingConsent: f.marketingConsent,
    });
    onJoined(res.cardPath);
  };

  if (knownEmail) {
    return (
      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <h2 className="font-display text-xl font-semibold">{t("account.knownTitle")}</h2>
          <p className="text-sm text-ink-2">{t("account.knownText", { email: knownEmail })}</p>
        </div>
        <CodeStep email={knownEmail} alreadySent brand withGoogle onVerified={joinAfterCode} />
      </div>
    );
  }

  if (remembered && !showFormAnyway) {
    return (
      <div className="grid justify-items-center gap-4 py-3 text-center">
        <div className="grid size-16 place-items-center rounded-full bg-mint-soft text-mint">
          <Sparkles className="size-8" aria-hidden />
        </div>
        <div>
          <h2 className="font-display text-2xl font-bold text-ink">{t("join.rememberedTitle")}</h2>
          <p className="mx-auto mt-1.5 max-w-xs text-sm text-ink-2">{t.rich("join.rememberedText", { tenant: tenant.name, b: (c) => <strong>{c}</strong> })}</p>
        </div>
        <Button asChild size="lg" className="mt-2 w-full rounded-xl py-6 text-base font-semibold shadow-md" style={{ background: "var(--brand)", color: "#fff" }}>
          <a href={remembered}>
            {t("join.openCard")}
            <ArrowRight className="ms-2 size-4 rtl-flip" aria-hidden />
          </a>
        </Button>
        <div className="mt-3 w-full border-t border-line pt-4">
          <button type="button" onClick={() => setShowFormAnyway(true)} className="text-xs text-ink-3 underline underline-offset-4 transition-colors hover:text-ink">
            {t("join.createAnother")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {remembered && (
        <div className="mb-4 text-start">
          <button type="button" onClick={() => setShowFormAnyway(false)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-mint hover:underline">
            <ArrowLeft className="size-3.5 rtl-flip" aria-hidden />
            {t("join.backToSaved")}
          </button>
        </div>
      )}
      {/* Chemin principal : Google crée (ou retrouve) le compte FOVE, déjà confirmé, et revient ici. */}
      <div className="mb-5 grid gap-3">
        <ClientGoogleButton />
        <Button asChild variant="secondary" className="w-full">
          <a href={loginHref}>{t("account.haveAccount")}</a>
        </Button>
      </div>
      <Tabs value={tab ?? (wantsRecover ? "recover" : "join")} onValueChange={setTab}>
        <TabsList className="mb-5 grid w-full grid-cols-2">
          <TabsTrigger value="join">{t("join.tabJoin")}</TabsTrigger>
          <TabsTrigger value="recover">{t("join.tabRecover")}</TabsTrigger>
        </TabsList>
        <TabsContent value="join">
          <p className="mb-5 text-ink-2">{rule}</p>
          <form onSubmit={submit} className="grid gap-4" noValidate>
            {error && <ErrorNote>{error}</ErrorNote>}
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("join.firstName")}>{(p) => <Input {...p} autoComplete="given-name" value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} />}</Field>
              <Field label={t("join.lastName")}>{(p) => <Input {...p} autoComplete="family-name" value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} />}</Field>
            </div>
            <Field label={t("join.phone")}>
              {(p) => <PhoneInput {...p} defaultCountry={tenant.country} value={f.phone} onChange={(phone) => setF({ ...f, phone })} />}
            </Field>
            <Field label={t("join.email")} hint={t("account.emailHint")}>
              {(p) => <Input {...p} type="email" autoComplete="email" inputMode="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />}
            </Field>
            <div className="hidden" aria-hidden>
              <label>
                {t("join.honeypot")} <input tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} />
              </label>
            </div>
            <TermsCheckbox data={data} checked={f.acceptTerms} onChange={(acceptTerms) => setF({ ...f, acceptTerms })} />
            <Checkbox checked={f.marketingConsent} onChange={(e) => setF({ ...f, marketingConsent: e.target.checked })} label={t("join.marketingConsent", { tenant: tenant.name })} />
            <Button type="submit" size="lg" loading={busy} disabled={!f.firstName || !f.phone || !f.email || !f.acceptTerms} style={{ background: "var(--brand)", color: "#fff" }}>
              {t("join.submit")}
            </Button>
          </form>
        </TabsContent>
        <TabsContent value="recover">
          {recovered ? (
            <p role="status" className="text-ink-2">
              {t("join.recoverSent")}
            </p>
          ) : (
            <form
              className="grid gap-4"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await api.post(`/public/join/${token}/recover`, { identifier: recoverId });
                  setRecovered(true);
                } catch (err) {
                  setError(errorMessage(err));
                }
              }}
            >
              <p className="text-ink-2">{t("join.recoverIntro")}</p>
              <Field label={t("join.recoverIdentifier")}>{(p) => <Input {...p} autoComplete="email" value={recoverId} onChange={(e) => setRecoverId(e.target.value)} />}</Field>
              <Button type="submit" variant="secondary" disabled={recoverId.trim().length < 6}>
                {t("join.recoverSubmit")}
              </Button>
            </form>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}
