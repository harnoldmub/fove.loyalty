"use client";

import { useAppRouter } from "@/lib/navigation-progress";
import { Search, ScanLine } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { CustomerRow, Page } from "@/components/app/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { ErrorNote } from "@/components/ui/misc";
import { api, useErrorMessage } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { QrCamera, useRestartKey } from "./camera";

/** Écran de scan de la caisse : le viseur seul ; une carte lue ouvre sa fiche sur une page dédiée. */
export default function ScannerPage() {
  const toErrorMessage = useErrorMessage();
  const t = useTranslations("app.scanner");
  const router = useAppRouter();
  const [mode, setMode] = useState<"camera" | "search">("camera");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraKey, restartCamera] = useRestartKey();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CustomerRow[] | null>(null);

  const open = (accountId: string) => router.push(`/app/scanner/${accountId}`);

  const lookup = async (code: string) => {
    setBusy(true);
    setError(null);
    try {
      const account = await api.post<{ id: string }>("/app/scanner/lookup", { code });
      open(account.id);
    } catch (e) {
      setError(toErrorMessage(e));
      setBusy(false);
      restartCamera();
    }
  };

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setError(null);
    try {
      setResults((await api.get<Page<CustomerRow>>(`/app/customers?limit=10&q=${encodeURIComponent(q.trim())}`)).data);
    } catch (err) {
      setError(toErrorMessage(err));
    }
  };

  return (
    <section aria-labelledby="scan-title" className="mx-auto grid w-full max-w-md gap-5 text-center">
      <div>
        <h1 id="scan-title" className="font-display text-[clamp(1.75rem,6vw,2.4rem)] font-semibold">{mode === "camera" ? t("title") : t("searchTitle")}</h1>
        <p className="mt-1 text-ink-2">{mode === "camera" ? t("description") : t("searchDescription")}</p>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      {mode === "camera" ? (
        <>
          <QrCamera key={cameraKey} onCode={lookup} busy={busy} />
          <button type="button" onClick={() => setMode("search")} className="inline-flex min-h-11 items-center justify-center gap-2 text-sm font-medium underline underline-offset-4">
            <Search className="size-4" aria-hidden /> {t("noCard")}
          </button>
        </>
      ) : (
        <div className="grid gap-4 text-start">
          <form onSubmit={search} className="flex gap-2">
            <Input autoFocus aria-label={t("searchLabel")} value={q} onChange={(e) => setQ(e.target.value)} />
            <Button type="submit" variant="secondary">{t("search")}</Button>
          </form>
          {results?.length === 0 && <p className="text-sm text-ink-2">{t("noResults")}</p>}
          {results && results.length > 0 && (
            <ul className="grid gap-2">
              {results.flatMap((c) =>
                c.accounts.map((a) => (
                  <li key={a.id}>
                    <button onClick={() => open(a.id)} className="flex w-full items-center justify-between gap-3 rounded-md bg-surface p-3.5 text-start shadow-1 hover:bg-surface-2">
                      <span>
                        <span className="block font-medium">{c.firstName} {c.lastName}</span>
                        <span className="block text-sm text-ink-3 tabular">{c.phone ?? c.email} · <span dir="ltr">{a.cardNumber}</span></span>
                      </span>
                      <span className="font-display text-lg font-semibold tabular">{formatNumber(a.balance)}</span>
                    </button>
                  </li>
                )),
              )}
            </ul>
          )}
          <Button variant="ghost" onClick={() => setMode("camera")}>
            <ScanLine /> {t("back")}
          </Button>
        </div>
      )}
    </section>
  );
}
