"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { ReceiptText } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { TransactionList } from "@/components/app/history";
import type { Page, Transaction } from "@/components/app/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { EmptyState, PageHeader, Panel, Skeleton } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { TRANSACTION_KINDS, useKindLabel } from "@/lib/labels";

export default function TransactionsPage() {
  const t = useTranslations("app.transactions");
  const kindLabel = useKindLabel();
  // ?kind=CANCELLATIONS : lien « Annulations » du tableau de bord et de l'email d'alerte.
  const [kind, setKind] = useState(useSearchParams().get("kind") ?? "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const qs = new URLSearchParams({ limit: "30", ...(kind && { kind }), ...(from && { from }), ...(to && { to }) }).toString();
  const list = useInfiniteQuery({
    queryKey: ["transactions", qs],
    queryFn: ({ pageParam }) => api.get<Page<Transaction>>(`/app/transactions?${qs}${pageParam ? `&cursor=${pageParam}` : ""}`),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Field label={t("type")}>
          {(p) => (
            <Select {...p} value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">{t("all")}</option>
              <option value="CANCELLATIONS">{t("cancellations")}</option>
              {TRANSACTION_KINDS.map((k) => <option key={k} value={k}>{kindLabel(k)}</option>)}
            </Select>
          )}
        </Field>
        <Field label={t("from")}>{(p) => <Input {...p} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
        <Field label={t("to")}>{(p) => <Input {...p} type="date" value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
      </div>
      {list.isLoading ? (
        <Skeleton className="h-64" />
      ) : rows.length === 0 ? (
        <EmptyState icon={<ReceiptText />} title={t("empty")}>{t("emptyBody")}</EmptyState>
      ) : (
        <Panel className="overflow-hidden">
          <TransactionList items={rows} showCustomer />
          {list.hasNextPage && (
            <div className="border-t border-line p-3 text-center">
              <Button variant="ghost" onClick={() => list.fetchNextPage()} loading={list.isFetchingNextPage}>{t("more")}</Button>
            </div>
          )}
        </Panel>
      )}
    </>
  );
}
