"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  CreditCard,
  FileText,
  Landmark,
  Receipt,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Users,
  WalletCards,
  ArrowDownRight,
} from "lucide-react";

const FINANCE_TABS = [
  { href: "/admin/finance", label: "Vue d'ensemble", icon: TrendingUp, exact: true },
  { href: "/admin/finance/sales", label: "Ventes", icon: Receipt, exact: false },
  { href: "/admin/finance/payments", label: "Paiements", icon: CreditCard, exact: false },
  { href: "/admin/finance/subscriptions", label: "Abonnements", icon: RefreshCw, exact: false },
  { href: "/admin/finance/customers", label: "Clients", icon: Users, exact: false },
  { href: "/admin/finance/invoices", label: "Factures", icon: FileText, exact: false },
  { href: "/admin/finance/commissions", label: "Partenaires", icon: WalletCards, exact: false },
  { href: "/admin/finance/expenses", label: "Dépenses", icon: ArrowDownRight, exact: false },
  { href: "/admin/finance/treasury", label: "Trésorerie", icon: Landmark, exact: false },
  { href: "/admin/finance/reports", label: "Rapports associés", icon: BarChart3, exact: false },
  { href: "/admin/finance/audit", label: "Audit", icon: ShieldCheck, exact: false },
];

export function FinanceNav() {
  const pathname = usePathname();

  const isCurrent = (href: string, exact: boolean) => {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  };

  return (
    <div className="mb-6 -mx-4 overflow-x-auto border-b border-line px-4 sm:-mx-8 sm:px-8">
      <nav className="flex space-x-1" aria-label="Sections financières">
        {FINANCE_TABS.map((tab) => {
          const active = isCurrent(tab.href, tab.exact);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-medium transition-colors sm:text-sm",
                active
                  ? "border-cobalt text-ink font-semibold"
                  : "border-transparent text-ink-3 hover:border-line hover:text-ink-2"
              )}
            >
              <Icon className={cn("size-3.5 sm:size-4", active ? "text-cobalt" : "text-ink-3")} />
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

