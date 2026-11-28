"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { Panel } from "@/components/ui/misc";
import { OtpInput } from "@/components/ui/otp-input";
import { api, useErrorMessage } from "@/lib/api";

interface Setup {
  secret: string;
  uri: string;
  qrSvg: string;
}

/**
 * Avant l'administration : activation de la double authentification (QR code, premier code, codes de
 * secours), ou saisie du code de l'application (valable 12 h). docs/securite.md.
 */
export function AdminMfaGate({ enabled, email }: { enabled: boolean; email: string }) {
  const t = useTranslations("admin.mfa");
  return (
    <div className="grid min-h-dvh place-items-center bg-paper px-4 py-10">
      <div className="grid w-full max-w-md gap-6">
        <div className="flex justify-center">
          <Logo className="text-2xl" />
        </div>
        <Panel className="grid gap-5 p-6">{enabled ? <Verify /> : <Enroll />}</Panel>
        <p className="text-center text-xs text-ink-3">
          {t("signedInAs", { email })}{" "}
          <button
            type="button"
            className="text-cobalt underline-offset-4 hover:underline"
            onClick={async () => {
              await api.post("/auth/logout").catch(() => undefined);
              window.location.assign("/login");
            }}
          >
            {t("logout")}
          </button>
        </p>
      </div>
    </div>
  );
}

function Verify() {
  const t = useTranslations("admin.mfa");
  const errMsg = useErrorMessage();
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (value = code) => {
    if (!value.trim()) return;
    setBusy(true);
    try {
      await api.post("/auth/mfa/verify", { code: value.trim() });
      window.location.reload();
    } catch (e) {
      toast.error(errMsg(e));
      setCode("");
      setBusy(false);
    }
  };

  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="grid gap-1 text-center">
        <h1 className="font-display text-xl font-bold text-ink">{t("verify.title")}</h1>
        <p className="text-sm text-ink-2">{recovery ? t("verify.recoveryHelp") : t("verify.help")}</p>
      </div>
      {recovery ? (
        <Field label={t("verify.recoveryLabel")}>
          {(f) => <Input {...f} dir="ltr" autoFocus autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX" />}
        </Field>
      ) : (
        <Field label={t("verify.codeLabel")} className="text-center">
          {(f) => <OtpInput {...f} autoFocus value={code} onChange={setCode} onComplete={(v) => void submit(v)} disabled={busy} />}
        </Field>
      )}
      <Button type="submit" loading={busy}>{t("verify.submit")}</Button>
      <button
        type="button"
        className="text-sm text-cobalt underline-offset-4 hover:underline"
        onClick={() => {
          setRecovery(!recovery);
          setCode("");
        }}
      >
        {recovery ? t("verify.useApp") : t("verify.useRecovery")}
      </button>
    </form>
  );
}

function Enroll() {
  const t = useTranslations("admin.mfa");
  const errMsg = useErrorMessage();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try {
      setSetup(await api.post<Setup>("/auth/mfa/setup"));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (value = code) => {
    if (value.length !== 6) return;
    setBusy(true);
    try {
      const res = await api.post<{ recoveryCodes: string[] }>("/auth/mfa/setup/confirm", { code: value });
      setCodes(res.recoveryCodes);
    } catch (e) {
      toast.error(errMsg(e));
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  if (codes) return <RecoveryCodes codes={codes} saved={saved} onSaved={setSaved} onDone={() => window.location.reload()} />;

  if (!setup) {
    return (
      <div className="grid gap-4 text-center">
        <h1 className="font-display text-xl font-bold text-ink">{t("setup.title")}</h1>
        <p className="text-sm text-ink-2">{t("setup.intro")}</p>
        <Button loading={busy} onClick={start}>{t("setup.start")}</Button>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-1 text-center">
        <h1 className="font-display text-xl font-bold text-ink">{t("setup.scanTitle")}</h1>
        <p className="text-sm text-ink-2">{t("setup.scanHelp")}</p>
      </div>
      {/* SVG produit par le serveur (bibliothèque qrcode) à partir de l'adresse otpauth://. */}
      <div className="mx-auto w-48 rounded-md bg-white p-2 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: setup.qrSvg }} />
      <div className="grid gap-1 text-center">
        <p className="text-xs text-ink-3">{t("setup.manual")}</p>
        <p dir="ltr" className="select-all font-mono text-sm font-semibold tracking-wider text-ink">{setup.secret}</p>
      </div>
      <Field label={t("setup.codeLabel")} className="text-center">
        {(f) => <OtpInput {...f} value={code} onChange={setCode} onComplete={(v) => void confirm(v)} disabled={busy} />}
      </Field>
      <Button loading={busy} onClick={() => void confirm()}>{t("setup.confirm")}</Button>
    </div>
  );
}

/** Codes de secours : affichés une seule fois, à noter avant de continuer. */
export function RecoveryCodes({ codes, saved, onSaved, onDone, doneLabel }: { codes: string[]; saved: boolean; onSaved: (v: boolean) => void; onDone: () => void; doneLabel?: string }) {
  const t = useTranslations("admin.mfa");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      toast.success(t("recovery.copied"));
    } catch {
      toast.error(t("recovery.copyFailed"));
    }
  };
  return (
    <div className="grid gap-4">
      <div className="grid gap-1 text-center">
        <h2 className="font-display text-xl font-bold text-ink">{t("recovery.title")}</h2>
        <p className="text-sm text-ink-2">{t("recovery.help")}</p>
      </div>
      <ul dir="ltr" className="grid grid-cols-2 gap-2 rounded-md bg-surface-2 p-4 font-mono text-sm font-semibold text-ink">
        {codes.map((c) => <li key={c} className="text-center">{c}</li>)}
      </ul>
      <Button variant="secondary" onClick={copy}>{t("recovery.copy")}</Button>
      <Checkbox label={t("recovery.saved")} checked={saved} onChange={(e) => onSaved(e.target.checked)} />
      <Button disabled={!saved} onClick={onDone}>{doneLabel ?? t("recovery.continue")}</Button>
    </div>
  );
}
