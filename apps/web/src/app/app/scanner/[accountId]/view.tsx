"use client";

import Link from "next/link";
import { useAppRouter } from "@/lib/navigation-progress";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  MessageCircle,
  Plus,
  ScanLine,
  Sparkles,
  StickyNote,
  Tag,
  UserRound,
  Cake,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { computeRewardDiscount, buildWhatsAppLink } from "@fove/shared";
import { useRewardValueLabel } from "@/components/app/use-reward-value";
import { useWhatsAppMessage } from "@/components/app/use-whatsapp-message";
import { useActiveTenant, useCan } from "@/components/app/me-context";
import type { Account, Establishment } from "@/components/app/types";
import { Stamps, stampsStatus } from "@/components/stamps";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { Badge, ErrorNote, Panel, Skeleton } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, useErrorMessage } from "@/lib/api";
import { playChime } from "@/lib/sound";
import { useUnitLabel } from "@/lib/labels";
import { formatDate, formatNumber, newIdempotencyKey } from "@/lib/utils";

type Done = { kind: "earn"; delta: number; balance: number } | { kind: "redeem"; reward: string; balance: number; discount: string | null; purchaseAmount: string | null };

function readEstablishment(): string {
  try {
    return localStorage.getItem("fove:establishment") ?? "";
  } catch {
    return "";
  }
}

/** Fiche caisse ouverte après le scan : valider un achat ou une récompense, avec intelligence client Sidely. */
export function CheckoutView({ accountId }: { accountId: string }) {
  const toErrorMessage = useErrorMessage();
  const t = useTranslations("app.checkout");
  const ts = useTranslations("app.segment");
  const rewardValueLabel = useRewardValueLabel();
  const unitLabel = useUnitLabel();
  const buildMessage = useWhatsAppMessage();
  const router = useAppRouter();
  const qc = useQueryClient();
  const tenant = useActiveTenant();
  const canRedeem = useCan("redemptions.create");
  const canWriteCustomer = useCan("customers.write");
  const { data: account, error: loadError } = useQuery({
    queryKey: ["account", accountId],
    queryFn: () => api.get<Account>(`/app/accounts/${accountId}`),
  });
  const { data: establishments = [] } = useQuery({
    queryKey: ["establishments"],
    queryFn: () => api.get<Establishment[]>("/app/establishments"),
  });

  const [amount, setAmount] = useState("");
  const [purchaseAmount, setPurchaseAmount] = useState("");
  const [redeemKey, setRedeemKey] = useState(() => newIdempotencyKey("redeem"));
  const [saleRef, setSaleRef] = useState("");
  const [previewState, setPreviewState] = useState<{ amount: string; delta: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [establishmentChoice, setEstablishmentId] = useState(readEstablishment);
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [showNoteInput, setShowNoteInput] = useState(false);
  // Une clé par opération : un double appui ou une nouvelle tentative ne crédite qu'une fois.
  const [opKey] = useState(() => newIdempotencyKey("scan"));

  const activeEsts = useMemo(() => establishments.filter((e) => e.active), [establishments]);
  const establishmentId = activeEsts.some((e) => e.id === establishmentChoice) ? establishmentChoice : (activeEsts[0]?.id ?? "");
  const isPoints = account?.program.mode === "POINTS";
  const amountValid = /^\d+(\.\d{1,2})?$/.test(amount);
  const preview = previewState && previewState.amount === amount ? previewState.delta : null;
  const isFullStamps = !!account && !isPoints && account.balance >= account.program.stampsTarget;
  const stampsAddable = account && !isPoints ? Math.max(0, account.program.stampsTarget - account.balance) : 0;
  const nextStampsCount = account && !isPoints ? Math.min(account.program.stampsPerPurchase, stampsAddable) : 0;

  useEffect(() => {
    if (!account || !isPoints || !amountValid) return;
    const timer = setTimeout(() => {
      api
        .post<{ delta: number }>("/app/scanner/preview", { accountId: account.id, amount })
        .then((r) => setPreviewState({ amount, delta: r.delta }))
        .catch(() => setPreviewState(null));
    }, 250);
    return () => clearTimeout(timer);
  }, [amount, account, isPoints, amountValid]);

  const next = () => router.push("/app/scanner");

  if (loadError) {
    return (
      <div className="mx-auto grid max-w-md gap-4">
        <ErrorNote>{toErrorMessage(loadError)}</ErrorNote>
        <Button onClick={next}>
          <ScanLine /> {t("scanAnother")}
        </Button>
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
      playChime("earn");
      setDone({ kind: "earn", delta: res.transaction.delta, balance: res.transaction.balanceAfter });
      qc.invalidateQueries({ queryKey: ["overview"] });
      qc.invalidateQueries({ queryKey: ["account", accountId] });
    } catch (e) {
      setError(toErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const redeem = async (reward: Account["rewards"][number]) => {
    try {
      const result = await api.post<{ redemption: { discountAmount: string | null; purchaseAmount: string | null; rewardName: string; cost: number } }>("/app/redemptions", {
        accountId: account.id,
        rewardId: reward.id,
        establishmentId: establishmentId || null,
        purchaseAmount: reward.kind === "GIFT" ? null : purchaseAmount.replace(",", "."),
        idempotencyKey: `${redeemKey}:${reward.id}`,
      });
      playChime("redeem");
      setDone({ kind: "redeem", reward: result.redemption.rewardName, balance: account.balance - result.redemption.cost, discount: result.redemption.discountAmount, purchaseAmount: result.redemption.purchaseAmount });
      qc.invalidateQueries({ queryKey: ["account", accountId] });
    } catch (e) {
      toast.error(toErrorMessage(e));
      throw e;
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    setSavingNote(true);
    try {
      await api.post(`/app/customers/${account.customer.id}/notes`, { content: newNote.trim() });
      toast.success(t("noteSaved"));
      setNewNote("");
      setShowNoteInput(false);
      qc.invalidateQueries({ queryKey: ["account", accountId] });
    } catch (err) {
      toast.error(toErrorMessage(err));
    } finally {
      setSavingNote(false);
    }
  };

  // Préparation du message WhatsApp en 1 clic
  const whatsAppCardUrl = account.cardUrl ?? "";
  const whatsAppShareMessage = buildMessage("CARD_SHARE", {
    firstName: account.customer.firstName,
    store: tenant?.name || t("defaultStore"),
    balance: account.balance,
    unit: unitLabel(account.program.mode, account.balance),
    mode: account.program.mode,
    cardUrl: whatsAppCardUrl,
  });
  const whatsAppLink = buildWhatsAppLink(account.customer.phone, whatsAppShareMessage);

  if (done) {
    return (
      <div className="mx-auto grid max-w-md justify-items-center gap-5 pt-6 text-center">
        <CheckCircle2 className="size-14 text-mint animate-in zoom-in-75 duration-300" aria-hidden />
        <h1 className="font-display text-3xl font-semibold" role="status">
          {done.kind === "earn"
            ? done.delta > 0
              ? t("doneEarn", { amount: formatNumber(done.delta), unit: unitLabel(account.program.mode, done.delta), name: account.customer.firstName })
              : t("doneNoPoints")
            : t("doneRedeem", { reward: done.reward })}
        </h1>
        {done.kind === "redeem" && done.discount !== null && <p className="text-lg text-ink-2">{t.rich("discount", { discount: formatNumber(Number(done.discount)), rest: formatNumber(Number(done.purchaseAmount) - Number(done.discount)), currency: account.program.currency, strong: (c) => <strong>{c}</strong> })}</p>}
        <p className="text-lg text-ink-2">
          {t.rich("newBalance", { balance: formatNumber(done.balance), unit: unitLabel(account.program.mode, done.balance), strong: (c) => <strong className="tabular text-ink">{c}</strong> })}
        </p>

        {whatsAppLink && (
          <Button asChild variant="secondary" className="w-full">
            <a href={whatsAppLink} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="text-mint" /> {t("shareWhatsapp")}
            </a>
          </Button>
        )}

        <Button size="lg" className="w-full" onClick={next}>
          <ScanLine /> {t("nextCustomer")}
        </Button>
      </div>
    );
  }

  const unit = unitLabel(account.program.mode, account.balance);
  const affordable = account.rewards.filter((r) => r.affordable);
  const stampReward = account.program.mode === "STAMPS" ? (account.rewards[0]?.name ?? null) : null;
  const segment = account.segment;
  const tags = account.customer.tags ?? [];
  const notes = account.recentNotes ?? [];

  return (
    <div className="mx-auto grid max-w-md gap-5">
      {account.birthdayGift && <BirthdayGiftBanner accountId={account.id} gift={account.birthdayGift} />}

      {/* Panneau principal client avec RFM Sidely */}
      <Panel className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-semibold">
                {account.customer.firstName} {account.customer.lastName}
              </h1>
              {segment && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                    segment.segment === "VIP"
                      ? "bg-cobalt/15 text-cobalt"
                      : segment.segment === "AT_RISK"
                      ? "bg-stamp-soft text-stamp-ink dark:text-stamp"
                      : segment.segment === "NEW"
                      ? "bg-mint/15 text-mint"
                      : "bg-surface text-ink-2"
                  }`}
                  title={ts(`${segment.segment}.description`)}
                >
                  {segment.segment === "VIP" && <Sparkles className="size-3" />}
                  {ts(`${segment.segment}.label`)}
                </span>
              )}
            </div>
            <p className="text-sm text-ink-3 tabular">
              {account.program.name} · <span dir="ltr">{account.cardNumber}</span>
            </p>
          </div>
          <div className="flex items-center gap-1">
            {whatsAppLink && (
              <Button asChild variant="ghost" size="sm" title={t("shareWhatsappShort")}>
                <a href={whatsAppLink} target="_blank" rel="noopener noreferrer" aria-label={t("shareWhatsappShort")}>
                  <MessageCircle className="size-4 text-mint" />
                </a>
              </Button>
            )}
            <Button asChild variant="ghost" size="sm">
              <Link href={`/app/customers/${account.customer.id}`}>
                <UserRound /> {t("profile")}
              </Link>
            </Button>
          </div>
        </div>

        {/* Conseil d'accueil vendeur proactif Sidely */}
        {segment && (
          <div className="mt-3 rounded-md bg-subtle p-2.5 text-xs text-ink-2">
            <p><strong className="text-ink">{t("greetingTip")}</strong> {ts(`${segment.segment}.action`)}</p>
          </div>
        )}

        {/* Tags client */}
        {tags.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1">
            {tags.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1 rounded-sm bg-surface px-1.5 py-0.5 text-xs text-ink-2">
                <Tag className="size-2.5 opacity-60" /> {tag}
              </span>
            ))}
          </div>
        )}

        {/* Carte tampons ou solde de points */}
        {account.program.mode === "STAMPS" ? (
          <div className="mt-4 grid gap-2">
            <Stamps count={Math.min(account.balance, account.program.stampsTarget)} target={account.program.stampsTarget} reward={stampReward} size="sm" />
            <p className="text-sm text-ink-2">{stampsStatus(account.balance, account.program.stampsTarget, stampReward)}</p>
          </div>
        ) : (
          <p className="mt-4 font-display text-4xl font-semibold tabular">
            {formatNumber(account.balance)} <span className="text-lg font-normal text-ink-3">{unit}</span>
          </p>
        )}

        {account.status !== "ACTIVE" && (
          <Badge tone="danger" className="mt-3">
            {account.status === "BLOCKED" ? t("blocked") : t("pending")}
          </Badge>
        )}
        {affordable.length > 0 && account.status === "ACTIVE" && (
          <p className="mt-3 rounded-md bg-stamp-soft px-3 py-2 text-sm font-medium text-stamp-ink dark:text-stamp">
            {affordable.length === 1 ? t("oneAvailable", { name: affordable[0]!.name }) : t("available", { count: affordable.length })}
          </p>
        )}
      </Panel>

      {/* Mémos vendeurs terrain Sidely en caisse */}
      {(notes.length > 0 || showNoteInput) && (
        <Panel className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-ink-2 flex items-center gap-1">
              <StickyNote className="size-3.5" /> {t("notesTitle")}
            </span>
            {!showNoteInput && canWriteCustomer && (
              <Button variant="ghost" size="sm" onClick={() => setShowNoteInput(true)} className="h-7 text-xs">
                <Plus className="size-3" /> {t("addNote")}
              </Button>
            )}
          </div>
          {notes.length > 0 && (
            <div className="mt-2 grid gap-1.5">
              {notes.slice(0, 3).map((n) => (
                <div key={n.id} className="rounded-sm bg-subtle p-2 text-xs">
                  <span className="font-semibold text-ink">{t("noteAuthor", { name: n.authorName })}</span>{" "}
                  <span className="text-ink-2">{n.content}</span>
                </div>
              ))}
            </div>
          )}
          {showNoteInput && (
            <form onSubmit={handleAddNote} className="mt-3 grid gap-2">
              <Input
                autoFocus
                aria-label={t("newNote")}
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                className="text-xs"
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowNoteInput(false)} className="h-7 text-xs">
                  {t("cancel")}
                </Button>
                <Button type="submit" size="sm" loading={savingNote} className="h-7 text-xs">
                  {t("save")}
                </Button>
              </div>
            </form>
          )}
        </Panel>
      )}

      {/* Onglets d'action caisse */}
      <Tabs defaultValue={affordable.length > 0 && canRedeem ? "reward" : "earn"}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="earn">{t("tabEarn")}</TabsTrigger>
          <TabsTrigger value="reward" disabled={!canRedeem}>
            {t("tabReward")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="earn" className="mt-4 grid gap-4">
          {error && <ErrorNote>{error}</ErrorNote>}
          {isPoints && (
            <Field label={t("amount", { currency: account.program.currency })}>
              {(p) => (
                <Input
                  {...p}
                  autoFocus
                  inputMode="decimal"
                  className="h-14 text-2xl font-semibold tabular"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(",", ".").replace(/[^\d.]/g, ""))}
                />
              )}
            </Field>
          )}
          <Field label={t("saleRef")}>
            {(p) => <Input {...p} value={saleRef} onChange={(e) => setSaleRef(e.target.value)} />}
          </Field>
          {activeEsts.length > 1 && (
            <Field label={t("establishment")}>
              {(p) => (
                <Select
                  {...p}
                  value={establishmentId}
                  onChange={(e) => {
                    setEstablishmentId(e.target.value);
                    try {
                      localStorage.setItem("fove:establishment", e.target.value);
                    } catch {
                      /* stockage indisponible */
                    }
                  }}
                >
                  {activeEsts.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          <Button
            size="lg"
            variant="stamp"
            loading={busy}
            disabled={account.status !== "ACTIVE" || (isPoints && preview === null) || isFullStamps}
            onClick={earn}
          >
            {isPoints
              ? preview !== null
                ? t("addPoints", { amount: formatNumber(preview), unit: unitLabel("POINTS", preview) })
                : t("enterAmount")
              : isFullStamps
                ? t("full", { target: account.program.stampsTarget })
                : t("countVisit", { count: nextStampsCount })}
          </Button>
        </TabsContent>
        <TabsContent value="reward" className="mt-4 grid gap-3">
          {account.rewards.some((r) => r.kind !== "GIFT") && <Field label={t("amountBefore", { currency: account.program.currency })} hint={t("amountBeforeHint")}>
            {(p) => <Input {...p} inputMode="decimal" value={purchaseAmount} onChange={(e) => { setPurchaseAmount(e.target.value); setRedeemKey(newIdempotencyKey("redeem")); }} />}
          </Field>}
          {account.rewards.length === 0 && <p className="text-sm text-ink-2">{t("noRewards")}</p>}
          {account.rewards.map((r) => (
            <div key={r.id} className="flex items-center gap-3 rounded-md bg-surface p-3.5 shadow-1">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{r.name}</p>
                {r.kind !== "GIFT" && <p className="text-sm text-ink-2">{rewardValueLabel(r, account.program.currency)}{(() => { try { return ` · ${t("onPurchase", { amount: computeRewardDiscount(r, purchaseAmount.replace(",", ".")) ?? "", currency: account.program.currency })}`; } catch { return ""; } })()}</p>}
                <p className="text-sm text-ink-3 tabular">
                  {formatNumber(r.cost)} {unitLabel(account.program.mode, r.cost)}
                  {r.stock !== null && ` · ${t("stock", { count: r.stock })}`}
                </p>
              </div>
              <ConfirmDialog
                trigger={
                  <Button size="sm" variant={r.affordable ? "stamp" : "secondary"} disabled={!r.affordable || account.status !== "ACTIVE" || (r.kind !== "GIFT" && (!/^\d{1,12}(\.\d{1,2})?$/.test(purchaseAmount.replace(",", ".")) || Number(purchaseAmount.replace(",", ".")) <= 0))}>
                    {t("redeem")}
                  </Button>
                }
                title={t("redeemTitle", { name: r.name })}
                consequence={t("redeemConsequence", { amount: formatNumber(r.cost), unit: unitLabel(account.program.mode, r.cost), name: account.customer.firstName })}
                confirmLabel={t("redeemConfirm")}
                onConfirm={() => redeem(r)}
              />
            </div>
          ))}
        </TabsContent>
      </Tabs>
      <Button variant="ghost" onClick={next}>
        <ScanLine /> {t("scanAnother")}
      </Button>
    </div>
  );
}

/** Cadeau d'anniversaire disponible : affiché en tête du scan, utilisable une fois. */
function BirthdayGiftBanner({ accountId, gift }: { accountId: string; gift: { label: string; validUntil: string } }) {
  const t = useTranslations("app.checkout.birthday");
  const toErrorMessage = useErrorMessage();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  // validUntil est la fin (exclue) de la période : dernier jour = la veille.
  const lastDay = formatDate(new Date(new Date(gift.validUntil).getTime() - 1).toISOString());
  return (
    <Panel className="flex flex-wrap items-center gap-3 border-stamp/50 bg-stamp-soft p-4">
      <Cake className="size-6 shrink-0 text-stamp-ink" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">{t("title")}</p>
        <p className="text-sm text-ink-2">{t("body", { gift: gift.label, date: lastDay })}</p>
      </div>
      <Button
        variant="stamp"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await api.post(`/app/accounts/${accountId}/birthday-gift/use`);
            toast.success(t("used"));
            await qc.invalidateQueries({ queryKey: ["account", accountId] });
          } catch (e) {
            toast.error(toErrorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {t("use")}
      </Button>
    </Panel>
  );
}
