"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Gift, ScanLine, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useCan } from "@/components/app/me-context";
import type { Account, CustomerRow, Establishment, Page } from "@/components/app/types";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { Badge, ErrorNote, Panel } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, errorMessage } from "@/lib/api";
import { formatNumber, newIdempotencyKey, unitLabel } from "@/lib/utils";
import { QrCamera } from "./camera";

type Done = { kind: "earn"; delta: number; balance: number } | { kind: "redeem"; reward: string; balance: number };

function readEstablishment(): string {
  try {
    return localStorage.getItem("fove:establishment") ?? "";
  } catch {
    return "";
  }
}

export function ScannerView() {
  const qc = useQueryClient();
  const canRedeem = useCan("redemptions.create");
  const [mode, setMode] = useState<"camera" | "search">("camera");
  const [account, setAccount] = useState<Account | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CustomerRow[] | null>(null);
  const [amount, setAmount] = useState("");
  const [saleRef, setSaleRef] = useState("");
  const [previewState, setPreviewState] = useState<{ amount: string; delta: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [establishmentChoice, setEstablishmentId] = useState(readEstablishment);
  // Une clé par opération : un double appui ou une nouvelle tentative ne crédite qu’une fois.
  const [opKey, setOpKey] = useState(() => newIdempotencyKey("scan"));

  const { data: establishments = [] } = useQuery({ queryKey: ["establishments"], queryFn: () => api.get<Establishment[]>("/app/establishments") });
  const activeEsts = useMemo(() => establishments.filter((e) => e.active), [establishments]);
  const establishmentId = activeEsts.some((e) => e.id === establishmentChoice) ? establishmentChoice : (activeEsts[0]?.id ?? "");

  const isPoints = account?.program.mode === "POINTS";
  const amountValid = /^\d+(\.\d{1,2})?$/.test(amount);
  // Aperçu calculé par le serveur ; ignoré dès que le montant saisi change.
  const preview = previewState && previewState.amount === amount ? previewState.delta : null;

  useEffect(() => {
    if (!account || !isPoints || !amountValid) return;
    const t = setTimeout(() => {
      api
        .post<{ delta: number }>("/app/scanner/preview", { accountId: account.id, amount })
        .then((r) => setPreviewState({ amount, delta: r.delta }))
        .catch(() => setPreviewState(null));
    }, 250);
    return () => clearTimeout(t);
  }, [amount, account, isPoints, amountValid]);

  const reset = () => {
    setAccount(null);
    setAmount("");
    setSaleRef("");
    setPreviewState(null);
    setDone(null);
    setError(null);
    setResults(null);
    setQ("");
    setOpKey(newIdempotencyKey("scan"));
  };

  const lookup = async (code: string) => {
    if (busy || account) return;
    setBusy(true);
    setLookupError(null);
    try {
      setAccount(await api.post<Account>("/app/scanner/lookup", { code }));
      navigator.vibrate?.(40);
    } catch (e) {
      setLookupError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setLookupError(null);
    try {
      const res = await api.get<Page<CustomerRow>>(`/app/customers?limit=10&q=${encodeURIComponent(q.trim())}`);
      setResults(res.data);
    } catch (err) {
      setLookupError(errorMessage(err));
    }
  };

  const pickAccount = async (id: string) => {
    try {
      setAccount(await api.get<Account>(`/app/accounts/${id}`));
    } catch (e) {
      setLookupError(errorMessage(e));
    }
  };

  const earn = async () => {
    if (!account) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ transaction: { delta: number; balanceAfter: number } }>("/app/transactions/earn", {
        accountId: account.id,
        amount: isPoints ? amount : null,
        saleReference: saleRef || null,
        establishmentId: establishmentId || null,
        idempotencyKey: opKey,
      });
      setDone({ kind: "earn", delta: res.transaction.delta, balance: res.transaction.balanceAfter });
      qc.invalidateQueries({ queryKey: ["overview"] });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const redeem = async (reward: Account["rewards"][number]) => {
    if (!account) return;
    try {
      await api.post("/app/redemptions", { accountId: account.id, rewardId: reward.id, establishmentId: establishmentId || null, idempotencyKey: opKey });
      setDone({ kind: "redeem", reward: reward.name, balance: account.balance - reward.cost });
    } catch (e) {
      toast.error(errorMessage(e));
      throw e;
    }
  };

  if (done && account) {
    return (
      <div className="mx-auto grid max-w-md justify-items-center gap-5 pt-6 text-center">
        <CheckCircle2 className="size-14 text-mint" aria-hidden />
        <h1 className="font-display text-3xl font-semibold" role="status">
          {done.kind === "earn"
            ? done.delta > 0
              ? `+${formatNumber(done.delta)} ${unitLabel(account.program.mode, done.delta)} pour ${account.customer.firstName}`
              : "Achat enregistré, sans points pour ce montant"
            : `${done.reward} validé`}
        </h1>
        <p className="text-lg text-ink-2">
          Nouveau solde : <strong className="tabular text-ink">{formatNumber(done.balance)}</strong> {unitLabel(account.program.mode, done.balance)}
        </p>
        <Button size="lg" className="w-full" onClick={reset}>
          <ScanLine /> Client suivant
        </Button>
      </div>
    );
  }

  if (account) {
    const unit = unitLabel(account.program.mode, account.balance);
    const affordable = account.rewards.filter((r) => r.affordable);
    return (
      <div className="mx-auto grid max-w-md gap-5">
        <Panel className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="font-display text-2xl font-semibold">
                {account.customer.firstName} {account.customer.lastName}
              </h1>
              <p className="text-sm text-ink-3 tabular">{account.program.name} · {account.cardNumber}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={reset}>Changer</Button>
          </div>
          <p className="mt-4 font-display text-4xl font-semibold tabular">
            {formatNumber(account.balance)} <span className="text-lg font-normal text-ink-3">{unit}</span>
          </p>
          {account.program.mode === "STAMPS" && (
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={account.program.stampsTarget} aria-valuenow={Math.min(account.balance, account.program.stampsTarget)} aria-label="Progression vers la récompense">
              <div className="h-full rounded-full bg-stamp" style={{ width: `${Math.min(100, (account.balance / account.program.stampsTarget) * 100)}%` }} />
            </div>
          )}
          {account.status !== "ACTIVE" && (
            <Badge tone="danger" className="mt-3">{account.status === "BLOCKED" ? "Carte bloquée" : "Carte à valider : activez-la depuis la fiche client"}</Badge>
          )}
          {affordable.length > 0 && account.status === "ACTIVE" && (
            <p className="mt-3 flex items-center gap-2 rounded-md bg-stamp-soft px-3 py-2 text-sm font-medium text-stamp-ink dark:text-stamp">
              <Gift className="size-4" aria-hidden /> {affordable.length === 1 ? `${affordable[0]!.name} disponible` : `${affordable.length} récompenses disponibles`}
            </p>
          )}
        </Panel>

        <Tabs key={`actions-${account.id}`} defaultValue="earn">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="earn">Valider un achat</TabsTrigger>
            <TabsTrigger value="reward" disabled={!canRedeem}>Récompense</TabsTrigger>
          </TabsList>
          <TabsContent value="earn" className="mt-4 grid gap-4">
            {error && <ErrorNote>{error}</ErrorNote>}
            {isPoints && (
              <Field label={`Montant de l’achat (${account.program.currency})`}>
                {(p) => <Input {...p} autoFocus inputMode="decimal" className="h-14 text-2xl font-semibold tabular" value={amount} onChange={(e) => setAmount(e.target.value.replace(",", ".").replace(/[^\d.]/g, ""))} placeholder="0" />}
              </Field>
            )}
            <Field label="Référence du ticket (facultatif)">{(p) => <Input {...p} value={saleRef} onChange={(e) => setSaleRef(e.target.value)} />}</Field>
            {activeEsts.length > 1 && (
              <Field label="Établissement">
                {(p) => (
                  <Select
                    {...p}
                    value={establishmentId}
                    onChange={(e) => {
                      setEstablishmentId(e.target.value);
                      try {
                        localStorage.setItem("fove:establishment", e.target.value);
                      } catch {
                        /* stockage indisponible : choix non mémorisé */
                      }
                    }}
                  >
                    {activeEsts.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </Select>
                )}
              </Field>
            )}
            <Button size="lg" variant="stamp" loading={busy} disabled={account.status !== "ACTIVE" || (isPoints && !preview && preview !== 0) || (isPoints && !amount)} onClick={earn}>
              {isPoints
                ? preview !== null
                  ? `Ajouter ${formatNumber(preview)} ${unitLabel("POINTS", preview)}`
                  : "Saisissez le montant"
                : `Ajouter ${account.program.stampsPerPurchase} ${unitLabel("STAMPS", account.program.stampsPerPurchase)}`}
            </Button>
          </TabsContent>
          <TabsContent value="reward" className="mt-4 grid gap-3">
            {account.rewards.length === 0 && <p className="text-sm text-ink-2">Aucune récompense dans ce programme.</p>}
            {account.rewards.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-md bg-surface p-3.5 shadow-1">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{r.name}</p>
                  <p className="text-sm text-ink-3 tabular">
                    {formatNumber(r.cost)} {unitLabel(account.program.mode, r.cost)}
                    {r.stock !== null && ` · ${r.stock} en stock`}
                  </p>
                </div>
                <ConfirmDialog
                  trigger={<Button size="sm" variant={r.affordable ? "stamp" : "secondary"} disabled={!r.affordable || account.status !== "ACTIVE"}>Valider</Button>}
                  title={`Valider « ${r.name} » ?`}
                  consequence={`${formatNumber(r.cost)} ${unitLabel(account.program.mode, r.cost)} seront retirés de la carte de ${account.customer.firstName}. Remettez la récompense au client.`}
                  confirmLabel="Valider la récompense"
                  onConfirm={() => redeem(r)}
                />
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-md gap-5">
      <div>
        <h1 className="font-display text-2xl font-semibold">Scanner une carte</h1>
        <p className="text-ink-2">Visez le QR code affiché sur le téléphone du client.</p>
      </div>
      <Tabs key="identify" value={mode} onValueChange={(v) => setMode(v as "camera" | "search")}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="camera"><ScanLine className="mr-1.5 inline size-4" aria-hidden />Caméra</TabsTrigger>
          <TabsTrigger value="search"><Search className="mr-1.5 inline size-4" aria-hidden />Recherche</TabsTrigger>
        </TabsList>
      </Tabs>
      {lookupError && <ErrorNote>{lookupError}</ErrorNote>}
      {mode === "camera" ? (
        <QrCamera onCode={lookup} />
      ) : (
        <div className="grid gap-4">
          <form onSubmit={search} className="flex gap-2">
            <Input autoFocus aria-label="Nom, téléphone ou numéro de carte" placeholder="Nom, téléphone ou FV-XXXX-XXXX" value={q} onChange={(e) => setQ(e.target.value)} />
            <Button type="submit" variant="secondary">Chercher</Button>
          </form>
          {results?.length === 0 && <p className="text-sm text-ink-2">Aucun client trouvé.</p>}
          {results && results.length > 0 && (
            <ul className="grid gap-2">
              {results.flatMap((c) =>
                c.accounts.map((a) => (
                  <li key={a.id}>
                    <button onClick={() => pickAccount(a.id)} className="flex w-full items-center justify-between gap-3 rounded-md bg-surface p-3.5 text-left shadow-1 hover:bg-surface-2">
                      <span>
                        <span className="block font-medium">{c.firstName} {c.lastName}</span>
                        <span className="block text-sm text-ink-3 tabular">{c.phone ?? c.email} · {a.cardNumber}</span>
                      </span>
                      <span className="font-display text-lg font-semibold tabular">{formatNumber(a.balance)}</span>
                    </button>
                  </li>
                )),
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
