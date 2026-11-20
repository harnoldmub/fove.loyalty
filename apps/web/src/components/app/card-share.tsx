"use client";

import { useQuery } from "@tanstack/react-query";
import { BellRing, Copy, Link2, MessageCircle, RefreshCw } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogRoot } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { ErrorNote } from "@/components/ui/misc";
import { api, useErrorMessage } from "@/lib/api";

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
  const toErrorMessage = useErrorMessage();
  const t = useTranslations("app.cardShare");
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
      if (renew) toast.success(t("renewed"));
      else if (res.cloudSent) toast.success(t("cloudSent"));
      setConfirmRenew(false);
    } catch (e) {
      setError(toErrorMessage(e));
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
        <Link2 /> {t("sendCard")}
      </Button>
      <DialogContent title={confirmRenew ? t("renewTitle") : t("title")} description={confirmRenew ? t("renewDescription") : t("description")}>
        {error && <ErrorNote>{error}</ErrorNote>}
        {confirmRenew ? (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setConfirmRenew(false)} disabled={busy}>{t("cancel")}</Button>
            <Button variant="danger" loading={busy} onClick={() => load(true)}>{t("renewConfirm")}</Button>
          </div>
        ) : share ? (
          <div className="grid gap-4">
            <div className="grid justify-items-center gap-2 rounded-md bg-white p-4">
              <QRCodeSVG value={share.url} size={168} marginSize={2} fgColor="#14204a" />
              <p className="text-center text-xs text-[#4a5579]">{t("scanHint")}</p>
            </div>
            <Button asChild className="bg-[#1f8f4e] text-white hover:bg-[#1a7a43]">
              <a href={share.whatsapp} target="_blank" rel="noreferrer">
                <MessageCircle /> {share.hasPhone ? t("sendWhatsapp") : t("shareWhatsapp")}
              </a>
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => navigator.clipboard.writeText(share.url).then(() => toast.success(t("copied")))}>
                <Copy /> {t("copy")}
              </Button>
              <Button variant="ghost" onClick={() => setConfirmRenew(true)}>
                <RefreshCw /> {t("newLink")}
              </Button>
            </div>
            {!share.hasPhone && <p className="text-sm text-ink-3">{t("noPhone")}</p>}
          </div>
        ) : (
          <p className="text-sm text-ink-3">{t("preparing")}</p>
        )}
      </DialogContent>
    </DialogRoot>
  );
}

export function useWalletEnabled() {
  const { data } = useQuery({ queryKey: ["wallet-status"], queryFn: () => api.get<{ googleWallet: boolean; appleWallet?: boolean }>("/app/wallet/status"), staleTime: 5 * 60_000 });
  return Boolean(data?.googleWallet || data?.appleWallet);
}

/** Notification Google Wallet à un client (3 au plus par carte et par 24 h, limite Google). */
export function WalletMessageDialog({ accountId }: { accountId: string }) {
  const toErrorMessage = useErrorMessage();
  const t = useTranslations("app.cardShare");
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", body: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <DialogRoot open={open} onOpenChange={setOpen}>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <BellRing /> {t("walletNotification")}
      </Button>
      <DialogContent title={t("messageTitle")} description={t("messageDescription")}>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await api.post(`/app/accounts/${accountId}/wallet-message`, f);
              toast.success(t("messageSent"));
              setF({ title: "", body: "" });
              setOpen(false);
            } catch (err) {
              setError(toErrorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {error && <ErrorNote>{error}</ErrorNote>}
          <Field label={t("fieldTitle")}>{(p) => <Input {...p} maxLength={60} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />}</Field>
          <Field label={t("fieldMessage")} hint={`${f.body.length}/180`}>{(p) => <Textarea {...p} maxLength={180} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />}</Field>
          <Button type="submit" loading={busy} disabled={f.title.trim().length < 2 || f.body.trim().length < 2}>{t("sendNotification")}</Button>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}

/** Message à toutes les cartes Wallet d'un programme : saisie, puis confirmation avant l'envoi groupé. */
export function WalletBroadcast({ programId, programName }: { programId: string; programName: string }) {
  const toErrorMessage = useErrorMessage();
  const t = useTranslations("app.cardShare");
  const [step, setStep] = useState<"closed" | "edit" | "confirm">("closed");
  const [f, setF] = useState({ title: "", body: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: tenant } = useQuery({ queryKey: ["tenant"], queryFn: () => api.get<{ features?: { walletCampaigns?: boolean } }>("/app/tenant") });
  const { data: wallet } = useQuery({ queryKey: ["wallet-status"], queryFn: () => api.get<{ googleWallet: boolean; appleWallet?: boolean }>("/app/wallet/status"), staleTime: 5 * 60_000 });
  const included = tenant?.features?.walletCampaigns;
  const configured = Boolean(wallet?.googleWallet || wallet?.appleWallet);
  // L'action reste visible pour rendre la montée en gamme ou la configuration nécessaire compréhensible.
  if (!included || !configured) {
    const reason = included === false ? t("proOnly") : included ? t("enableWallet") : t("checkingPlan");
    return (
      <Button size="sm" variant="ghost" disabled title={reason}>
        <BellRing /> {included === false ? t("broadcastPro") : t("writeWallet")}
      </Button>
    );
  }
  return (
    <DialogRoot open={step !== "closed"} onOpenChange={(o) => !busy && setStep(o ? "edit" : "closed")}>
      <Button size="sm" variant="ghost" onClick={() => setStep("edit")}>
        <BellRing /> {t("writeWallet")}
      </Button>
      <DialogContent
        title={step === "confirm" ? t("programConfirmTitle") : t("programTitle", { name: programName })}
        description={step === "confirm" ? t("programConfirmDescription") : t("programDescription")}
      >
        {error && <ErrorNote>{error}</ErrorNote>}
        {step === "confirm" ? (
          <div className="grid gap-4">
            <div className="rounded-md bg-surface-2 p-4">
              <p className="font-semibold">{f.title}</p>
              <p className="mt-1 text-sm">{f.body}</p>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" disabled={busy} onClick={() => setStep("edit")}>{t("edit")}</Button>
              <Button
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    await api.post(`/app/programs/${programId}/wallet-broadcast`, f);
                    toast.success(t("programSent"));
                    setF({ title: "", body: "" });
                    setStep("closed");
                  } catch (e) {
                    setError(toErrorMessage(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {t("sendAll")}
              </Button>
            </div>
          </div>
        ) : (
          <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); setError(null); setStep("confirm"); }}>
            <Field label={t("fieldTitle")}>{(p) => <Input {...p} maxLength={60} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />}</Field>
            <Field label={t("fieldMessage")} hint={`${f.body.length}/180`}>{(p) => <Textarea {...p} maxLength={180} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />}</Field>
            <Button type="submit" disabled={f.title.trim().length < 2 || f.body.trim().length < 2}>{t("review")}</Button>
          </form>
        )}
      </DialogContent>
    </DialogRoot>
  );
}

/** Message global depuis la vue d'ensemble, envoyé à tous les programmes actifs. */
export function TenantWalletBroadcast() {
  const toErrorMessage = useErrorMessage();
  const t = useTranslations("app.cardShare");
  const [step, setStep] = useState<"closed" | "edit" | "confirm">("closed");
  const [f, setF] = useState({ title: "", body: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: tenant } = useQuery({ queryKey: ["tenant"], queryFn: () => api.get<{ features?: { walletCampaigns?: boolean } }>("/app/tenant") });
  const { data: wallet } = useQuery({ queryKey: ["wallet-status"], queryFn: () => api.get<{ googleWallet: boolean; appleWallet?: boolean }>("/app/wallet/status"), staleTime: 5 * 60_000 });
  const included = Boolean(tenant?.features?.walletCampaigns);
  const configured = Boolean(wallet?.googleWallet || wallet?.appleWallet);
  const disabled = !included || !configured;
  const disabledReason = !included ? t("proOnly") : t("enableWallet");

  return (
    <DialogRoot open={step !== "closed"} onOpenChange={(o) => !busy && setStep(o ? "edit" : "closed")}>
      <Button variant="secondary" disabled={disabled} title={disabled ? disabledReason : undefined} onClick={() => setStep("edit")}>
        <BellRing /> {t("broadcastAll")}
      </Button>
      <DialogContent
        title={step === "confirm" ? t("tenantConfirmTitle") : t("tenantTitle")}
        description={step === "confirm" ? t("tenantConfirmDescription") : t("tenantDescription")}
      >
        {error && <ErrorNote>{error}</ErrorNote>}
        {step === "confirm" ? (
          <div className="grid gap-4">
            <div className="rounded-md bg-surface-2 p-4"><p className="font-semibold">{f.title}</p><p className="mt-1 text-sm">{f.body}</p></div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" disabled={busy} onClick={() => setStep("edit")}>{t("edit")}</Button>
              <Button loading={busy} onClick={async () => {
                setBusy(true); setError(null);
                try {
                  await api.post("/app/wallet-broadcast", f);
                  toast.success(t("tenantSent"));
                  setF({ title: "", body: "" }); setStep("closed");
                } catch (e) { setError(toErrorMessage(e)); }
                finally { setBusy(false); }
              }}>{t("sendAll")}</Button>
            </div>
          </div>
        ) : (
          <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); setError(null); setStep("confirm"); }}>
            <Field label={t("fieldTitle")}>{(p) => <Input {...p} maxLength={60} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />}</Field>
            <Field label={t("fieldMessage")} hint={`${f.body.length}/180`}>{(p) => <Textarea {...p} maxLength={180} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />}</Field>
            <Button type="submit" disabled={f.title.trim().length < 2 || f.body.trim().length < 2}>{t("review")}</Button>
          </form>
        )}
      </DialogContent>
    </DialogRoot>
  );
}
