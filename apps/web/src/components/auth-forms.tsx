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
import { api, ApiError, errorMessage } from "@/lib/api";
import { useIsNativeApp } from "@/lib/native-app";
import { afterAuthPath, clearPlanChoice, rememberPlanChoice, withPlanChoice } from "@/lib/plan-choice";

/** Règles de validation reprises de `@fove/shared`, avec des messages traduits. */
function rules(t: (key: string) => string) {
  return {
    name: z.string().trim().min(2, t("validation.nameRequired")),
    email: z.email(t("validation.emailInvalid")),
    password: z
      .string()
      .min(10, t("validation.passwordMin"))
      .max(200)
      .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), t("validation.passwordLetterDigit")),
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

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const isResetSuccess = searchParams.get("reset") === "1";
  const oauthError = searchParams.get("oauth_error");
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const native = useIsNativeApp();
  const { offre, planName } = usePlanChoice("login");
  const t = useTranslations("auth");
  const loginSchema = useMemo(
    () => z.object({ email: z.email(t("validation.emailInvalid")), password: z.string().min(1, t("validation.passwordRequired")).max(200) }),
    [t],
  );
  const form = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await api.post("/auth/login", values);
      setLeaving(true);
      router.replace(safeInternalPath(next, afterAuthPath()));
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <>
      <Heading title={t("login.title")}>
        {planName ? t("login.subtitleWithPlan", { plan: planName }) : t("login.subtitle")}
      </Heading>
      <GoogleLogin next={safeInternalPath(next, afterAuthPath())} />
      <form onSubmit={onSubmit} className="grid gap-5" noValidate>
        {isResetSuccess && (
          <SuccessNote>{t("login.resetSuccess")}</SuccessNote>
        )}
        {error && <ErrorNote>{error}</ErrorNote>}
        {oauthError && <ErrorNote>{t("login.oauthError")}</ErrorNote>}
        <Field label={t("fields.email")} error={form.formState.errors.email?.message}>
          {(p) => <Input {...p} type="email" autoComplete="email" inputMode="email" {...form.register("email")} />}
        </Field>
        <Field label={t("fields.password")} error={form.formState.errors.password?.message}>
          {(p) => <Input {...p} type="password" autoComplete="current-password" {...form.register("password")} />}
        </Field>
        <Button type="submit" loading={form.formState.isSubmitting || leaving}>{leaving ? t("login.leaving") : t("actions.login")}</Button>
      </form>
      <div className="mt-6 flex flex-wrap justify-between gap-3 text-sm">
        <Link href="/forgot-password" className="text-cobalt hover:underline">{t("login.forgot")}</Link>
        {!native && <Link href={withPlanChoice("/signup", offre)} className="text-ink-2 hover:text-ink">{t("login.noAccount")}</Link>}
      </div>
    </>
  );
}

export function SignupForm() {
  const router = useRouter();
  const { offre, planName } = usePlanChoice("signup");
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  // Mémorisation du commerçant parrain (ref) s'il est présent dans l'URL
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) {
      document.cookie = `fove_ref=${encodeURIComponent(ref.trim().toLowerCase())}; path=/; max-age=${30 * 24 * 3600}; SameSite=Lax`;
    }
  }, []);

  const t = useTranslations("auth");
  const signupForm = useMemo(
    () => z.object({ ...rules(t), acceptTerms: z.boolean().refine((v) => v, t("validation.acceptTerms")) }),
    [t],
  );
  const form = useForm<z.infer<typeof signupForm>>({ resolver: zodResolver(signupForm), defaultValues: { acceptTerms: false } });
  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await api.post("/auth/signup", values);
      setLeaving(true);
      router.replace("/onboarding");
    } catch (e) {
      setError(errorMessage(e));
    }
  });
  const e = form.formState.errors;
  return (
    <>
      <Heading title={t("signup.title")}>
        {planName ? t("signup.subtitleWithPlan", { plan: planName }) : t("signup.subtitle")}
      </Heading>
      <GoogleLogin next={afterAuthPath()} />
      <form onSubmit={onSubmit} className="grid gap-5" noValidate>
        {error && <ErrorNote>{error}</ErrorNote>}
        <Field label={t("fields.yourName")} error={e.name?.message}>
          {(p) => <Input {...p} autoComplete="name" {...form.register("name")} />}
        </Field>
        <Field label={t("fields.workEmail")} error={e.email?.message}>
          {(p) => <Input {...p} type="email" autoComplete="email" inputMode="email" {...form.register("email")} />}
        </Field>
        <Field label={t("fields.password")} hint={t("fields.passwordHint")} error={e.password?.message}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" {...form.register("password")} />}
        </Field>
        <div className="grid gap-1.5">
          <Checkbox
            {...form.register("acceptTerms")}
            label={t.rich("signup.acceptTerms", { terms: () => <TermsDialog />, privacy: () => <PrivacyDialog /> })}
          />
          {e.acceptTerms && <p className="text-sm text-danger">{e.acceptTerms.message}</p>}
        </div>
        <Button type="submit" loading={form.formState.isSubmitting || leaving}>{leaving ? t("signup.leaving") : t("signup.submit")}</Button>
      </form>
      <p className="mt-6 text-sm text-ink-2">
        {t("signup.alreadyRegistered")} <Link href={withPlanChoice("/login", offre)} className="text-cobalt hover:underline">{t("actions.login")}</Link>
      </p>
    </>
  );
}

export function ForgotForm() {
  const [sent, setSent] = useState(false);
  const t = useTranslations("auth");
  const schema = useMemo(() => z.object({ email: rules(t).email }), [t]);
  const form = useForm<{ email: string }>({ resolver: zodResolver(schema) });
  const [error, setError] = useState<string | null>(null);
  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await api.post("/auth/forgot-password", values);
      setSent(true);
    } catch (e) {
      setError(errorMessage(e));
    }
  });
  if (sent) {
    return (
      <div className="grid gap-6">
        <Heading title={t("forgot.sentTitle")}>{t("forgot.sentText")}</Heading>
        <Button asChild variant="secondary">
          <Link href="/login">{t("actions.backToLogin")}</Link>
        </Button>
      </div>
    );
  }
  return (
    <>
      <Heading title={t("forgot.title")}>{t("forgot.subtitle")}</Heading>
      <form onSubmit={onSubmit} className="grid gap-5" noValidate>
        {error && <ErrorNote>{error}</ErrorNote>}
        <Field label={t("fields.email")} error={form.formState.errors.email?.message}>
          {(p) => <Input {...p} type="email" autoComplete="email" {...form.register("email")} />}
        </Field>
        <Button type="submit" loading={form.formState.isSubmitting}>{t("forgot.submit")}</Button>
      </form>
      <div className="mt-6 text-center text-sm">
        <Link href="/login" className="text-ink-2 hover:text-ink">{t("actions.backToLogin")}</Link>
      </div>
    </>
  );
}

export function ResetForm() {
  const token = useSearchParams().get("token")?.trim() ?? "";
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isTokenError, setIsTokenError] = useState(false);
  const t = useTranslations("auth");
  const schema = useMemo(() => z.object({ password: rules(t).password }), [t]);
  const form = useForm<{ password: string }>({ resolver: zodResolver(schema) });

  if (!token) {
    return (
      <div className="grid gap-6">
        <Heading title={t("reset.missingTitle")}>{t("reset.missingText")}</Heading>
        <div className="grid gap-3">
          <Button asChild>
            <Link href="/forgot-password">{t("actions.requestNewLink")}</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/login">{t("actions.backToLogin")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  const onSubmit = form.handleSubmit(async ({ password }) => {
    setError(null);
    setIsTokenError(false);
    try {
      await api.post("/auth/reset-password", { token, password });
      router.replace("/login?reset=1");
    } catch (e) {
      if (e instanceof ApiError && (e.code === "invalid_token" || e.status === 400)) {
        setIsTokenError(true);
        setError(t("reset.expired"));
      } else {
        setError(errorMessage(e));
      }
    }
  });

  return (
    <>
      <Heading title={t("reset.title")}>{t("reset.subtitle")}</Heading>
      <form onSubmit={onSubmit} className="grid gap-5" noValidate>
        {error && (
          <div className="grid gap-3">
            <ErrorNote>{error}</ErrorNote>
            {isTokenError && (
              <Button asChild variant="secondary" size="sm">
                <Link href="/forgot-password">{t("actions.requestNewLink")}</Link>
              </Button>
            )}
          </div>
        )}
        <Field label={t("fields.newPassword")} hint={t("fields.passwordHint")} error={form.formState.errors.password?.message}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" {...form.register("password")} />}
        </Field>
        <Button type="submit" loading={form.formState.isSubmitting}>{t("reset.submit")}</Button>
      </form>
      <div className="mt-6 text-center text-sm">
        <Link href="/login" className="text-ink-2 hover:text-ink">{t("actions.backToLogin")}</Link>
      </div>
    </>
  );
}

export function VerifyEmail() {
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<"pending" | "ok" | "error">("pending");
  const [message, setMessage] = useState("");
  const t = useTranslations("auth");
  useEffect(() => {
    let cancelled = false;
    api
      .post("/auth/verify-email", { token })
      .then(() => !cancelled && setState("ok"))
      .catch((e) => {
        if (cancelled) return;
        setState("error");
        setMessage(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [token]);
  if (state === "pending") return <Heading title={t("verify.pending")} />;
  if (state === "error") {
    return (
      <>
        <Heading title={t("verify.errorTitle")}>{t("verify.errorText", { message })}</Heading>
        <Button asChild variant="secondary"><Link href="/app">{t("actions.openSpace")}</Link></Button>
      </>
    );
  }
  return (
    <>
      <Heading title={t("verify.successTitle")}>{t("verify.successText")}</Heading>
      <Button asChild><Link href="/app">{t("actions.openSpace")}</Link></Button>
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
  const schema = useMemo(() => {
    const { name, password } = rules(t);
    return z.object({ name, password });
  }, [t]);
  const form = useForm<{ name: string; password: string }>({ resolver: zodResolver(schema) });

  useEffect(() => {
    api.get<InvitePreview>(`/auth/invitations/preview?token=${encodeURIComponent(token)}`).then(setPreview).catch((e) => setError(errorMessage(e)));
  }, [token]);

  const accept = async (values?: { name: string; password: string }) => {
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
          <Button asChild variant="secondary">
            <Link href={`/login?next=${encodeURIComponent(`/invite?token=${token}`)}`}>{t("invite.loginFirst")}</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={form.handleSubmit(accept)} className="grid gap-5" noValidate>
          <Field label={t("fields.yourName")} error={form.formState.errors.name?.message}>
            {(p) => <Input {...p} autoComplete="name" {...form.register("name")} />}
          </Field>
          <Field label={t("fields.choosePassword")} hint={t("fields.passwordHint")} error={form.formState.errors.password?.message}>
            {(p) => <Input {...p} type="password" autoComplete="new-password" {...form.register("password")} />}
          </Field>
          <Button type="submit" loading={form.formState.isSubmitting}>{t("invite.submit")}</Button>
        </form>
      )}
    </>
  );
}
