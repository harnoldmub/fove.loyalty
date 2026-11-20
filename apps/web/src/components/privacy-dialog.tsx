"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { FileCheck2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogContent, DialogRoot, DialogTrigger } from "@/components/ui/dialog";

const bold = (chunks: ReactNode) => <strong>{chunks}</strong>;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="font-semibold text-ink">{title}</h3>
      <p className="mt-1 leading-relaxed">{children}</p>
    </div>
  );
}

function CloseFooter() {
  const t = useTranslations("auth.legal");
  return (
    <div className="flex justify-end pt-3 border-t border-line">
      <DialogClose asChild>
        <Button variant="secondary" size="sm">
          {t("close")}
        </Button>
      </DialogClose>
    </div>
  );
}

function TriggerLink({ children }: { children: ReactNode }) {
  return (
    <button type="button" onClick={(e) => e.stopPropagation()} className="text-cobalt underline hover:text-cobalt-hover">
      {children}
    </button>
  );
}

const TERMS_SECTIONS = ["purpose", "account", "plans", "data", "security"] as const;
const PRIVACY_SECTIONS = ["consent", "rights", "retention", "security"] as const;

export function TermsDialog({ trigger }: { trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("auth.terms");

  return (
    <DialogRoot open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger ?? <TriggerLink>{t("trigger")}</TriggerLink>}</DialogTrigger>
      <DialogContent title={t("title")} description={t("description")} className="sm:max-w-2xl">
        <div className="max-h-[60vh] space-y-5 overflow-y-auto pe-1 text-sm text-ink-2">
          <div className="flex items-center gap-2 rounded-md bg-cobalt-soft p-3 text-cobalt">
            <FileCheck2 className="size-5 shrink-0" />
            <p className="text-xs font-medium">{t("highlight")}</p>
          </div>
          {TERMS_SECTIONS.map((key) => (
            <Section key={key} title={t(`${key}.title`)}>
              {t.rich(`${key}.text`, { b: bold })}
            </Section>
          ))}
        </div>
        <CloseFooter />
      </DialogContent>
    </DialogRoot>
  );
}

export function PrivacyDialog({ trigger }: { trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("auth.privacy");

  return (
    <DialogRoot open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger ?? <TriggerLink>{t("trigger")}</TriggerLink>}</DialogTrigger>
      <DialogContent title={t("title")} description={t("description")} className="sm:max-w-2xl">
        <div className="max-h-[60vh] space-y-5 overflow-y-auto pe-1 text-sm text-ink-2">
          <div className="flex items-center gap-2 rounded-md bg-mint/10 p-3 text-mint-ink dark:text-mint">
            <ShieldCheck className="size-5 shrink-0" />
            <p className="text-xs font-medium">{t("highlight")}</p>
          </div>
          <Section title={t("controller.title")}>{t.rich("controller.text", { b: bold })}</Section>
          <div>
            <h3 className="font-semibold text-ink">{t("collected.title")}</h3>
            <ul className="mt-1.5 list-disc space-y-1 ps-5">
              <li>{t.rich("collected.merchants", { b: bold })}</li>
              <li>{t.rich("collected.customers", { b: bold })}</li>
            </ul>
          </div>
          {PRIVACY_SECTIONS.map((key) => (
            <Section key={key} title={t(`${key}.title`)}>
              {t.rich(`${key}.text`, { b: bold })}
            </Section>
          ))}
        </div>
        <CloseFooter />
      </DialogContent>
    </DialogRoot>
  );
}
