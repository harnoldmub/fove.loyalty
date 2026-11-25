"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";

/**
 * « Se connecter », ou « Mon espace » si la session est valide. Vérifié dans le navigateur pour que
 * les pages de la vitrine restent statiques (aucun cookie lu côté serveur).
 */
export function AccountLink({ className }: { className?: string }) {
  const t = useTranslations("marketing.header");
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let cancelled = false;
    api
      .get("/auth/me")
      .then(() => !cancelled && setSignedIn(true))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <Link href={signedIn ? "/app" : "/login"} className={className}>
      {signedIn ? t("myArea") : t("login")}
    </Link>
  );
}
