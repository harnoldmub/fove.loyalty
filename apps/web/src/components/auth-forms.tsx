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
import { ErrorNote } from "@/components/ui/misc";
import { PrivacyDialog, TermsDialog } from "@/components/privacy-dialog";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useIsNativeApp } from "@/lib/native-app";

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
  const next = useSearchParams().get("next");
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const native = useIsNativeApp();
  const form = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await api.post("/auth/login", values);
      setLeaving(true);
      router.replace(next?.startsWith("/") && !next.startsWith("//") ? next : "/app");
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <>
      <Heading title="Connexion">Accédez à l’espace de votre commerce.</Heading>
      <form onSubmit={onSubmit} className="grid gap-5" noValidate>
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
        {!native && <Link href="/signup" className="text-ink-2 hover:text-ink">Pas encore de compte ? Créer un compte</Link>}
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
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
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
      <Heading title="Créer votre compte">Essai gratuit, sans carte bancaire. Votre programme est prêt en quelques minutes.</Heading>
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
        Déjà inscrit ? <Link href="/login" className="text-cobalt hover:underline">Se connecter</Link>
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
      <Heading title="Vérifiez votre boîte mail">
        Si un compte existe pour cette adresse, un lien de réinitialisation vient d’être envoyé. Il est valable une heure.
      </Heading>
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
    </>
  );
}

export function ResetForm() {
  const token = useSearchParams().get("token") ?? "";
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<{ password: string }>({ resolver: zodResolver(z.object({ password: passwordRule })) });
  const onSubmit = form.handleSubmit(async ({ password }) => {
    setError(null);
    try {
      await api.post("/auth/reset-password", { token, password });
      router.replace("/login?reset=1");
    } catch (e) {
      setError(errorMessage(e));
    }
  });
  return (
    <>
      <Heading title="Nouveau mot de passe">Vos autres sessions seront déconnectées.</Heading>
      <form onSubmit={onSubmit} className="grid gap-5" noValidate>
        {error && <ErrorNote>{error}</ErrorNote>}
        <Field label="Nouveau mot de passe" hint="10 caractères minimum, avec au moins une lettre et un chiffre." error={form.formState.errors.password?.message}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" {...form.register("password")} />}
        </Field>
        <Button type="submit" loading={form.formState.isSubmitting}>Enregistrer le mot de passe</Button>
      </form>
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
