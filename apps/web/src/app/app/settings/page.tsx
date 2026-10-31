"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useCan } from "@/components/app/me-context";
import { Button } from "@/components/ui/button";
import { CountrySelect, getCountryOption } from "@/components/ui/country-select";
import { Field, Input, Select } from "@/components/ui/field";
import { ErrorNote, PageHeader, Panel, Skeleton } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";

interface Tenant {
  name: string;
  slug: string;
  settings: {
    primaryColor: string;
    logoUrl: string | null;
    walletBannerUrl?: string | null;
    walletBannerVersion?: string | null;
    instagramHandle?: string | null;
    country: string;
    currency: string;
    timezone: string;
    legalName: string | null;
    contactEmail: string | null;
    privacyPolicyUrl: string | null;
  };
}

export default function SettingsPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ["tenant"], queryFn: () => api.get<Tenant>("/app/tenant") });
  const { data: walletStatus } = useQuery({
    queryKey: ["wallet-status"],
    queryFn: () => api.get<{ googleWallet: boolean; appleWallet?: boolean }>("/app/wallet/status"),
  });

  return (
    <>
      <PageHeader
        title="Paramètres"
        description={data ? `Adresse de votre page : app.fove.digital/${data.slug}` : undefined}
        actions={
          data ? (
            <Button asChild variant="secondary" size="sm">
              <Link href={`/${data.slug}`} target="_blank">
                Voir ma page publique
              </Link>
            </Button>
          ) : undefined
        }
      />

      {/* État des intégrations Portefeuilles & WhatsApp */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <section className="rounded-xl border border-line bg-surface p-4 text-sm shadow-1">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-ink">Apple Wallet</h2>
            <span className={walletStatus?.appleWallet ? "rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-600" : "rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-600"}>
              {walletStatus?.appleWallet ? "Configuré" : "Certificats prêts"}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-ink-3">
            PassKit actif. Cartes synchronisées en direct avec notifications push sur iPhone.
          </p>
        </section>

        <section className="rounded-xl border border-line bg-surface p-4 text-sm shadow-1">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-ink">Google Wallet</h2>
            <span className={walletStatus?.googleWallet ? "rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-600" : "rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-600"}>
              {walletStatus?.googleWallet ? "Configuré" : "En attente"}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-ink-3">
            Ajout en 1 clic sur Android avec mise à jour automatique des tampons et points.
          </p>
        </section>

        <section className="rounded-xl border border-line bg-surface p-4 text-sm shadow-1">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-ink">WhatsApp Cloud</h2>
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-600">
              Dizayna actif
            </span>
          </div>
          <p className="mt-1.5 text-xs text-ink-3">
            Envoi instantané du lien de la carte par WhatsApp aux nouveaux clients.
          </p>
        </section>
      </div>

      {isLoading && <Skeleton className="h-64" />}
      {error && <ErrorNote>{errorMessage(error)}</ErrorNote>}
      {data && <SettingsForm data={data} />}
      <div className="mt-6 flex flex-wrap gap-3">
        <Button asChild variant="secondary"><Link href="/app/programs">Règles de fidélité</Link></Button>
        <Button asChild variant="secondary"><Link href="/app/rewards">Réductions et récompenses</Link></Button>
        <Button asChild variant="secondary"><Link href="/app/establishments">Points de vente</Link></Button>
      </div>
    </>
  );
}

function SettingsForm({ data }: { data: Tenant }) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const canWrite = useCan("tenant.update");
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState<Record<string, string>>(() => ({
      name: data.name,
      slug: data.slug,
      primaryColor: data.settings.primaryColor,
      logoUrl: data.settings.logoUrl ?? "",
      walletBannerUrl: data.settings.walletBannerUrl ?? "",
      instagramHandle: data.settings.instagramHandle ?? "",
      country: data.settings.country,
      currency: data.settings.currency,
      timezone: data.settings.timezone,
      legalName: data.settings.legalName ?? "",
      contactEmail: data.settings.contactEmail ?? "",
      privacyPolicyUrl: data.settings.privacyPolicyUrl ?? "",
  }));
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <>
      <Panel className="max-w-2xl p-5 sm:p-6">
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await api.patch("/app/tenant", {
                name: f.name,
                slug: f.slug,
                primaryColor: f.primaryColor,
                country: f.country,
                currency: f.currency,
                timezone: f.timezone,
                logoUrl: f.logoUrl || null,
                walletBannerUrl: f.walletBannerUrl || null,
                walletBannerVersion: f.walletBannerUrl ? String(Date.now()) : null,
                instagramHandle: f.instagramHandle ? (f.instagramHandle.startsWith("@") ? f.instagramHandle : `@${f.instagramHandle}`) : null,
                legalName: f.legalName || null,
                contactEmail: f.contactEmail || null,
                privacyPolicyUrl: f.privacyPolicyUrl || null,
              });
              qc.invalidateQueries({ queryKey: ["tenant"] });
              router.refresh();
              toast.success("Paramètres enregistrés sur vos pages et cartes clients");
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {error && <ErrorNote>{error}</ErrorNote>}
          <fieldset disabled={!canWrite} className="grid gap-4">
            <Field label="Nom du commerce">{(p) => <Input {...p} value={f.name ?? ""} onChange={set("name")} />}</Field>
            <Field
              label="Adresse de votre page"
              hint={`app.fove.digital/${f.slug || "votre-commerce"}`}
            >
              {(p) => (
                <div className="flex items-stretch overflow-hidden rounded-[var(--radius)] bg-surface shadow-1 ring-1 ring-line focus-within:ring-2 focus-within:ring-cobalt">
                  <span className="flex select-none items-center border-r border-line bg-surface-2 px-3.5 text-sm font-medium text-ink-2">
                    app.fove.digital/
                  </span>
                  <Input
                    {...p}
                    value={f.slug ?? ""}
                    onChange={(e) =>
                      setF({
                        ...f,
                        slug: e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9-]+/g, "-")
                          .replace(/^-+|-+$/g, "")
                          .slice(0, 48),
                      })
                    }
                    className="rounded-none border-0 shadow-none ring-0 focus-visible:ring-0"
                  />
                </div>
              )}
            </Field>
            <Field label="Raison sociale">{(p) => <Input {...p} value={f.legalName ?? ""} onChange={set("legalName")} />}</Field>
            <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
              <Field label="Couleur">{(p) => <input {...p} type="color" className="h-11 w-16 cursor-pointer rounded-md bg-surface shadow-1" value={f.primaryColor ?? "#2C55F5"} onChange={set("primaryColor")} />}</Field>
              <Field label="Importer le logo" hint="PNG, JPEG ou WebP, 512 Ko maximum. Enregistrez ensuite vos paramètres.">
                {(p) => <Input {...p} type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 512 * 1024) { setError("Le logo ne doit pas dépasser 512 Ko."); return; }
                  setUploading(true); setError(null);
                  try {
                    const dataBase64 = await new Promise<string>((resolve, reject) => {
                      const reader = new FileReader();
                      reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
                      reader.onerror = () => reject(new Error("Lecture du fichier impossible"));
                      reader.readAsDataURL(file);
                    });
                    const { url } = await api.post<{ url: string }>("/app/media", { dataBase64 });
                    setF((current) => ({ ...current, logoUrl: url }));
                  } catch (err) { setError(errorMessage(err)); } finally { setUploading(false); }
                }} />}
              </Field>
              <Field label="Adresse du logo">{(p) => <Input {...p} value={f.logoUrl ?? ""} onChange={set("logoUrl")} />}</Field>
            </div>

            <div className="grid gap-2 rounded-xl border border-line bg-surface-2/60 p-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-ink">Bannière des cartes Wallet (Apple & Google)</label>
                {f.walletBannerUrl && (
                  <button
                    type="button"
                    onClick={() => setF({ ...f, walletBannerUrl: "" })}
                    className="text-xs font-medium text-rose-600 hover:underline"
                  >
                    Revenir au bandeau automatique
                  </button>
                )}
              </div>
              <p className="text-xs text-ink-3">
                Visible sous le logo sur iPhone et sous les infos sur Android. Sans image personnalisée, une bannière élégante reprend automatiquement votre nom et votre offre de fidélité.
              </p>
              <div className="mt-2 aspect-[375/144] w-full max-w-md overflow-hidden rounded-xl border border-line bg-surface shadow-xs">
                <img
                  src={f.walletBannerUrl || `/api/public/tenants/${f.slug}/wallet-banner.png?t=${Date.now()}`}
                  alt="Bannière des cartes Wallet"
                  className="size-full object-cover"
                />
              </div>
              <Input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={uploading}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 1024 * 1024) { setError("La bannière ne doit pas dépasser 1 Mo."); return; }
                  setUploading(true); setError(null);
                  try {
                    const dataBase64 = await new Promise<string>((resolve, reject) => {
                      const reader = new FileReader();
                      reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
                      reader.onerror = () => reject(new Error("Lecture impossible"));
                      reader.readAsDataURL(file);
                    });
                    const { url } = await api.post<{ url: string }>("/app/media", { dataBase64 });
                    setF((current) => ({ ...current, walletBannerUrl: url }));
                  } catch (err) { setError(errorMessage(err)); } finally { setUploading(false); }
                }}
              />
            </div>

            <Field label="Compte Instagram" hint="Affiché sur les cartes téléchargées (PNG et PDF) de vos clients.">
              {(p) => <Input {...p} placeholder="@dizayna" value={f.instagramHandle ?? ""} onChange={set("instagramHandle")} />}
            </Field>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Pays">
                {(p) => (
                  <CountrySelect
                    {...p}
                    value={f.country ?? "CD"}
                    onChange={(code) =>
                      setF({
                        ...f,
                        country: code,
                        timezone: getCountryOption(code)?.timezone ?? f.timezone ?? "Africa/Kinshasa",
                      })
                    }
                  />
                )}
              </Field>
              <Field label="Devise" hint="Utilisée pour les nouveaux programmes. Les programmes existants conservent leur devise.">
                {(p) => (
                  <Select {...p} value={f.currency ?? "CDF"} onChange={set("currency")}>
                    <option value="CDF">CDF</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </Select>
                )}
              </Field>
              <Field label="Fuseau horaire">
                {(p) => (
                  <Select {...p} value={f.timezone ?? "Africa/Kinshasa"} onChange={set("timezone")}>
                    <option value="Africa/Kinshasa">Kinshasa</option>
                    <option value="Africa/Lubumbashi">Lubumbashi</option>
                    <option value="Europe/Paris">Paris</option>
                    <option value="Europe/Brussels">Bruxelles</option>
                  </Select>
                )}
              </Field>
            </div>
            <Field label="Email de contact">{(p) => <Input {...p} type="email" value={f.contactEmail ?? ""} onChange={set("contactEmail")} />}</Field>
            <Field label="Politique de confidentialité (URL)" hint="Affichée aux clients lors de l’inscription.">{(p) => <Input {...p} value={f.privacyPolicyUrl ?? ""} onChange={set("privacyPolicyUrl")} />}</Field>
            {canWrite && <Button type="submit" loading={busy || uploading} className="justify-self-start">Enregistrer</Button>}
          </fieldset>
        </form>
      </Panel>
    </>
  );
}
