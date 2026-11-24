"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { SuccessNote } from "@/components/ui/misc";
import { CodeStep } from "@/components/client/code-step";
import { api } from "@/lib/api";

/**
 * Sur la carte : invite un compte FOVE non confirmé (créé au scan) à confirmer son email
 * pour retrouver ses cartes sur n'importe quel téléphone. Rien ne s'affiche sans session client.
 */
export function AccountBanner({ onVerified }: { onVerified?: () => Promise<void> | void }) {
  const t = useTranslations("client.banner");
  const [email, setEmail] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ email: string; emailVerifiedAt: string | null }>("/client/me")
      .then((me) => !cancelled && !me.emailVerifiedAt && setEmail(me.email))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (done) {
    return (
      <SuccessNote>
        {t("done")}{" "}
        <Link href="/mes-cartes" className="font-semibold underline underline-offset-4">
          {t("myCards")}
        </Link>
      </SuccessNote>
    );
  }
  if (!email) return null;

  return (
    <section className="grid gap-3 rounded-[var(--radius-lg)] bg-surface p-5 shadow-1" aria-labelledby="confirmer-email">
      <h2 id="confirmer-email" className="font-display text-lg font-semibold">
        {t("title")}
      </h2>
      <p className="text-sm text-ink-2">{t("body", { email })}</p>
      {open ? (
        <CodeStep
          email={email}
          onVerified={async () => {
            setDone(true);
            await onVerified?.();
          }}
        />
      ) : (
        <Button variant="secondary" onClick={() => setOpen(true)}>
          {t("action")}
        </Button>
      )}
    </section>
  );
}
