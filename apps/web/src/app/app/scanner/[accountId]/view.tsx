"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ScanLine, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useCan } from "@/components/app/me-context";
import type { Account, Establishment } from "@/components/app/types";
import { Stamps, stampsStatus } from "@/components/stamps";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { Badge, ErrorNote, Panel, Skeleton } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, errorMessage } from "@/lib/api";
import { formatNumber, newIdempotencyKey, unitLabel } from "@/lib/utils";

type Done = { kind: "earn"; delta: number; balance: number } | { kind: "redeem"; reward: string; balance: number };

function readEstablishment(): string {
  try {
    return localStorage.getItem("fove:establishment") ?? "";
  } catch {
    return "";
  }
}

/** Fiche caisse ouverte après le scan : valider un achat ou une récompense. */
export function CheckoutView({ accountId }: { accountId: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const canRedeem = useCan("redemptions.create");
  const { data: account, error: loadError } = useQuery({ queryKey: ["account", accountId], queryFn: () => api.get<Account>(`/app/accounts/${accountId}`) });
  const { data: establishments = [] } = useQuery({ queryKey: ["establishments"], queryFn: () => api.get<Establishment[]>("/app/establishments") });
  const [amount, setAmount] = useState("");
  const [saleRef, setSaleRef] = useState("");
  const [previewState, setPreviewState] = useState<{ amount: string; delta: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [establishmentChoice, setEstablishmentId] = useState(readEstablishment);
  // Une clé par opération : un double appui ou une nouvelle tentative ne crédite qu'une fois.
  const [opKey] = useState(() => newIdempotencyKey("scan"));

  const activeEsts = useMemo(() => establishments.filter((e) => e.active), [establishments]);
  const establishmentId = activeEsts.some((e) => e.id === establishmentChoice) ? establishmentChoice : (activeEsts[0]?.id ?? "");
  const isPoints = account?.program.mode === "POINTS";
  const amountValid = /^\d+(\.\d{1,2})?$/.test(amount);
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

  const next = () => router.push("/app/scanner");

  if (loadError) {
    return (
      <div className="mx-auto grid max-w-md gap-4">
        <ErrorNote>{errorMessage(loadError)}</ErrorNote>
        <Button onClick={next}><ScanLine /> Scanner une autre carte</Button>
      </div>
    );
  }
  if (!account) return <Skeleton className="mx-auto h-96 max-w-md" />;

  const earn = async () => {
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
      qc.invalidateQueries({ queryKey: ["account", accountId] });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const redeem = async (reward: Account["rewards"][number]) => {
    try {
      await api.post("/app/redemptions", { accountId: account.id, rewardId: reward.id, establishmentId: establishmentId || null, idempotencyKey: newIdempotencyKey("redeem") });
      setDone({ kind: "redeem", reward: reward.name, balance: account.balance - reward.cost });
      qc.invalidateQueries({ queryKey: ["account", accountId] });
    } catch (e) {
      toast.error(errorMessage(e));
      throw e;
    }
  };

  if (done) {
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
        <Button size="lg" className="w-full" onClick={next}>
          <ScanLine /> Client suivant
        </Button>
      </div>
    );
  }

  const unit = unitLabel(account.program.mode, account.balance);
  const affordable = account.rewards.filter((r) => r.affordable);
  const stampReward = account.program.mode === "STAMPS" ? (account.rewards[0]?.name ?? null) : null;

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
          <Button asChild variant="ghost" size="sm">
            <Link href={`/app/customers/${account.customer.id}`}><UserRound /> Fiche</Link>
          </Button>
        </div>
        {account.program.mode === "STAMPS" ? (
          <div className="mt-4 grid gap-2">
            <Stamps count={account.balance} target={account.program.stampsTarget} reward={stampReward} size="sm" />
            <p className="text-sm text-ink-2">{stampsStatus(account.balance, account.program.stampsTarget, stampReward)}</p>
          </div>
        ) : (
          <p className="mt-4 font-display text-4xl font-semibold tabular">
            {formatNumber(account.balance)} <span className="text-lg font-normal text-ink-3">{unit}</span>
          </p>
        )}
        {account.status !== "ACTIVE" && (
          <Badge tone="danger" className="mt-3">{account.status === "BLOCKED" ? "Carte bloquée" : "Carte à valider : activez-la depuis la fiche client"}</Badge>
        )}
        {affordable.length > 0 && account.status === "ACTIVE" && (
          <p className="mt-3 rounded-md bg-stamp-soft px-3 py-2 text-sm font-medium text-stamp-ink dark:text-stamp">
            {affordable.length === 1 ? `${affordable[0]!.name} disponible` : `${affordable.length} récompenses disponibles`}
          </p>
        )}
      </Panel>

      <Tabs defaultValue={affordable.length > 0 && canRedeem ? "reward" : "earn"}>
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
          <Button size="lg" variant="stamp" loading={busy} disabled={account.status !== "ACTIVE" || (isPoints && preview === null)} onClick={earn}>
            {isPoints
              ? preview !== null
                ? `Ajouter ${formatNumber(preview)} ${unitLabel("POINTS", preview)}`
                : "Saisissez le montant"
              : `Compter le passage (+${account.program.stampsPerPurchase})`}
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
      <Button variant="ghost" onClick={next}>
        <ScanLine /> Scanner une autre carte
      </Button>
    </div>
  );
}
