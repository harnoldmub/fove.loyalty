"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { ReceiptText } from "lucide-react";
import { useState } from "react";
import { TransactionList } from "@/components/app/history";
import type { Page, Transaction } from "@/components/app/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { EmptyState, PageHeader, Panel, Skeleton } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { KIND_LABEL } from "@/lib/utils";

export default function TransactionsPage() {
  const [kind, setKind] = useState("");
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
      <PageHeader title="Transactions" description="Toutes les opérations, dans l’ordre. Rien ne s’efface : une erreur se corrige par une annulation." />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Field label="Type">
          {(p) => (
            <Select {...p} value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">Tous</option>
              {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Du">{(p) => <Input {...p} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
        <Field label="Au">{(p) => <Input {...p} type="date" value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
      </div>
      {list.isLoading ? (
        <Skeleton className="h-64" />
      ) : rows.length === 0 ? (
        <EmptyState icon={<ReceiptText />} title="Aucune opération">Les achats validés au scanner apparaîtront ici.</EmptyState>
      ) : (
        <Panel className="overflow-hidden">
          <TransactionList items={rows} showCustomer />
          {list.hasNextPage && (
            <div className="border-t border-line p-3 text-center">
              <Button variant="ghost" onClick={() => list.fetchNextPage()} loading={list.isFetchingNextPage}>Afficher plus</Button>
            </div>
          )}
        </Panel>
      )}
    </>
  );
}
