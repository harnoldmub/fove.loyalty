"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { ErrorNote, SuccessNote } from "@/components/ui/misc";
import { api, useErrorMessage } from "@/lib/api";
import { ClientGoogleButton } from "@/components/client/client-google-button";

const RESEND_SECONDS = 60;

/**
 * Confirmation d'un email du compte FOVE par code à 6 chiffres : envoi, saisie, renvoi.
 * Un code juste connecte ce téléphone au compte (et confirme l'email), puis `onVerified`.
 */
export function CodeStep({
  email,
  alreadySent = false,
  brand,
  withGoogle = false,
  onVerified,
}: {
  email: string;
  /** Le code vient de partir (inscription avec un email connu) : on passe directement à la saisie. */
  alreadySent?: boolean;
  /** Couleur du commerce pour le bouton principal. */
  brand?: boolean;
  /** Propose d'abord « Continuer avec Google », qui confirme l'email sans code. */
  withGoogle?: boolean;
  onVerified: () => Promise<void> | void;
}) {
  const t = useTranslations("client.login");
  const errorMessage = useErrorMessage();
  const [sent, setSent] = useState(alreadySent);
  const [cooldown, setCooldown] = useState(alreadySent ? RESEND_SECONDS : 0);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const brandStyle = brand ? { background: "var(--brand)", color: "#fff" } : undefined;

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function send() {
    setError(null);
    setBusy(true);
    try {
      await api.post("/client/auth/code", { email });
      setInfo(sent ? t("resent") : null);
      setSent(true);
      setCooldown(RESEND_SECONDS);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) return setError(t("codeInvalid"));
    setError(null);
    setBusy(true);
    try {
      await api.post("/client/auth/verify", { email, code });
      await onVerified();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const google = withGoogle && <ClientGoogleButton />;

  if (!sent) {
    return (
      <div className="grid gap-4">
        {google}
        {error && <ErrorNote>{error}</ErrorNote>}
        <Button size="lg" loading={busy} onClick={send} style={brandStyle}>
          {t("sendCode")}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={verify} className="grid gap-4" noValidate>
      {google}
      {info && <SuccessNote>{info}</SuccessNote>}
      {error && <ErrorNote>{error}</ErrorNote>}
      <Field label={t("code")} hint={t("checkSpam")}>
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
      <Button type="submit" size="lg" loading={busy} style={brandStyle}>
        {t("confirm")}
      </Button>
      <Button type="button" variant="link" disabled={cooldown > 0 || busy} onClick={send} className="justify-self-start text-sm">
        {cooldown > 0 ? t("resendIn", { seconds: cooldown }) : t("resend")}
      </Button>
    </form>
  );
}
