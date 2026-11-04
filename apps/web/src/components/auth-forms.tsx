"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { loginSchema, password as passwordRule } from "@fove/shared";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { ErrorNote, SuccessNote } from "@/components/ui/misc";
import { PrivacyDialog, TermsDialog } from "@/components/privacy-dialog";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useIsNativeApp } from "@/lib/native-app";
import { afterAuthPath, clearPlanChoice, rememberPlanChoice, withPlanChoice } from "@/lib/plan-choice";

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

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const isResetSuccess = searchParams.get("reset") === "1";
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const native = useIsNativeApp();
  const { offre, planName } = usePlanChoice("login");
  const form = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await api.post("/auth/login", values);
      setLeaving(true);
      router.replace(next?.startsWith("/") && !next.startsWith("//") ? next : afterAuthPath());
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <>
      <Heading title="Connexion">
        {planName ? `Connectez-vous pour activer l’offre ${planName} : le paiement suit.` : "Accédez à l’espace de votre commerce."}
      </Heading>
      <form onSubmit={onSubmit} className="grid gap-5" noValidate>
        {isResetSuccess && (
          <SuccessNote>Votre mot de passe a bien été mis à jour. Vous pouvez vous connecter.</SuccessNote>
        )}
        {error && <ErrorNote>{error}</ErrorNote>}
        <Field label="Email" error={form.formState.errors.email?.message}>
          {(p) => <Input {...p} type="email" autoComplete="email" inputMode="email" {...form.register("email")} />}
        </Field>
        <Field label="Mot de passe" error={form.formState.errors.password?.message}>
          {(p) => <Input {...p} type="password" autoComplete="current-password" {...form.register("password")} />}
        </Field>
        <Button type="submit" loading={form.formState.isSubmitting || leaving}>{leaving ? "Ouverture de votre espace…" : "Se connecter"}</Button>
      </form>
      <div className="mt-6 flex flex-wrap justify-between gap-3 text-sm">
        <Link href="/forgot-password" className="text-cobalt hover:underline">Mot de passe oublié</Link>
        {!native && <Link href={withPlanChoice("/signup", offre)} className="text-ink-2 hover:text-ink">Pas encore de compte ? Créer un compte</Link>}
      </div>
    </>
  );
}

const signupForm = z.object({
  name: z.string().trim().min(2, "Indiquez votre nom"),
  email: z.email("Email invalide"),
  password: passwordRule,
  acceptTerms: z.boolean().refine((v) => v, "Vous devez accepter les conditions"),
});

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
      <Heading title="Créer votre compte">
        {planName
          ? `Vous avez choisi l’offre ${planName}. Créez votre compte et votre commerce, puis réglez votre abonnement.`
          : "Gratuit jusqu’à 100 clients, sans carte bancaire. Votre programme est prêt en quelques minutes."}
      </Heading>
      <form onSubmit={onSubmit} className="grid gap-5" noValidate>
        {error && <ErrorNote>{error}</ErrorNote>}
        <Field label="Votre nom" error={e.name?.message}>
          {(p) => <Input {...p} autoComplete="name" {...form.register("name")} />}
        </Field>
        <Field label="Email professionnel" error={e.email?.message}>
          {(p) => <Input {...p} type="email" autoComplete="email" inputMode="email" {...form.register("email")} />}
        </Field>
        <Field label="Mot de passe" hint="10 caractères minimum, avec au moins une lettre et un chiffre." error={e.password?.message}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" {...form.register("password")} />}
        </Field>
        <div className="grid gap-1.5">
          <Checkbox
            {...form.register("acceptTerms")}
            label={
              <>
                J’accepte les <TermsDialog /> et la <PrivacyDialog />.
              </>
            }
          />
          {e.acceptTerms && <p className="text-sm text-danger">{e.acceptTerms.message}</p>}
        </div>
        <Button type="submit" loading={form.formState.isSubmitting || leaving}>{leaving ? "Préparation de votre espace…" : "Créer mon compte"}</Button>
      </form>
      <p className="mt-6 text-sm text-ink-2">
        Déjà inscrit ? <Link href={withPlanChoice("/login", offre)} className="text-cobalt hover:underline">Se connecter</Link>
      </p>
    </>
  );
}

export function ForgotForm() {
  const [sent, setSent] = useState(false);
  const form = useForm<{ email: string }>({ resolver: zodResolver(z.object({ email: z.email("Email invalide") })) });
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
        <Heading title="Vérifiez votre boîte mail">
          Si un compte existe pour cette adresse, un email avec un lien de réinitialisation sécurisé vient d’être envoyé. Pensez à vérifier vos courriers indésirables (spams). Le lien est valable 1 heure.
        </Heading>
        <Button asChild variant="secondary">
          <Link href="/login">Retour à la connexion</Link>
        </Button>
      </div>
    );
  }
  return (
    <>
      <Heading title="Mot de passe oublié">Indiquez votre email, nous vous envoyons un lien pour en choisir un nouveau.</Heading>
      <form onSubmit={onSubmit} className="grid gap-5" noValidate>
        {error && <ErrorNote>{error}</ErrorNote>}
        <Field label="Email" error={form.formState.errors.email?.message}>
          {(p) => <Input {...p} type="email" autoComplete="email" {...form.register("email")} />}
        </Field>
        <Button type="submit" loading={form.formState.isSubmitting}>Envoyer le lien</Button>
      </form>
      <div className="mt-6 text-center text-sm">
        <Link href="/login" className="text-ink-2 hover:text-ink">Retour à la connexion</Link>
      </div>
    </>
  );
}

export function ResetForm() {
  const token = useSearchParams().get("token")?.trim() ?? "";
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isTokenError, setIsTokenError] = useState(false);
  const form = useForm<{ password: string }>({ resolver: zodResolver(z.object({ password: passwordRule })) });

  if (!token) {
    return (
      <div className="grid gap-6">
        <Heading title="Lien manquant ou incomplet">
          Le lien de réinitialisation est incomplet ou invalide. Pour définir un nouveau mot de passe, demandez un lien depuis la page dédiée.
        </Heading>
        <div className="grid gap-3">
          <Button asChild>
            <Link href="/forgot-password">Demander un nouveau lien</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/login">Retour à la connexion</Link>
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
        setError("Ce lien a expiré (durée de validité : 1 heure) ou a déjà été utilisé.");
      } else {
        setError(errorMessage(e));
      }
    }
  });

  return (
    <>
      <Heading title="Nouveau mot de passe">Vos autres sessions seront déconnectées.</Heading>
      <form onSubmit={onSubmit} className="grid gap-5" noValidate>
        {error && (
          <div className="grid gap-3">
            <ErrorNote>{error}</ErrorNote>
            {isTokenError && (
              <Button asChild variant="secondary" size="sm">
                <Link href="/forgot-password">Demander un nouveau lien</Link>
              </Button>
            )}
          </div>
        )}
        <Field label="Nouveau mot de passe" hint="10 caractères minimum, avec au moins une lettre et un chiffre." error={form.formState.errors.password?.message}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" {...form.register("password")} />}
        </Field>
        <Button type="submit" loading={form.formState.isSubmitting}>Enregistrer le mot de passe</Button>
      </form>
      <div className="mt-6 text-center text-sm">
        <Link href="/login" className="text-ink-2 hover:text-ink">Retour à la connexion</Link>
      </div>
    </>
  );
}

export function VerifyEmail() {
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<"pending" | "ok" | "error">("pending");
  const [message, setMessage] = useState("");
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
  if (state === "pending") return <Heading title="Vérification en cours" />;
  if (state === "error") {
    return (
      <>
        <Heading title="Lien invalide">{message} Depuis votre tableau de bord, vous pouvez demander un nouveau lien.</Heading>
        <Button asChild variant="secondary"><Link href="/app">Ouvrir mon espace</Link></Button>
      </>
    );
  }
  return (
    <>
      <Heading title="Email confirmé">Votre adresse est vérifiée. Vous pouvez activer l’abonnement et les intégrations.</Heading>
      <Button asChild><Link href="/app">Ouvrir mon espace</Link></Button>
    </>
  );
}

interface InvitePreview {
  email: string;
  tenantName: string;
  role: string;
  hasAccount: boolean;
}

const ROLE_FR: Record<string, string> = { OWNER: "propriétaire", MANAGER: "manager", CASHIER: "caissier", VIEWER: "lecteur" };

export function AcceptInvite() {
  const token = useSearchParams().get("token") ?? "";
  const router = useRouter();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<{ name: string; password: string }>({
    resolver: zodResolver(z.object({ name: z.string().trim().min(2, "Indiquez votre nom"), password: passwordRule })),
  });

  useEffect(() => {
    api.get<InvitePreview>(`/auth/invitations/preview?token=${encodeURIComponent(token)}`).then(setPreview).catch((e) => setError(errorMessage(e)));
  }, [token]);

  const accept = async (values?: { name: string; password: string }) => {
    setError(null);
    try {
      await api.post("/auth/invitations/accept", { token, ...values });
      router.replace("/app");
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) setError("Connectez-vous avec l’adresse invitée, puis rouvrez ce lien.");
      else setError(errorMessage(e));
    }
  };

  if (!preview) return error ? <ErrorNote>{error}</ErrorNote> : <Heading title="Chargement de l’invitation" />;

  return (
    <>
      <Heading title={`Rejoindre ${preview.tenantName}`}>
        Vous êtes invité(e) comme {ROLE_FR[preview.role] ?? preview.role} avec l’adresse {preview.email}.
      </Heading>
      {error && <div className="mb-5"><ErrorNote>{error}</ErrorNote></div>}
      {preview.hasAccount ? (
        <div className="grid gap-3">
          <Button onClick={() => accept()}>Accepter l’invitation</Button>
          <Button asChild variant="secondary">
            <Link href={`/login?next=${encodeURIComponent(`/invite?token=${token}`)}`}>Me connecter d’abord</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={form.handleSubmit(accept)} className="grid gap-5" noValidate>
          <Field label="Votre nom" error={form.formState.errors.name?.message}>
            {(p) => <Input {...p} autoComplete="name" {...form.register("name")} />}
          </Field>
          <Field label="Choisissez un mot de passe" hint="10 caractères minimum, avec au moins une lettre et un chiffre." error={form.formState.errors.password?.message}>
            {(p) => <Input {...p} type="password" autoComplete="new-password" {...form.register("password")} />}
          </Field>
          <Button type="submit" loading={form.formState.isSubmitting}>Créer mon accès</Button>
        </form>
      )}
    </>
  );
}
