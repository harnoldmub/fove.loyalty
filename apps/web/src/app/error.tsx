"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string; status?: number };
  reset: () => void;
}) {
  const t = useTranslations("common.errorPage");
  const isAuthError =
    error?.status === 401 ||
    error?.status === 403 ||
    /session|expir|401|403|unauthorized/i.test(error?.message ?? "");

  useEffect(() => {
    if (isAuthError && typeof window !== "undefined") {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.replace(`/login?next=${next}`);
    }
  }, [isAuthError]);

  if (isAuthError) {
    return (
      <main id="contenu" className="mx-auto grid min-h-dvh max-w-md content-center justify-items-start gap-4 px-4">
        <h1 className="font-display text-3xl font-semibold">{t("sessionTitle")}</h1>
        <p className="text-ink-2">{t("sessionBody")}</p>
        <Button
          onClick={() => {
            const next = encodeURIComponent(window.location.pathname + window.location.search);
            window.location.replace(`/login?next=${next}`);
          }}
        >
          {t("reconnect")}
        </Button>
      </main>
    );
  }

  return (
    <main id="contenu" className="mx-auto grid min-h-dvh max-w-md content-center justify-items-start gap-4 px-4">
      <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
      <p className="text-ink-2">{t("body")}</p>
      <Button onClick={reset}>{t("retry")}</Button>
    </main>
  );
}
