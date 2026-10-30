"use client";

import { useQuery } from "@tanstack/react-query";
import { BellRing, Copy, Link2, MessageCircle, RefreshCw } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogRoot } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { ErrorNote } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";

interface Share {
  url: string;
  message: string;
  whatsapp: string;
  hasPhone: boolean;
  cloudSent?: boolean;
}

/**
 * Lien de la carte à envoyer au client (WhatsApp, copie, QR à scanner sur place).
 * Le lien est stable ; « Créer un nouveau lien » révoque l'ancien, après confirmation.
 */
export function CardShareDialog({ accountId }: { accountId: string }) {
  const [open, setOpen] = useState(false);
  const [share, setShare] = useState<Share | null>(null);
  const [confirmRenew, setConfirmRenew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (renew: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<Share>(`/app/accounts/${accountId}/share`, { renew });
      setShare(res);
      if (renew) toast.success("Nouveau lien créé. L’ancien ne fonctionne plus.");
      else if (res.cloudSent) toast.success("Carte envoyée directement sur WhatsApp via Dizayna.");
      setConfirmRenew(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogRoot
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o && !share) void load(false);
        if (!o) setConfirmRenew(false);
      }}
    >
      <Button variant="secondary" size="sm" onClick={() => { setOpen(true); if (!share) void load(false); }}>
        <Link2 /> Envoyer la carte
      </Button>
      <DialogContent title={confirmRenew ? "Créer un nouveau lien ?" : "Envoyer la carte au client"} description={confirmRenew ? "L’ancien lien cessera de fonctionner immédiatement. La carte et son solde ne changent pas." : "Le client garde ce lien : il affiche toujours son solde à jour et permet de télécharger la carte."}>
        {error && <ErrorNote>{error}</ErrorNote>}
        {confirmRenew ? (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setConfirmRenew(false)} disabled={busy}>Annuler</Button>
            <Button variant="danger" loading={busy} onClick={() => load(true)}>Créer un nouveau lien</Button>
          </div>
        ) : share ? (
          <div className="grid gap-4">
            <div className="grid justify-items-center gap-2 rounded-md bg-white p-4">
              <QRCodeSVG value={share.url} size={168} marginSize={2} fgColor="#14204a" />
              <p className="text-center text-xs text-[#4a5579]">Le client peut aussi scanner ce code avec son téléphone.</p>
            </div>
            <Button asChild className="bg-[#1f8f4e] text-white hover:bg-[#1a7a43]">
              <a href={share.whatsapp} target="_blank" rel="noreferrer">
                <MessageCircle /> {share.hasPhone ? "Envoyer sur WhatsApp" : "Partager sur WhatsApp"}
              </a>
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => navigator.clipboard.writeText(share.url).then(() => toast.success("Lien copié"))}>
                <Copy /> Copier le lien
              </Button>
              <Button variant="ghost" onClick={() => setConfirmRenew(true)}>
                <RefreshCw /> Nouveau lien
              </Button>
            </div>
            {!share.hasPhone && <p className="text-sm text-ink-3">Aucun téléphone sur la fiche : choisissez le contact dans WhatsApp.</p>}
          </div>
        ) : (
          <p className="text-sm text-ink-3">Préparation du lien…</p>
        )}
      </DialogContent>
    </DialogRoot>
  );
}

export function useWalletEnabled() {
  const { data } = useQuery({ queryKey: ["wallet-status"], queryFn: () => api.get<{ googleWallet: boolean }>("/app/wallet/status"), staleTime: 5 * 60_000 });
  return data?.googleWallet ?? false;
}

/** Notification Google Wallet à un client (3 au plus par carte et par 24 h, limite Google). */
export function WalletMessageDialog({ accountId }: { accountId: string }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", body: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <DialogRoot open={open} onOpenChange={setOpen}>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <BellRing /> Notification Wallet
      </Button>
      <DialogContent title="Envoyer une notification Google Wallet" description="Le client la reçoit sur son téléphone s’il a ajouté sa carte à Google Wallet.">
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await api.post(`/app/accounts/${accountId}/wallet-message`, f);
              toast.success("Notification Google Wallet envoyée");
              setF({ title: "", body: "" });
              setOpen(false);
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {error && <ErrorNote>{error}</ErrorNote>}
          <Field label="Titre">{(p) => <Input {...p} maxLength={60} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />}</Field>
          <Field label="Message" hint={`${f.body.length}/180`}>{(p) => <Textarea {...p} maxLength={180} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />}</Field>
          <Button type="submit" loading={busy} disabled={f.title.trim().length < 2 || f.body.trim().length < 2}>Envoyer la notification</Button>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}

/** Message à toutes les cartes Wallet d'un programme : saisie, puis confirmation avant l'envoi groupé. */
export function WalletBroadcast({ programId, programName }: { programId: string; programName: string }) {
  const [step, setStep] = useState<"closed" | "edit" | "confirm">("closed");
  const [f, setF] = useState({ title: "", body: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <DialogRoot open={step !== "closed"} onOpenChange={(o) => !busy && setStep(o ? "edit" : "closed")}>
      <Button size="sm" variant="ghost" onClick={() => setStep("edit")}>
        <BellRing /> Écrire aux clients Wallet
      </Button>
      <DialogContent
        title={step === "confirm" ? "Envoyer à tous les clients ?" : `Message aux clients « ${programName} »`}
        description={step === "confirm" ? "Chaque client qui a sa carte dans Google Wallet reçoit une notification sur son téléphone. L’envoi ne peut pas être annulé." : "Titre et message courts : ils s’affichent dans la notification. 3 notifications au plus par 24 h."}
      >
        {error && <ErrorNote>{error}</ErrorNote>}
        {step === "confirm" ? (
          <div className="grid gap-4">
            <div className="rounded-md bg-surface-2 p-4">
              <p className="font-semibold">{f.title}</p>
              <p className="mt-1 text-sm">{f.body}</p>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" disabled={busy} onClick={() => setStep("edit")}>Modifier</Button>
              <Button
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    await api.post(`/app/programs/${programId}/wallet-broadcast`, f);
                    toast.success("Notification envoyée à tous les clients Google Wallet");
                    setF({ title: "", body: "" });
                    setStep("closed");
                  } catch (e) {
                    setError(errorMessage(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Envoyer à tous
              </Button>
            </div>
          </div>
        ) : (
          <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); setError(null); setStep("confirm"); }}>
            <Field label="Titre">{(p) => <Input {...p} maxLength={60} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />}</Field>
            <Field label="Message" hint={`${f.body.length}/180`}>{(p) => <Textarea {...p} maxLength={180} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />}</Field>
            <Button type="submit" disabled={f.title.trim().length < 2 || f.body.trim().length < 2}>Relire avant l’envoi</Button>
          </form>
        )}
      </DialogContent>
    </DialogRoot>
  );
}
