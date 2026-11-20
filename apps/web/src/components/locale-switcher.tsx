"use client";

import { Languages } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { LOCALE_COOKIE, LOCALE_NAMES, LOCALES, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

/** Choix de la langue, mémorisé un an dans un cookie lu par le serveur. */
export function LocaleSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const t = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const change = (next: Locale) => {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    // Mémorisée aussi sur le compte (langue des emails) ; sans session, l'API répond 401 et on l'ignore.
    void fetch("/api/auth/locale", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Fove-Csrf": "1" },
      body: JSON.stringify({ locale: next }),
    }).catch(() => undefined);
    startTransition(() => router.refresh());
  };

  return (
    <label className={cn("relative inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-sm text-ink-2 hover:bg-surface-2", pending && "opacity-60", className)}>
      <Languages className="size-4 shrink-0" aria-hidden="true" />
      <span className="sr-only">{t("chooseLanguage")}</span>
      <select
        value={locale}
        onChange={(e) => change(e.target.value as Locale)}
        className="cursor-pointer appearance-none bg-transparent pe-1 font-medium text-ink outline-none focus-visible:outline-none"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l} lang={l}>
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
