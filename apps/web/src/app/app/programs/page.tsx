"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Printer, QrCode, Settings2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useCan } from "@/components/app/me-context";
import { WalletBroadcast } from "@/components/app/card-share";
import type { Establishment, Program } from "@/components/app/types";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, DialogContent, DialogRoot } from "@/components/ui/dialog";
import { CurrencySelect } from "@/components/ui/currency-select";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Badge, ErrorNote, PageHeader, Panel, Skeleton } from "@/components/ui/misc";
import { api, useErrorMessage } from "@/lib/api";
import { formatNumber } from "@/lib/utils";

interface Link {
  id: string;
  token: string;
  url: string;
  active: boolean;
  enrollCount: number;
  programId: string;
  program: { name: string };
  establishment: { name: string } | null;
}

function ProgramForm({ program, onDone }: { program?: Program; onDone: () => void }) {
  const toErrorMessage = useErrorMessage();
  const t = useTranslations("app.programs.form");
  const qc = useQueryClient();
  const { data: tenant } = useQuery({ queryKey: ["tenant"], queryFn: () => api.get<{ settings: { currency: string } }>("/app/tenant") });
  const [f, setF] = useState({
    name: program?.name ?? "",
    mode: program?.mode ?? "POINTS",
    currency: program?.currency ?? tenant?.settings.currency ?? "CDF",
    spendStep: program?.spendStep ?? "1000",
    pointsPerStep: String(program?.pointsPerStep ?? 1),
    stampsPerPurchase: String(program?.stampsPerPurchase ?? 1),
    stampsTarget: String(program?.stampsTarget ?? 10),
    minPurchaseAmount: program?.minPurchaseAmount ?? "",
    maxPerTransaction: program?.maxPerTransaction ? String(program.maxPerTransaction) : "",
    inactivityExpiryDays: program?.inactivityExpiryDays ? String(program.inactivityExpiryDays) : "",
    oneVisitPerDay: program?.oneVisitPerDay ?? !program,
    enrollmentVerification: program?.enrollmentVerification ?? "NONE",
    terms: program?.terms ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Devise de l'entreprise reportée sur un nouveau programme dès qu'elle est connue.
  const tenantCurrency = tenant?.settings?.currency;
  const [appliedCurrency, setAppliedCurrency] = useState<string | undefined>(undefined);
  if (tenantCurrency && !program && tenantCurrency !== appliedCurrency) {
    setAppliedCurrency(tenantCurrency);
    setF((curr) => ({ ...curr, currency: tenantCurrency }));
  }

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      name: f.name,
      mode: f.mode,
      currency: f.currency,
      spendStep: f.spendStep.replace(",", "."),
      pointsPerStep: Number(f.pointsPerStep),
      stampsPerPurchase: Number(f.stampsPerPurchase),
      stampsTarget: Number(f.stampsTarget),
      minPurchaseAmount: f.minPurchaseAmount ? f.minPurchaseAmount.replace(",", ".") : null,
      maxPerTransaction: f.maxPerTransaction ? Number(f.maxPerTransaction) : null,
      inactivityExpiryDays: f.inactivityExpiryDays ? Number(f.inactivityExpiryDays) : null,
      oneVisitPerDay: f.oneVisitPerDay,
      enrollmentVerification: f.enrollmentVerification,
      terms: f.terms,
    };
    try {
      if (program) await api.patch(`/app/programs/${program.id}`, body);
      else await api.post("/app/programs", body);
      toast.success(program ? t("updated") : t("created"));
      qc.invalidateQueries({ queryKey: ["programs"] });
      qc.invalidateQueries({ queryKey: ["links"] });
      onDone();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      {error && <ErrorNote>{error}</ErrorNote>}
      <Field label={t("name")}>{(p) => <Input {...p} value={f.name} onChange={set("name")} />}</Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("type")} hint={program?._count?.accounts ? t("typeLocked") : undefined}>
          {(p) => (
            <Select {...p} value={f.mode} onChange={set("mode")} disabled={Boolean(program?._count?.accounts)}>
              <option value="POINTS">{t("modes.POINTS")}</option>
              <option value="STAMPS">{t("modes.STAMPS")}</option>
            </Select>
          )}
        </Field>
        <Field label={t("currency")}>
          {(p) => (
            <CurrencySelect {...p} value={f.currency} onChange={(code) => setF({ ...f, currency: code })} />
          )}
        </Field>
      </div>
      {f.mode === "POINTS" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("spend", { currency: f.currency })}>{(p) => <Input {...p} inputMode="decimal" value={f.spendStep} onChange={set("spendStep")} />}</Field>
          <Field label={t("pointsEarned")}>{(p) => <Input {...p} type="number" min={1} value={f.pointsPerStep} onChange={set("pointsPerStep")} />}</Field>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("stampsPerPurchase")}>{(p) => <Input {...p} type="number" min={1} max={10} value={f.stampsPerPurchase} onChange={set("stampsPerPurchase")} />}</Field>
          <Field label={t("stampsTarget")}>{(p) => <Input {...p} type="number" min={2} max={50} value={f.stampsTarget} onChange={set("stampsTarget")} />}</Field>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("minPurchase")}>{(p) => <Input {...p} inputMode="decimal" value={f.minPurchaseAmount} onChange={set("minPurchaseAmount")} />}</Field>
        <Field label={t("maxPerTransaction")}>{(p) => <Input {...p} type="number" min={1} value={f.maxPerTransaction} onChange={set("maxPerTransaction")} />}</Field>
      </div>
      <Field label={t("expiry")} hint={t("expiryHint")}>
        {(p) => <Input {...p} type="number" min={30} value={f.inactivityExpiryDays} onChange={set("inactivityExpiryDays")} />}
      </Field>
      <Checkbox
        checked={f.oneVisitPerDay}
        onChange={(e) => setF({ ...f, oneVisitPerDay: e.target.checked })}
        label={t("oneVisitPerDay")}
      />
      <Field label={t("verification")}>
        {(p) => (
          <Select {...p} value={f.enrollmentVerification} onChange={set("enrollmentVerification")}>
            <option value="NONE">{t("verifications.NONE")}</option>
            <option value="EMAIL_OTP">{t("verifications.EMAIL_OTP")}</option>
            <option value="IN_STORE">{t("verifications.IN_STORE")}</option>
          </Select>
        )}
      </Field>
      <Field label={t("terms")}>{(p) => <Textarea {...p} value={f.terms} onChange={set("terms")} />}</Field>
      <Button type="submit" loading={busy} disabled={f.name.trim().length < 2}>{program ? t("save") : t("submit")}</Button>
    </form>
  );
}

function LinkCard({ link }: { link: Link }) {
  const t = useTranslations("app.programs.link");
  const qc = useQueryClient();
  const canWrite = useCan("programs.write");
  return (
    <Panel className="grid gap-4 p-5 sm:grid-cols-[auto_1fr]">
      <div className="rounded-md bg-white p-2 justify-self-start">
        <QRCodeSVG id={`qr-${link.id}`} value={link.url} size={132} marginSize={1} fgColor="#14204a" />
      </div>
      <div className="grid content-start gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{link.establishment?.name ?? t("allEstablishments")}</p>
          {!link.active && <Badge tone="danger">{t("disabled")}</Badge>}
        </div>
        <p className="text-sm text-ink-3">{link.program.name} · {t("enrollments", { count: link.enrollCount, formatted: formatNumber(link.enrollCount) })}</p>
        <p className="break-all text-sm text-ink-2" dir="ltr">{link.url}</p>
        <div className="mt-1 flex flex-wrap gap-2">
          <Button asChild size="sm" variant="secondary">
            <a href={`/affiche/${link.id}`} target="_blank" rel="noreferrer"><Printer /> {t("poster")}</a>
          </Button>
          <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(link.url).then(() => toast.success(t("copied")))}>{t("copy")}</Button>
          {canWrite && (
            <ConfirmDialog
              trigger={<Button size="sm" variant="ghost">{link.active ? t("deactivate") : t("reactivate")}</Button>}
              title={link.active ? t("deactivateTitle") : t("reactivateTitle")}
              consequence={link.active ? t("deactivateConsequence") : t("reactivateConsequence")}
              confirmLabel={link.active ? t("deactivate") : t("reactivate")}
              destructive={link.active}
              onConfirm={async () => {
                await api.post(`/app/enrollment-links/${link.id}/toggle`);
                qc.invalidateQueries({ queryKey: ["links"] });
              }}
            />
          )}
        </div>
      </div>
    </Panel>
  );
}

export default function ProgramsPage() {
  const toErrorMessage = useErrorMessage();
  const t = useTranslations("app.programs");
  const canWrite = useCan("programs.write");
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Program | "new" | null>(null);
  const [linkProgram, setLinkProgram] = useState("");
  const [linkEst, setLinkEst] = useState("");
  const { data: programs, isLoading } = useQuery({ queryKey: ["programs"], queryFn: () => api.get<Program[]>("/app/programs") });
  const { data: links = [] } = useQuery({ queryKey: ["links"], queryFn: () => api.get<Link[]>("/app/enrollment-links") });
  const { data: establishments = [] } = useQuery({ queryKey: ["establishments"], queryFn: () => api.get<Establishment[]>("/app/establishments") });

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={canWrite && <Button onClick={() => setEditing("new")}><Plus /> {t("new")}</Button>}
      />
      {isLoading ? (
        <Skeleton className="h-40" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {programs?.map((p) => (
            <Panel key={p.id} className="grid gap-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl font-semibold">{p.name}</h2>
                  <p className="text-sm text-ink-3">{t("counts", { cards: p._count?.accounts ?? 0, cardsFormatted: formatNumber(p._count?.accounts ?? 0), rewards: p._count?.rewards ?? 0, rewardsFormatted: formatNumber(p._count?.rewards ?? 0) })}</p>
                </div>
                <Badge tone={p.active ? "mint" : "neutral"}>{p.active ? t("active") : t("inactive")}</Badge>
              </div>
              <p className="text-ink-2">
                {p.mode === "POINTS"
                  ? t("rules.points", { spend: formatNumber(Number(p.spendStep)), currency: p.currency, count: p.pointsPerStep })
                  : t("rules.stamps", { count: p.stampsPerPurchase, target: p.stampsTarget })}
                {p.maxPerTransaction && t("rules.cap", { max: formatNumber(p.maxPerTransaction) })}
                {p.inactivityExpiryDays && t("rules.expiry", { count: p.inactivityExpiryDays })}
                {p.oneVisitPerDay && t("rules.oneVisit")}
                {t("rules.end")}
              </p>
              <p className="text-sm text-ink-3">{t("enrollment", { mode: t(`verification.${p.enrollmentVerification}`) })}</p>
              {canWrite && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setEditing(p)}><Settings2 /> {t("edit")}</Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await api.patch(`/app/programs/${p.id}`, { active: !p.active }).catch((e) => toast.error(toErrorMessage(e)));
                      qc.invalidateQueries({ queryKey: ["programs"] });
                    }}
                  >
                    {p.active ? t("pause") : t("activate")}
                  </Button>
                  {p.active && <WalletBroadcast programId={p.id} programName={p.name} />}
                </div>
              )}
            </Panel>
          ))}
        </div>
      )}

      <section aria-labelledby="qr" className="mt-12">
        <div className="mb-4 grid gap-4">
          <div>
            <h2 id="qr" className="font-display text-2xl font-semibold">{t("qrTitle")}</h2>
            <p className="text-ink-2">{t("qrDescription")}</p>
          </div>
          {canWrite && programs && programs.length > 0 && establishments.length > 0 && (
            <div className="grid gap-2 rounded-[var(--radius-lg)] bg-surface p-3 shadow-1 sm:grid-cols-[1fr_1fr_auto]">
              <Select aria-label={t("program")} value={linkProgram} onChange={(e) => setLinkProgram(e.target.value)}>
                <option value="">{t("chooseProgram")}</option>
                {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
              <Select aria-label={t("establishment")} value={linkEst} onChange={(e) => setLinkEst(e.target.value)}>
                <option value="">{t("chooseEstablishment")}</option>
                {establishments.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </Select>
              <Button
                variant="secondary"
                disabled={!linkProgram || !linkEst}
                onClick={async () => {
                  try {
                    await api.post("/app/enrollment-links", { programId: linkProgram, establishmentId: linkEst });
                    qc.invalidateQueries({ queryKey: ["links"] });
                    toast.success(t("qrCreated"));
                  } catch (e) {
                    toast.error(toErrorMessage(e));
                  }
                }}
              >
                <QrCode /> {t("createQr")}
              </Button>
            </div>
          )}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {links.map((l) => <LinkCard key={l.id} link={l} />)}
        </div>
      </section>

      <DialogRoot open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        {editing !== null && (
          <DialogContent title={editing === "new" ? t("new") : t("editTitle")}>
            <ProgramForm program={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />
          </DialogContent>
        )}
      </DialogRoot>
    </>
  );
}
