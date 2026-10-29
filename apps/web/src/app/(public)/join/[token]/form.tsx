"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";
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
  // Le widget ouvre directement « Retrouver ma carte » via #retrouver.
  const wantsRecover = useSyncExternalStore(subscribeHash, () => window.location.hash === "#retrouver", () => false);
  const [tab, setTab] = useState<string | null>(null);
  // Carte déjà créée sur ce téléphone : on propose de l'ouvrir.
  const remembered = useSyncExternalStore(
    subscribeHash,
    () => readRememberedCards().find((c) => c.tenant === data.tenant.name && c.program === data.program.name)?.path ?? null,
    () => null,
  );
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
      ? `Un achat = un tampon. ${program.stampsTarget} tampons = ${program.rewards[0]?.name ?? "une récompense"}.`
      : `${formatNumber(Number(program.spendStep))} ${program.currency} dépensés = ${program.pointsPerStep} point${program.pointsPerStep > 1 ? "s" : ""}.`;

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
            <p className="text-sm text-white/80">{data.establishment ?? "Programme de fidélité"}</p>
            <h1 className="font-display text-2xl font-semibold leading-tight">{tenant.name}</h1>
          </div>
        </div>
      </header>
      <main id="contenu" className="mx-auto -mt-10 max-w-md px-4 pb-16">
        <div className="rounded-[var(--radius-lg)] bg-surface p-5 shadow-2 sm:p-6">
          {remembered && (
            <div className="mb-5 grid gap-2 rounded-md bg-mint-soft p-4">
              <p className="text-sm font-medium text-mint">Vous avez déjà une carte sur ce téléphone.</p>
              <Button asChild style={{ background: "var(--brand)", color: "#fff" }}>
                <a href={remembered}>Ouvrir ma carte</a>
              </Button>
            </div>
          )}
          <Tabs value={tab ?? (wantsRecover ? "recover" : "join")} onValueChange={setTab}>
            <TabsList className="mb-5 grid w-full grid-cols-2">
              <TabsTrigger value="join">Créer ma carte</TabsTrigger>
              <TabsTrigger value="recover">Retrouver ma carte</TabsTrigger>
            </TabsList>
            <TabsContent value="join">
              <p className="mb-5 text-ink-2">{rule}</p>
              <form onSubmit={submit} className="grid gap-4" noValidate>
                {error && <ErrorNote>{error}</ErrorNote>}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Prénom">{(p) => <Input {...p} autoComplete="given-name" value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} />}</Field>
                  <Field label="Nom">{(p) => <Input {...p} autoComplete="family-name" value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} />}</Field>
                </div>
                <Field label="Téléphone" hint={tenant.country === "CD" ? "Ex. 081 234 5678" : undefined}>
                  {(p) => <Input {...p} type="tel" inputMode="tel" autoComplete="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />}
                </Field>
                <Field label={needsEmail ? "Email" : "Email (facultatif)"} hint={needsEmail ? "Un code de validation vous sera envoyé." : "Pour retrouver votre carte si vous changez de téléphone."}>
                  {(p) => <Input {...p} type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />}
                </Field>
                <div className="hidden" aria-hidden>
                  <label>
                    Site web <input tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} />
                  </label>
                </div>
                <Checkbox
                  checked={f.acceptTerms}
                  onChange={(e) => setF({ ...f, acceptTerms: e.target.checked })}
                  label={
                    <>
                      J’accepte les conditions du programme
                      {tenant.privacyPolicyUrl && (
                        <>
                          {" "}et la <a href={tenant.privacyPolicyUrl} className="underline" target="_blank" rel="noreferrer">politique de confidentialité</a>
                        </>
                      )}
                      .
                    </>
                  }
                />
                <Checkbox checked={f.marketingConsent} onChange={(e) => setF({ ...f, marketingConsent: e.target.checked })} label={`Je souhaite recevoir les offres de ${tenant.name} (facultatif).`} />
                <Button type="submit" size="lg" loading={busy} disabled={!f.firstName || !f.phone || !f.acceptTerms || (needsEmail && !f.email)} style={{ background: "var(--brand)", color: "#fff" }}>
                  Créer ma carte
                </Button>
                {already && <p className="text-sm text-ink-2">Utilisez l’onglet « Retrouver ma carte » ou demandez au personnel de vous la renvoyer.</p>}
              </form>
              {program.terms && (
                <details className="mt-5 text-sm text-ink-2">
                  <summary className="cursor-pointer font-medium text-ink">Conditions du programme</summary>
                  <p className="mt-2 whitespace-pre-line">{program.terms}</p>
                </details>
              )}
            </TabsContent>
            <TabsContent value="recover">
              {recovered ? (
                <p role="status" className="text-ink-2">Si une carte correspond, son lien vient d’être envoyé à l’email de la fiche. Pensez à vérifier les courriers indésirables.</p>
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
                  <p className="text-ink-2">Le lien de votre carte est envoyé à l’email enregistré sur votre fiche. Sans email, demandez-le au personnel en caisse.</p>
                  <Field label="Email ou téléphone utilisé à l’inscription">{(p) => <Input {...p} autoComplete="email" value={recoverId} onChange={(e) => setRecoverId(e.target.value)} />}</Field>
                  <Button type="submit" variant="secondary" disabled={recoverId.trim().length < 6}>Recevoir le lien</Button>
                </form>
              )}
            </TabsContent>
          </Tabs>
        </div>
        <p className="mt-6 text-center text-xs text-ink-3">Carte de fidélité propulsée par FOVE</p>
      </main>
    </div>
  );
}
