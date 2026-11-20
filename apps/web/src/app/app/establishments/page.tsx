"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useCan } from "@/components/app/me-context";
import type { Establishment } from "@/components/app/types";
import { Button } from "@/components/ui/button";
import { CitySelect, CountrySelect, SUGGESTED_CITIES } from "@/components/ui/country-select";
import { ConfirmDialog, DialogContent, DialogRoot } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { Badge, EmptyState, ErrorNote, PageHeader, Panel } from "@/components/ui/misc";
import { api, useErrorMessage } from "@/lib/api";

function EstablishmentForm({ value, defaultCountry = "CD", onDone }: { value?: Establishment; defaultCountry?: string; onDone: () => void }) {
  const toErrorMessage = useErrorMessage();
  const t = useTranslations("app.establishments.form");
  const qc = useQueryClient();
  const [country, setCountry] = useState(defaultCountry);
  const [f, setF] = useState({
    name: value?.name ?? "",
    address: value?.address ?? "",
    city: value?.city ?? (SUGGESTED_CITIES[defaultCountry]?.[0] ?? "Kinshasa"),
    phone: value?.phone ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const body = { name: f.name, address: f.address || null, city: f.city || null, phone: f.phone || null };
        try {
          if (value) await api.patch(`/app/establishments/${value.id}`, body);
          else await api.post("/app/establishments", body);
          qc.invalidateQueries({ queryKey: ["establishments"] });
          toast.success(value ? t("updated") : t("added"));
          onDone();
        } catch (err) {
          setError(toErrorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      {error && <ErrorNote>{error}</ErrorNote>}
      <Field label={t("name")}>{(p) => <Input {...p} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("country")}>
          {(p) => (
            <CountrySelect
              {...p}
              value={country}
              onChange={(code) => {
                setCountry(code);
                setF({ ...f, city: SUGGESTED_CITIES[code]?.[0] ?? "" });
              }}
            />
          )}
        </Field>
        <Field label={t("city")}>{(p) => <CitySelect {...p} countryCode={country} value={f.city} onChange={(city) => setF({ ...f, city })} />}</Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("address")}>{(p) => <Input {...p} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />}</Field>
        <Field label={t("phone")}>{(p) => <Input {...p} type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />}</Field>
      </div>
      <Button type="submit" loading={busy} disabled={f.name.trim().length < 2}>{value ? t("save") : t("submit")}</Button>
    </form>
  );
}

export default function EstablishmentsPage() {
  const toErrorMessage = useErrorMessage();
  const t = useTranslations("app.establishments");
  const canWrite = useCan("establishments.write");
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Establishment | "new" | null>(null);
  const { data = [] } = useQuery({ queryKey: ["establishments"], queryFn: () => api.get<Establishment[]>("/app/establishments") });
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} actions={canWrite && <Button onClick={() => setEditing("new")}><Plus /> {t("add")}</Button>} />
      {data.length === 0 ? (
        <EmptyState icon={<Building2 />} title={t("empty")} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((e) => (
            <Panel key={e.id} className="grid gap-2 p-5">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-display text-lg font-semibold">{e.name}</h2>
                {!e.active && <Badge>{t("closed")}</Badge>}
              </div>
              <p className="text-sm text-ink-2">{[e.address, e.city, e.phone].filter(Boolean).join(" · ") || t("noDetails")}</p>
              {canWrite && (
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setEditing(e)}>{t("edit")}</Button>
                  <ConfirmDialog
                    trigger={<Button size="sm" variant="ghost">{e.active ? t("close") : t("reopen")}</Button>}
                    title={e.active ? t("closeTitle", { name: e.name }) : t("reopenTitle", { name: e.name })}
                    consequence={e.active ? t("closeConsequence") : t("reopenConsequence")}
                    confirmLabel={e.active ? t("closeConfirm") : t("reopen")}
                    destructive={e.active}
                    onConfirm={async () => {
                      try {
                        await api.patch(`/app/establishments/${e.id}`, { active: !e.active });
                        qc.invalidateQueries({ queryKey: ["establishments"] });
                      } catch (err) {
                        toast.error(toErrorMessage(err));
                      }
                    }}
                  />
                </div>
              )}
            </Panel>
          ))}
        </div>
      )}
      <DialogRoot open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        {editing !== null && (
          <DialogContent title={editing === "new" ? t("newTitle") : t("editTitle")}>
            <EstablishmentForm value={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />
          </DialogContent>
        )}
      </DialogRoot>
    </>
  );
}
