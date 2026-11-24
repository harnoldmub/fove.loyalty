"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { ErrorNote, Panel, Skeleton, SuccessNote } from "@/components/ui/misc";
import { PhoneInput } from "@/components/ui/phone-input";
import { CodeStep } from "@/components/client/code-step";
import { api, ApiError, useErrorMessage } from "@/lib/api";

interface ClientAccount {
  id: string;
  email: string;
  emailVerifiedAt: string | null;
  firstName: string;
  lastName: string;
  phone: string | null;
}

const LOGIN = "/mes-cartes/connexion";

/** Espace « Mes cartes » du compte client FOVE. Les cartes elles-mêmes arrivent au sous-lot A3. */
export function ClientHome() {
  const t = useTranslations("client.home");
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const [account, setAccount] = useState<ClientAccount | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    api
      .get<ClientAccount>("/client/me")
      .then(setAccount)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) router.replace(`${LOGIN}?next=/mes-cartes`);
        else setLoadError(true);
      });
  }, [router]);
  useEffect(load, [load]);

  if (loadError) {
    return (
      <div className="grid gap-4">
        <ErrorNote>{t("loadError")}</ErrorNote>
        <Button
          variant="secondary"
          onClick={() => {
            setLoadError(false);
            load();
          }}
        >
          {t("retry")}
        </Button>
      </div>
    );
  }
  if (!account) {
    return (
      <div className="grid gap-4" aria-busy="true">
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  // « Mes cartes » est réservé aux comptes confirmés (compte créé au scan, sans code).
  if (!account.emailVerifiedAt) {
    return (
      <div className="grid gap-6">
        <div className="grid gap-2">
          <h1 className="font-display text-3xl font-semibold">{t("confirmTitle")}</h1>
          <p className="text-ink-2">{t("confirmBody", { email: account.email })}</p>
        </div>
        <CodeStep email={account.email} withGoogle onVerified={load} />
      </div>
    );
  }

  const isNew = !account.firstName;

  async function logout() {
    await api.post("/client/auth/logout");
    router.replace(LOGIN);
  }

  return (
    <div className="grid gap-8">
      <div className="grid gap-1">
        <h1 className="font-display text-3xl font-semibold">{isNew ? t("welcomeTitle") : t("hello", { name: account.firstName })}</h1>
        <p className="text-sm text-ink-3">{t("signedInAs", { email: account.email })}</p>
      </div>

      {isNew ? (
        <Panel className="grid gap-4 p-5">
          <p className="text-ink-2">{t("welcomeBody")}</p>
          <ProfileForm account={account} onSaved={setAccount} errorMessage={errorMessage} />
        </Panel>
      ) : (
        <>
          <section className="grid gap-3" aria-labelledby="cartes">
            <h2 id="cartes" className="font-display text-xl font-semibold">
              {t("cardsTitle")}
            </h2>
            <Panel className="p-5 text-sm text-ink-2">{t("cardsEmpty")}</Panel>
          </section>

          <section className="grid gap-3" aria-labelledby="profil">
            <h2 id="profil" className="font-display text-xl font-semibold">
              {t("profileTitle")}
            </h2>
            <Panel className="p-5">
              <ProfileForm account={account} onSaved={setAccount} errorMessage={errorMessage} />
            </Panel>
          </section>
        </>
      )}

      <div className="grid gap-6 border-t border-line pt-6">
        <Button variant="secondary" onClick={logout}>
          {t("logout")}
        </Button>
        <div className="grid gap-2">
          <h2 className="font-semibold">{t("dangerTitle")}</h2>
          <p className="text-sm text-ink-2">{t("dangerBody")}</p>
          <div>
            <ConfirmDialog
              trigger={<Button variant="ghost" className="text-danger hover:text-danger">{t("delete")}</Button>}
              title={t("deleteConfirmTitle")}
              consequence={t("deleteConsequence")}
              confirmLabel={t("deleteConfirm")}
              destructive
              onConfirm={async () => {
                await api.delete("/client/me");
                router.replace(`${LOGIN}?supprime=1`);
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileForm({
  account,
  onSaved,
  errorMessage,
}: {
  account: ClientAccount;
  onSaved: (account: ClientAccount) => void;
  errorMessage: (e: unknown) => string;
}) {
  const t = useTranslations("client.home");
  const [f, setF] = useState({ firstName: account.firstName, lastName: account.lastName, phone: account.phone ?? "" });
  const [firstNameError, setFirstNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    if (!f.firstName.trim()) return setFirstNameError(t("firstNameRequired"));
    setFirstNameError(null);
    setError(null);
    setBusy(true);
    try {
      const updated = await api.patch<ClientAccount>("/client/me", { firstName: f.firstName, lastName: f.lastName, phone: f.phone || null });
      setSaved(true);
      onSaved(updated);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-5" noValidate>
      {error && <ErrorNote>{error}</ErrorNote>}
      {saved && <SuccessNote>{t("saved")}</SuccessNote>}
      <Field label={t("firstName")} error={firstNameError ?? undefined}>
        {(p) => <Input {...p} autoComplete="given-name" value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} />}
      </Field>
      <Field label={t("lastNameOptional")}>
        {(p) => <Input {...p} autoComplete="family-name" value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} />}
      </Field>
      <Field label={t("phone")} hint={t("phoneHint")}>
        {(p) => <PhoneInput {...p} value={f.phone} onChange={(phone) => setF({ ...f, phone })} />}
      </Field>
      <Field label={t("email")} hint={t("emailHint")}>
        {(p) => <Input {...p} type="email" value={account.email} readOnly disabled />}
      </Field>
      <Button type="submit" loading={busy}>
        {t("save")}
      </Button>
    </form>
  );
}
