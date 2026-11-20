"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { ErrorNote, SuccessNote } from "@/components/ui/misc";
import { api, useErrorMessage } from "@/lib/api";

const RESEND_SECONDS = 60;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Page interne vers laquelle revenir après connexion (jamais un autre site). */
function safeNext(next: string | null): string {
  return next?.startsWith("/") && !next.startsWith("//") ? next : "/mes-cartes";
}

/** Connexion au compte client FOVE : email, puis code à 6 chiffres. Aucun mot de passe. */
export function ClientLogin() {
  const t = useTranslations("client.login");
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));

  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(params.get("supprime") === "1" ? t("deleted") : null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function sendCode(resend = false) {
    setError(null);
    setBusy(true);
    try {
      await api.post("/client/auth/code", { email: email.trim() });
      setStep("code");
      setCooldown(RESEND_SECONDS);
      setInfo(resend ? t("resent") : null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function onEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) return setFieldError(t("emailInvalid"));
    setFieldError(null);
    await sendCode();
  }

  async function onCode(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) return setFieldError(t("codeInvalid"));
    setFieldError(null);
    setError(null);
    setBusy(true);
    try {
      await api.post("/client/auth/verify", { email: email.trim(), code });
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mb-8 grid gap-2">
        <h1 className="font-display text-3xl font-semibold">{step === "email" ? t("title") : t("codeTitle")}</h1>
        <p className="text-ink-2">{step === "email" ? t("subtitle") : t("codeSent", { email: email.trim() })}</p>
      </div>

      {step === "email" ? (
        <form onSubmit={onEmail} className="grid gap-5" noValidate>
          {info && <SuccessNote>{info}</SuccessNote>}
          {error && <ErrorNote>{error}</ErrorNote>}
          <Field label={t("email")} hint={t("noPassword")} error={fieldError ?? undefined}>
            {(p) => (
              <Input {...p} type="email" autoComplete="email" inputMode="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
            )}
          </Field>
          <Button type="submit" loading={busy}>
            {t("sendCode")}
          </Button>
        </form>
      ) : (
        <form onSubmit={onCode} className="grid gap-5" noValidate>
          {info && <SuccessNote>{info}</SuccessNote>}
          {error && <ErrorNote>{error}</ErrorNote>}
          <Field label={t("code")} hint={t("checkSpam")} error={fieldError ?? undefined}>
            {(p) => (
              <Input
                {...p}
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
                autoFocus
                dir="ltr"
                className="text-center font-mono text-2xl tracking-[0.5em]"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            )}
          </Field>
          <Button type="submit" loading={busy}>
            {t("verify")}
          </Button>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <Button type="button" variant="link" disabled={cooldown > 0 || busy} onClick={() => sendCode(true)}>
              {cooldown > 0 ? t("resendIn", { seconds: cooldown }) : t("resend")}
            </Button>
            <Button
              type="button"
              variant="link"
              onClick={() => {
                setStep("email");
                setCode("");
                setError(null);
                setInfo(null);
                setFieldError(null);
              }}
            >
              {t("changeEmail")}
            </Button>
          </div>
        </form>
      )}
    </>
  );
}
