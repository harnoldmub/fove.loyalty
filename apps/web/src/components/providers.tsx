"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { ThemeProvider } from "next-themes";
import { useEffect, useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { isLocale, isRtl } from "@/i18n/config";
import { initNativeApp } from "@/lib/native";

export function Providers({ children }: { children: ReactNode }) {
  const locale = useLocale();
  const t = useTranslations("common.toast");
  useEffect(() => {
    void initNativeApp();
  }, []);

  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false } } }));
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="light" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={client}>
        {children}
        <Toaster
          position="top-center"
          richColors
          closeButton
          dir={isLocale(locale) && isRtl(locale) ? "rtl" : "ltr"}
          containerAriaLabel={t("region")}
          toastOptions={{ closeButtonAriaLabel: t("close"), style: { fontFamily: "var(--font-figtree)" } }}
        />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
