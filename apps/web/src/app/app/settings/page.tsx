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
  settings: { primaryColor: string; logoUrl: string | null; country: string; currency: string; timezone: string; legalName: string | null; contactEmail: string | null; privacyPolicyUrl: string | null };
}

export default function SettingsPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ["tenant"], queryFn: () => api.get<Tenant>("/app/tenant") });
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
