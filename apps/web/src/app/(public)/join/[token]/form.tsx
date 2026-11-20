"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { PhoneInput } from "@/components/ui/phone-input";
import { ErrorNote } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, ApiError, errorMessage } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { readRememberedCards } from "@/lib/remembered-cards";

export interface JoinPage {
  tenant: { name: string; logoUrl: string | null; primaryColor: string; privacyPolicyUrl: string | null; country: string };
  establishment: string | null;
  program: { name: string; mode: "POINTS" | "STAMPS"; currency: string; spendStep: string; pointsPerStep: number; stampsTarget: number; terms: string; verification: "NONE" | "EMAIL_OTP" | "IN_STORE"; rewards: { name: string; cost: number }[] };
}

function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

export function JoinForm({ token, data }: { token: string; data: JoinPage }) {
  const router = useRouter();
  const t = useTranslations("public");
  // Le widget ouvre directement « Retrouver ma carte » via #retrouver.
  const wantsRecover = useSyncExternalStore(subscribeHash, () => window.location.hash === "#retrouver", () => false);
  const [tab, setTab] = useState<string | null>(null);
  // Carte déjà créée sur ce téléphone : on propose de l'ouvrir.
  const remembered = useSyncExternalStore(
    subscribeHash,
    () => readRememberedCards().find((c) => c.tenant === data.tenant.name && c.program === data.program.name)?.path ?? null,
    () => null,
  );
  const [showFormAnyway, setShowFormAnyway] = useState(false);
  const { tenant, program } = data;
  const [f, setF] = useState({ firstName: "", lastName: "", phone: "", email: "", acceptTerms: false, marketingConsent: false, website: "" });
  const [error, setError] = useState<string | null>(null);
  const [already, setAlready] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recoverId, setRecoverId] = useState("");
  const [recovered, setRecovered] = useState(false);
  const needsEmail = program.verification === "EMAIL_OTP";
  const rule =
    program.mode === "STAMPS"
      ? t("rules.stamps", { target: program.stampsTarget, reward: program.rewards[0]?.name ?? t("rules.defaultReward") })
      : t("rules.points", { amount: formatNumber(Number(program.spendStep)), currency: program.currency, points: program.pointsPerStep });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ cardToken: string }>(`/public/join/${token}`, {
        firstName: f.firstName,
        lastName: f.lastName,
        phone: f.phone,
        email: f.email || null,
        acceptTerms: f.acceptTerms,
        marketingConsent: f.marketingConsent,
        website: f.website || undefined,
      });
      router.replace(`/card/${res.cardToken}?new=1`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "already_enrolled") setAlready(true);
      setError(errorMessage(err));
      setBusy(false);
    }
  };

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
          {remembered && !showFormAnyway ? (
            <div className="grid justify-items-center gap-4 py-3 text-center">
              <div className="grid size-16 place-items-center rounded-full bg-mint-soft text-mint">
                <Sparkles className="size-8" aria-hidden />
              </div>
              <div>
                <h2 className="font-display text-2xl font-bold text-ink">{t("join.rememberedTitle")}</h2>
                <p className="mt-1.5 text-sm text-ink-2 max-w-xs mx-auto">
                  {t.rich("join.rememberedText", { tenant: tenant.name, b: (c) => <strong>{c}</strong> })}
                </p>
              </div>

              <Button
                asChild
                size="lg"
                className="mt-2 w-full font-semibold shadow-md text-base rounded-xl py-6"
                style={{ background: "var(--brand)", color: "#fff" }}
              >
                <a href={remembered}>
                  {t("join.openCard")}
                  <ArrowRight className="size-4 ms-2 rtl-flip" aria-hidden />
                </a>
              </Button>

              <div className="mt-3 border-t border-line pt-4 w-full">
                <button
                  type="button"
                  onClick={() => setShowFormAnyway(true)}
                  className="text-xs text-ink-3 hover:text-ink underline underline-offset-4 transition-colors"
                >
                  {t("join.createAnother")}
                </button>
              </div>
            </div>
          ) : (
            <>
              {remembered && (
                <div className="mb-4 text-start">
                  <button
                    type="button"
                    onClick={() => setShowFormAnyway(false)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-mint hover:underline"
                  >
                    <ArrowLeft className="size-3.5 rtl-flip" aria-hidden />
                    {t("join.backToSaved")}
                  </button>
                </div>
              )}
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
                  {(p) => (
                    <PhoneInput
                      {...p}
                      defaultCountry={tenant.country}
                      value={f.phone}
                      onChange={(phone) => setF({ ...f, phone })}
                    />
                  )}
                </Field>
                <Field label={needsEmail ? t("join.email") : t("join.emailOptional")} hint={needsEmail ? t("join.emailCodeHint") : t("join.emailRecoverHint")}>
                  {(p) => <Input {...p} type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />}
                </Field>
                <div className="hidden" aria-hidden>
                  <label>
                    {t("join.honeypot")} <input tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} />
                  </label>
                </div>
                <Checkbox
                  checked={f.acceptTerms}
                  onChange={(e) => setF({ ...f, acceptTerms: e.target.checked })}
                  label={
                    tenant.privacyPolicyUrl
                      ? t.rich("join.acceptTermsWithPrivacy", {
                          link: (c) => (
                            <a href={tenant.privacyPolicyUrl ?? undefined} className="underline" target="_blank" rel="noreferrer">
                              {c}
                            </a>
                          ),
                        })
                      : t("join.acceptTerms")
                  }
                />
                <Checkbox checked={f.marketingConsent} onChange={(e) => setF({ ...f, marketingConsent: e.target.checked })} label={t("join.marketingConsent", { tenant: tenant.name })} />
                <Button type="submit" size="lg" loading={busy} disabled={!f.firstName || !f.phone || !f.acceptTerms || (needsEmail && !f.email)} style={{ background: "var(--brand)", color: "#fff" }}>
                  {t("join.submit")}
                </Button>
                {already && <p className="text-sm text-ink-2">{t("join.alreadyEnrolled")}</p>}
              </form>
              {program.terms && (
                <details className="mt-5 text-sm text-ink-2">
                  <summary className="cursor-pointer font-medium text-ink">{t("join.programTerms")}</summary>
                  <p className="mt-2 whitespace-pre-line">{program.terms}</p>
                </details>
              )}
            </TabsContent>
            <TabsContent value="recover">
              {recovered ? (
                <p role="status" className="text-ink-2">{t("join.recoverSent")}</p>
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
                  <Button type="submit" variant="secondary" disabled={recoverId.trim().length < 6}>{t("join.recoverSubmit")}</Button>
                </form>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
        <p className="mt-6 text-center text-xs text-ink-3">{t("join.poweredBy")}</p>
      </main>
    </div>
  );
}
