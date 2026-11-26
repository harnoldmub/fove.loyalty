"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { safeInternalPath } from "@fove/shared";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { ErrorNote, SuccessNote } from "@/components/ui/misc";
import { PrivacyDialog, TermsDialog } from "@/components/privacy-dialog";
import { GoogleIcon } from "@/components/google-icon";
import { BUSINESS_PREFILL_KEY } from "@/lib/signup-prefill";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useIsNativeApp } from "@/lib/native-app";
import { afterAuthPath, clearPlanChoice, rememberPlanChoice, withPlanChoice } from "@/lib/plan-choice";
import { OtpInput } from "@/components/ui/otp-input";

/** Règles de validation reprises de `@fove/shared`, avec des messages traduits. */
function rules(t: (key: string) => string) {
  return {
    name: z.string().trim().min(2, t("validation.nameRequired")),
    email: z.email(t("validation.emailInvalid")),
  };
}

/**
 * Offre choisie sur la page tarifs (`?offre=business`) : retenue pour la suite
 * du parcours, et nom affiché pour rassurer. Un visiteur déjà connecté part
 * directement au paiement.
 */
function usePlanChoice(source: "signup" | "login") {
  const router = useRouter();
  const offre = useSearchParams().get("offre");
  const [planName, setPlanName] = useState<string | null>(null);
  useEffect(() => {
    if (offre) rememberPlanChoice(offre);
    // « Commencer » (Gratuit) mène à l'inscription sans offre : on oublie un ancien choix.
    else if (source === "signup") clearPlanChoice();
    if (!offre) return;
    let cancelled = false;
    api
      .get<{ code: string; name: string; kind: string }[]>("/plans")
      .then((plans) => {
        const plan = plans.find((p) => p.code === offre && p.kind === "PAID");
        if (!cancelled && plan) setPlanName(plan.name);
      })
      .catch(() => undefined);
    api
      .get("/auth/me")
      .then(() => !cancelled && router.replace(afterAuthPath()))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [offre, source, router]);
  return { offre, planName };
}

function Heading({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-8 grid gap-2">
      <h1 className="font-display text-3xl font-semibold">{title}</h1>
      {children && <p className="text-ink-2">{children}</p>}
    </div>
  );
}

function GoogleLogin({ next }: { next: string }) {
  const t = useTranslations("auth.google");
  const tAuth = useTranslations("auth");
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    api.get<{ google: boolean }>("/auth/providers").then((providers) => setEnabled(providers.google)).catch(() => undefined);
  }, []);
  if (!enabled) return null;

  return (
    <div className="mb-5 grid gap-5">
      <a
        href={`/api/auth/google?next=${encodeURIComponent(next)}`}
        className="flex min-h-11 items-center justify-center gap-3 rounded-md border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink shadow-1 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cobalt focus-visible:ring-offset-2"
      >
        <GoogleIcon />
        {t("continue")}
      </a>
      {/* Google peut créer un compte depuis la connexion comme depuis l'inscription : la mention suit le bouton. */}
      <p className="-mt-3 text-xs leading-5 text-ink-3">{tAuth.rich("signup.googleTerms", { terms: () => <TermsDialog />, privacy: () => <PrivacyDialog /> })}</p>
      <div className="flex items-center gap-3 text-xs text-ink-3" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        {t("orEmail")}
        <span className="h-px flex-1 bg-line" />
      </div>
    </div>
  );
}

/**
 * Connexion et inscription sans mot de passe (docs/chantier-connexion-otp.md) : email, code à 6 chiffres
 * reçu par email, puis, pour un nouveau compte, nom et acceptation des conditions.
 */
function CodeAuth({
  mode,
  next,
  afterSignup,
  adminHome = false,
  initialName = "",
  initialEmail = "",
}: {
  mode: "login" | "signup";
  /** Destination d'un compte existant. */
  next: string;
  /** Destination d'un compte créé : la création du commerce, sauf retour demandé (invitation…). */
  afterSignup: string;
  /** Sans destination particulière : un admin FOVE arrive dans l'administration. */
  adminHome?: boolean;
  initialName?: string;
  initialEmail?: string;
}) {
  const router = useRouter();
  const t = useTranslations("auth");
  const [step, setStep] = useState<"email" | "code" | "profile">("email");
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [name, setName] = useState(initialName);
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const sendCode = async (resend = false) => {
    setError(null);
    setNotice(null);
    if (!rules(t).email.safeParse(email.trim()).success) return setError(t("validation.emailInvalid"));
    setBusy(true);
    try {
      await api.post("/auth/code", { email: email.trim() });
      setStep("code");
      if (resend) setNotice(t("code.resent"));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (withProfile: boolean) => {
    setError(null);
    if (!/^\d{6}$/.test(code.trim())) return setError(t("validation.codeInvalid"));
    if (withProfile) {
      if (!rules(t).name.safeParse(name).success) return setError(t("validation.nameRequired"));
      if (!terms) return setError(t("validation.acceptTerms"));
    }
    setBusy(true);
    try {
      const res = await api.post<{ status: "signed_in" | "profile_required"; created?: boolean; admin?: boolean }>("/auth/code/verify", {
        email: email.trim(),
        code: code.trim(),
        ...(withProfile ? { name: name.trim(), acceptTerms: true } : {}),
      });
      if (res.status === "profile_required") {
        setStep("profile");
        return;
      }
      setLeaving(true);
      router.replace(res.created ? afterSignup : res.admin && adminHome ? "/admin" : next);
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-5">
      {error && <ErrorNote>{error}</ErrorNote>}
      {notice && <SuccessNote>{notice}</SuccessNote>}
      {step === "email" && (
        <form
          className="grid gap-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void sendCode();
          }}
        >
          <Field label={mode === "signup" ? t("fields.workEmail") : t("fields.email")} hint={t("code.emailHelp")}>
            {(p) => <Input {...p} type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
          </Field>
          <Button type="submit" loading={busy}>{t("code.send")}</Button>
        </form>
      )}
      {step !== "email" && (
        <form
          className="grid gap-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void verify(step === "profile");
          }}
        >
          <p className="text-center text-sm text-ink-2">{t("code.sentTo", { email: email.trim() })}</p>
          <Field label={t("code.label")} className="text-center">
            {(p) => (
              <OtpInput {...p} value={code} onChange={setCode} autoFocus={step === "code"} />
            )}
          </Field>
          {step === "profile" && (
            <>
              <p className="text-sm text-ink-2">{t("code.profileText")}</p>
              <Field label={t("fields.yourName")}>{(p) => <Input {...p} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />}</Field>
              <Checkbox
                checked={terms}
                onChange={(e) => setTerms(e.target.checked)}
                label={t.rich("signup.acceptTerms", { terms: () => <TermsDialog />, privacy: () => <PrivacyDialog /> })}
              />
            </>
          )}
          <Button type="submit" loading={busy || leaving}>
            {leaving ? (mode === "signup" ? t("signup.leaving") : t("login.leaving")) : step === "profile" ? t("code.create") : t("code.verify")}
          </Button>
          <div className="flex flex-wrap justify-between gap-3 text-sm">
            <button type="button" className="text-cobalt hover:underline" disabled={busy} onClick={() => void sendCode(true)}>{t("code.resend")}</button>
            <button
              type="button"
              className="text-ink-2 hover:text-ink"
              onClick={() => {
                setStep("email");
                setCode("");
                setError(null);
                setNotice(null);
              }}
            >
              {t("code.changeEmail")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const oauthError = searchParams.get("oauth_error");
  const native = useIsNativeApp();
  const { offre, planName } = usePlanChoice("login");
  const t = useTranslations("auth");
  return (
    <>
      <Heading title={t("login.title")}>
        {planName ? t("login.subtitleWithPlan", { plan: planName }) : t("login.subtitle")}
      </Heading>
      <GoogleLogin next={safeInternalPath(next, afterAuthPath())} />
      {oauthError && <div className="mb-5"><ErrorNote>{t("login.oauthError")}</ErrorNote></div>}
      <CodeAuth
        mode="login"
        next={safeInternalPath(next, afterAuthPath())}
        afterSignup={next ? safeInternalPath(next, "/onboarding") : "/onboarding"}
        // Un admin FOVE arrive dans l'administration, même avec une offre retenue depuis la page tarifs
        // (il paie depuis l'espace commerçant, ouvert à côté) ; seule une destination explicite l'emporte.
        adminHome={!next}
        initialEmail={(searchParams.get("email") ?? "").slice(0, 120)}
      />
      {!native && (
        <p className="mt-6 text-sm text-ink-2">
          <Link href={withPlanChoice("/signup", offre)} className="hover:text-ink">{t("login.noAccount")}</Link>
        </p>
      )}
    </>
  );
}

export function SignupForm() {
  const searchParams = useSearchParams();
  const { offre, planName } = usePlanChoice("signup");
  const t = useTranslations("auth");

  // Lien de parrainage (ref) et lien d'inscription d'un partenaire (nom, email, nom du commerce).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const business = params.get("business");
    if (business) {
      try {
        localStorage.setItem(BUSINESS_PREFILL_KEY, business.slice(0, 80));
      } catch {
        // Stockage indisponible : le commerçant saisira le nom de son commerce.
      }
    }
    const ref = params.get("ref");
    if (ref) {
      const maxAge = 30 * 24 * 3600;
      document.cookie = `fove_ref=${encodeURIComponent(ref.trim().toLowerCase())}; path=/; max-age=${maxAge}; SameSite=Lax`;
      // Date du clic : face à un lien partenaire, le premier lien cliqué l'emporte.
      document.cookie = `fove_ref_at=${Date.now()}; path=/; max-age=${maxAge}; SameSite=Lax`;
    }
  }, []);

  return (
    <>
      <Heading title={t("signup.title")}>
        {planName ? t("signup.subtitleWithPlan", { plan: planName }) : t("signup.subtitle")}
      </Heading>
      <GoogleLogin next={afterAuthPath()} />
      <CodeAuth
        mode="signup"
        next={afterAuthPath()}
        afterSignup="/onboarding"
        initialName={(searchParams.get("name") ?? "").slice(0, 80)}
        initialEmail={(searchParams.get("email") ?? "").slice(0, 120)}
      />
      <p className="mt-6 text-sm text-ink-2">
        {t("signup.alreadyRegistered")} <Link href={withPlanChoice("/login", offre)} className="text-cobalt hover:underline">{t("actions.login")}</Link>
      </p>
    </>
  );
}

interface InvitePreview {
  email: string;
  tenantName: string;
  role: string;
  hasAccount: boolean;
}

const ROLES = new Set(["OWNER", "MANAGER", "CASHIER", "VIEWER"]);

export function AcceptInvite() {
  const token = useSearchParams().get("token") ?? "";
  const router = useRouter();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = useTranslations("auth");
  const schema = useMemo(() => z.object({ name: rules(t).name }), [t]);
  const form = useForm<{ name: string }>({ resolver: zodResolver(schema) });

  useEffect(() => {
    api.get<InvitePreview>(`/auth/invitations/preview?token=${encodeURIComponent(token)}`).then(setPreview).catch((e) => setError(errorMessage(e)));
  }, [token]);

  // Le lien reçu par email prouve l'adresse : pas de mot de passe ; un compte existant est connecté.
  const accept = async (values?: { name: string }) => {
    setError(null);
    try {
      await api.post("/auth/invitations/accept", { token, ...values });
      router.replace("/app");
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) setError(t("invite.wrongAccount"));
      else setError(errorMessage(e));
    }
  };

  if (!preview) return error ? <ErrorNote>{error}</ErrorNote> : <Heading title={t("invite.loading")} />;

  return (
    <>
      <Heading title={t("invite.title", { tenant: preview.tenantName })}>
        {t("invite.subtitle", { role: ROLES.has(preview.role) ? t(`invite.roles.${preview.role}`) : preview.role, email: preview.email })}
      </Heading>
      {error && <div className="mb-5"><ErrorNote>{error}</ErrorNote></div>}
      {preview.hasAccount ? (
        <div className="grid gap-3">
          <Button onClick={() => accept()}>{t("invite.accept")}</Button>
        </div>
      ) : (
        <form onSubmit={form.handleSubmit(accept)} className="grid gap-5" noValidate>
          <Field label={t("fields.yourName")} error={form.formState.errors.name?.message}>
            {(p) => <Input {...p} autoComplete="name" {...form.register("name")} />}
          </Field>
          <Button type="submit" loading={form.formState.isSubmitting}>{t("invite.submit")}</Button>
        </form>
      )}
    </>
  );
}
