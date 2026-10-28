"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useCan } from "@/components/app/me-context";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { ErrorNote, PageHeader, Panel } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";

interface Tenant {
  name: string;
  slug: string;
  settings: { primaryColor: string; logoUrl: string | null; country: string; currency: string; timezone: string; legalName: string | null; contactEmail: string | null; privacyPolicyUrl: string | null };
}

export default function SettingsPage() {
  const { data } = useQuery({ queryKey: ["tenant"], queryFn: () => api.get<Tenant>("/app/tenant") });
  return (
    <>
      <PageHeader title="Paramètres" description={data ? `Adresse de votre page : ${data.slug}` : undefined} />
      {data && <SettingsForm data={data} />}
    </>
  );
}

function SettingsForm({ data }: { data: Tenant }) {
  const canWrite = useCan("tenant.update");
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState<Record<string, string>>(() => ({
      name: data.name,
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
              toast.success("Paramètres enregistrés");
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
            <Field label="Raison sociale">{(p) => <Input {...p} value={f.legalName ?? ""} onChange={set("legalName")} />}</Field>
            <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
              <Field label="Couleur">{(p) => <input {...p} type="color" className="h-11 w-16 cursor-pointer rounded-md bg-surface shadow-1" value={f.primaryColor ?? "#2C55F5"} onChange={set("primaryColor")} />}</Field>
              <Field label="Logo (URL)">{(p) => <Input {...p} value={f.logoUrl ?? ""} onChange={set("logoUrl")} />}</Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Pays">
                {(p) => (
                  <Select {...p} value={f.country ?? "CD"} onChange={set("country")}>
                    <option value="CD">RD Congo</option>
                    <option value="CG">Congo</option>
                    <option value="FR">France</option>
                    <option value="BE">Belgique</option>
                  </Select>
                )}
              </Field>
              <Field label="Devise">
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
            {canWrite && <Button type="submit" loading={busy} className="justify-self-start">Enregistrer</Button>}
          </fieldset>
        </form>
      </Panel>
    </>
  );
}
