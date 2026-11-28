"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { KeyRound, MonitorSmartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogRoot } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { OtpInput } from "@/components/ui/otp-input";
import { api, useErrorMessage } from "@/lib/api";
import { useCan, useMe } from "./me-context";

/** Choix (ou changement) de son code caisse : 4 chiffres, saisis deux fois. */
export function CashierPinDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("app.register.pin");
  const errMsg = useErrorMessage();
  const router = useRouter();
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [step, setStep] = useState<"choose" | "confirm">("choose");
  const [busy, setBusy] = useState(false);
  const reset = () => {
    setFirst("");
    setSecond("");
    setStep("choose");
  };

  const save = async (confirm: string) => {
    if (confirm !== first) {
      toast.error(t("mismatch"));
      reset();
      return;
    }
    setBusy(true);
    try {
      await api.put("/app/me/cashier-pin", { pin: first });
      toast.success(t("saved"));
      onOpenChange(false);
      reset();
      router.refresh();
    } catch (e) {
      toast.error(errMsg(e));
      reset();
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogRoot
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent title={t("title")}>
        <div className="grid gap-4">
          <p className="text-sm text-ink-2">{step === "choose" ? t("choose") : t("confirm")}</p>
          {step === "choose" ? (
            <OtpInput key="choose" length={4} secret autoFocus value={first} onChange={setFirst} onComplete={() => setStep("confirm")} />
          ) : (
            <OtpInput key="confirm" length={4} secret autoFocus value={second} onChange={setSecond} onComplete={(v) => void save(v)} disabled={busy} />
          )}
          <p className="text-xs text-ink-3">{t("hint")}</p>
        </div>
      </DialogContent>
    </DialogRoot>
  );
}

/** Invitation à choisir son code caisse (collaborateurs qui encaissent, tant qu'il n'est pas choisi). */
export function CashierPinBanner() {
  const t = useTranslations("app.register.pin");
  const me = useMe();
  const canCash = useCan("transactions.create");
  const [open, setOpen] = useState(false);
  if (me.cashierPinSet !== false || !canCash || me.support || me.register) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 border-b border-line bg-cobalt-soft px-4 py-2 text-sm text-ink">
      <KeyRound className="size-4 text-cobalt" aria-hidden />
      <span>{t("banner")}</span>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>{t("bannerCta")}</Button>
      <CashierPinDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

/** « Utiliser cet appareil comme caisse » (propriétaire ou gérant, sur l'appareil lui-même). */
export function ActivateRegisterButton() {
  const t = useTranslations("app.register.activate");
  const errMsg = useErrorMessage();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [establishmentId, setEstablishmentId] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: establishments = [] } = useQuery({
    queryKey: ["establishments"],
    queryFn: () => api.get<{ id: string; name: string; active: boolean }[]>("/app/establishments"),
    enabled: open,
  });
  const activate = async () => {
    setBusy(true);
    try {
      await api.post("/app/register/activate", { name: name.trim() || t("defaultName"), establishmentId: establishmentId || null });
      window.location.assign("/app/scanner");
    } catch (e) {
      toast.error(errMsg(e));
      setBusy(false);
    }
  };
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <MonitorSmartphone /> {t("button")}
      </Button>
      <DialogRoot open={open} onOpenChange={setOpen}>
        <DialogContent title={t("title")}>
          <div className="grid gap-4">
            <p className="text-sm text-ink-2">{t("help")}</p>
            <Field label={t("name")}>{(f) => <Input {...f} maxLength={40} placeholder={t("defaultName")} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
            {establishments.length > 0 && (
              <Field label={t("establishment")}>
                {(f) => (
                  <Select {...f} value={establishmentId} onChange={(e) => setEstablishmentId(e.target.value)}>
                    <option value="">{t("allEstablishments")}</option>
                    {establishments.filter((e) => e.active).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </Select>
                )}
              </Field>
            )}
            <p className="text-xs text-ink-3">{t("warning")}</p>
            <Button loading={busy} onClick={activate}>{t("confirm")}</Button>
          </div>
        </DialogContent>
      </DialogRoot>
    </>
  );
}
