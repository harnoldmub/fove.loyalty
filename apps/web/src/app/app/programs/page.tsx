"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Printer, QrCode, Settings2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { toast } from "sonner";
import { useCan } from "@/components/app/me-context";
import { useWalletEnabled, WalletBroadcast } from "@/components/app/card-share";
import type { Establishment, Program } from "@/components/app/types";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, DialogContent, DialogRoot } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Badge, ErrorNote, PageHeader, Panel, Skeleton } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
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

const VERIFICATION = { NONE: "Immédiate", EMAIL_OTP: "Code envoyé par email", IN_STORE: "Activée en magasin" } as const;

function ProgramForm({ program, onDone }: { program?: Program; onDone: () => void }) {
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
      toast.success(program ? "Programme mis à jour" : "Programme créé");
      qc.invalidateQueries({ queryKey: ["programs"] });
      qc.invalidateQueries({ queryKey: ["links"] });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      {error && <ErrorNote>{error}</ErrorNote>}
      <Field label="Nom du programme">{(p) => <Input {...p} value={f.name} onChange={set("name")} />}</Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type" hint={program?._count?.accounts ? "Ne peut plus changer : des cartes existent." : undefined}>
          {(p) => (
            <Select {...p} value={f.mode} onChange={set("mode")} disabled={Boolean(program?._count?.accounts)}>
              <option value="POINTS">Points selon le montant</option>
              <option value="STAMPS">Tampons par achat</option>
            </Select>
          )}
        </Field>
        <Field label="Devise">
          {(p) => (
            <Select {...p} value={f.currency} onChange={set("currency")}>
              <option value="CDF">CDF</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </Select>
          )}
        </Field>
      </div>
      {f.mode === "POINTS" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`Dépense (${f.currency})`}>{(p) => <Input {...p} inputMode="decimal" value={f.spendStep} onChange={set("spendStep")} />}</Field>
          <Field label="Points gagnés">{(p) => <Input {...p} type="number" min={1} value={f.pointsPerStep} onChange={set("pointsPerStep")} />}</Field>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tampons par achat">{(p) => <Input {...p} type="number" min={1} max={10} value={f.stampsPerPurchase} onChange={set("stampsPerPurchase")} />}</Field>
          <Field label="Tampons pour la récompense">{(p) => <Input {...p} type="number" min={2} max={50} value={f.stampsTarget} onChange={set("stampsTarget")} />}</Field>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Achat minimum (facultatif)">{(p) => <Input {...p} inputMode="decimal" value={f.minPurchaseAmount} onChange={set("minPurchaseAmount")} />}</Field>
        <Field label="Plafond par achat (facultatif)">{(p) => <Input {...p} type="number" min={1} value={f.maxPerTransaction} onChange={set("maxPerTransaction")} />}</Field>
      </div>
      <Field label="Expiration après inactivité (jours, facultatif)" hint="Le solde expire si le client ne revient pas pendant cette durée. Minimum 30 jours.">
        {(p) => <Input {...p} type="number" min={30} value={f.inactivityExpiryDays} onChange={set("inactivityExpiryDays")} />}
      </Field>
      <Checkbox
        checked={f.oneVisitPerDay}
        onChange={(e) => setF({ ...f, oneVisitPerDay: e.target.checked })}
        label="Un seul passage compté par client et par jour (les commandes en ligne ne sont pas concernées)"
      />
      <Field label="Validation des inscriptions par QR">
        {(p) => (
          <Select {...p} value={f.enrollmentVerification} onChange={set("enrollmentVerification")}>
            <option value="NONE">Immédiate</option>
            <option value="EMAIL_OTP">Code envoyé par email</option>
            <option value="IN_STORE">Activée par un employé en magasin</option>
          </Select>
        )}
      </Field>
      <Field label="Conditions du programme (affichées au client)">{(p) => <Textarea {...p} value={f.terms} onChange={set("terms")} />}</Field>
      <Button type="submit" loading={busy} disabled={f.name.trim().length < 2}>{program ? "Enregistrer" : "Créer le programme"}</Button>
    </form>
  );
}

function LinkCard({ link }: { link: Link }) {
  const qc = useQueryClient();
  const canWrite = useCan("programs.write");
  return (
    <Panel className="grid gap-4 p-5 sm:grid-cols-[auto_1fr]">
      <div className="rounded-md bg-white p-2 justify-self-start">
        <QRCodeSVG id={`qr-${link.id}`} value={link.url} size={132} marginSize={1} fgColor="#14204a" />
      </div>
      <div className="grid content-start gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{link.establishment?.name ?? "Tous les établissements"}</p>
          {!link.active && <Badge tone="danger">Désactivé</Badge>}
        </div>
        <p className="text-sm text-ink-3">{link.program.name} · {formatNumber(link.enrollCount)} inscriptions</p>
        <p className="break-all text-sm text-ink-2">{link.url}</p>
        <div className="mt-1 flex flex-wrap gap-2">
          <Button asChild size="sm" variant="secondary">
            <a href={`/affiche/${link.id}`} target="_blank" rel="noreferrer"><Printer /> Affiche à imprimer</a>
          </Button>
          <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(link.url).then(() => toast.success("Lien copié"))}>Copier le lien</Button>
          {canWrite && (
            <ConfirmDialog
              trigger={<Button size="sm" variant="ghost">{link.active ? "Désactiver" : "Réactiver"}</Button>}
              title={link.active ? "Désactiver ce QR code ?" : "Réactiver ce QR code ?"}
              consequence={link.active ? "Les clients qui le scannent ne pourront plus s’inscrire. Les cartes existantes ne sont pas touchées." : "Les clients pourront de nouveau s’inscrire avec ce QR code."}
              confirmLabel={link.active ? "Désactiver" : "Réactiver"}
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
  const canWrite = useCan("programs.write");
  const wallet = useWalletEnabled();
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
        title="Programmes"
        description="Les règles de gain et les QR codes d’inscription."
        actions={canWrite && <Button onClick={() => setEditing("new")}><Plus /> Nouveau programme</Button>}
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
                  <p className="text-sm text-ink-3">{formatNumber(p._count?.accounts ?? 0)} cartes · {formatNumber(p._count?.rewards ?? 0)} récompenses</p>
                </div>
                <Badge tone={p.active ? "mint" : "neutral"}>{p.active ? "Actif" : "Inactif"}</Badge>
              </div>
              <p className="text-ink-2">
                {p.mode === "POINTS"
                  ? `${formatNumber(Number(p.spendStep))} ${p.currency} dépensés = ${p.pointsPerStep} point${p.pointsPerStep > 1 ? "s" : ""}`
                  : `${p.stampsPerPurchase} tampon${p.stampsPerPurchase > 1 ? "s" : ""} par achat, récompense à ${p.stampsTarget}`}
                {p.maxPerTransaction && `, plafond ${formatNumber(p.maxPerTransaction)} par achat`}
                {p.inactivityExpiryDays && `, expiration après ${p.inactivityExpiryDays} jours sans visite`}
                {p.oneVisitPerDay && ", un passage par jour au plus"}.
              </p>
              <p className="text-sm text-ink-3">Inscription : {VERIFICATION[p.enrollmentVerification]}</p>
              {canWrite && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setEditing(p)}><Settings2 /> Modifier</Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await api.patch(`/app/programs/${p.id}`, { active: !p.active }).catch((e) => toast.error(errorMessage(e)));
                      qc.invalidateQueries({ queryKey: ["programs"] });
                    }}
                  >
                    {p.active ? "Mettre en pause" : "Activer"}
                  </Button>
                  {wallet && p.active && <WalletBroadcast programId={p.id} programName={p.name} />}
                </div>
              )}
            </Panel>
          ))}
        </div>
      )}

      <section aria-labelledby="qr" className="mt-12">
        <div className="mb-4 grid gap-4">
          <div>
            <h2 id="qr" className="font-display text-2xl font-semibold">QR codes d’inscription</h2>
            <p className="text-ink-2">Différents du QR personnel de chaque carte : ils servent seulement à créer une carte.</p>
          </div>
          {canWrite && programs && programs.length > 0 && establishments.length > 0 && (
            <div className="grid gap-2 rounded-[var(--radius-lg)] bg-surface p-3 shadow-1 sm:grid-cols-[1fr_1fr_auto]">
              <Select aria-label="Programme" value={linkProgram} onChange={(e) => setLinkProgram(e.target.value)}>
                <option value="">Choisir un programme</option>
                {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
              <Select aria-label="Établissement" value={linkEst} onChange={(e) => setLinkEst(e.target.value)}>
                <option value="">Choisir un établissement</option>
                {establishments.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </Select>
              <Button
                variant="secondary"
                disabled={!linkProgram || !linkEst}
                onClick={async () => {
                  try {
                    await api.post("/app/enrollment-links", { programId: linkProgram, establishmentId: linkEst });
                    qc.invalidateQueries({ queryKey: ["links"] });
                    toast.success("QR code créé");
                  } catch (e) {
                    toast.error(errorMessage(e));
                  }
                }}
              >
                <QrCode /> Créer le QR code
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
          <DialogContent title={editing === "new" ? "Nouveau programme" : "Modifier le programme"}>
            <ProgramForm program={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />
          </DialogContent>
        )}
      </DialogRoot>
    </>
  );
}
