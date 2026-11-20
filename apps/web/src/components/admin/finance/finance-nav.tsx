"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
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
  { href: "/admin/finance", label: "overview", icon: TrendingUp, exact: true },
  { href: "/admin/finance/sales", label: "sales", icon: Receipt, exact: false },
  { href: "/admin/finance/payments", label: "payments", icon: CreditCard, exact: false },
  { href: "/admin/finance/subscriptions", label: "subscriptions", icon: RefreshCw, exact: false },
  { href: "/admin/finance/customers", label: "customers", icon: Users, exact: false },
  { href: "/admin/finance/invoices", label: "invoices", icon: FileText, exact: false },
  { href: "/admin/finance/commissions", label: "commissions", icon: WalletCards, exact: false },
  { href: "/admin/finance/expenses", label: "expenses", icon: ArrowDownRight, exact: false },
  { href: "/admin/finance/treasury", label: "treasury", icon: Landmark, exact: false },
  { href: "/admin/finance/reports", label: "reports", icon: BarChart3, exact: false },
  { href: "/admin/finance/audit", label: "audit", icon: ShieldCheck, exact: false },
] as const;

export function FinanceNav() {
  const pathname = usePathname();
  const t = useTranslations("admin.finance.nav");

  const isCurrent = (href: string, exact: boolean) => {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  };

  return (
    <div className="mb-6 -mx-4 overflow-x-auto border-b border-line px-4 sm:-mx-8 sm:px-8">
      <nav className="flex space-x-1" aria-label={t("ariaLabel")}>
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
              {t(`tabs.${tab.label}`)}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

