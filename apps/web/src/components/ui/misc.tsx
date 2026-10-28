import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[var(--radius-lg)] bg-surface shadow-1", className)} {...props} />;
}

const tones = {
  neutral: "bg-surface-2 text-ink-2",
  cobalt: "bg-cobalt-soft text-cobalt",
  mint: "bg-mint-soft text-mint",
  stamp: "bg-stamp-soft text-stamp-ink dark:text-stamp",
  danger: "bg-danger-soft text-danger",
};

export function Badge({ tone = "neutral", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof tones }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone], className)} {...props} />;
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="grid justify-items-center gap-3 rounded-[var(--radius-lg)] border border-dashed border-line-strong px-6 py-12 text-center">
      {icon && <div className="text-ink-3 [&_svg]:size-7">{icon}</div>}
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      {children && <p className="max-w-sm text-sm text-ink-2">{children}</p>}
      {action}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="grid gap-1">
        <h1 className="font-display text-2xl font-semibold sm:text-[1.75rem]">{title}</h1>
        {description && <p className="text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-2", className)} aria-hidden />;
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-md bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
      {children}
    </p>
  );
}
