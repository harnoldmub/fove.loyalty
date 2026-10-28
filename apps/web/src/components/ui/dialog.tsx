"use client";

import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export const DialogRoot = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({ title, description, children, className }: { title: string; description?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-[rgb(13_20_48/0.45)] backdrop-blur-[2px] data-[state=open]:animate-in" />
      <D.Content
        className={cn(
          "fixed z-50 grid w-full gap-4 bg-surface p-6 shadow-2 focus:outline-none",
          "inset-x-0 bottom-0 max-h-[92dvh] overflow-y-auto rounded-t-[var(--radius-lg)] sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[var(--radius-lg)]",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="grid gap-1">
            <D.Title className="font-display text-xl font-semibold">{title}</D.Title>
            {description ? <D.Description className="text-sm text-ink-2">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
          </div>
          <D.Close className="-m-1 rounded-sm p-1 text-ink-3 hover:text-ink" aria-label="Fermer">
            <X className="size-5" />
          </D.Close>
        </div>
        {children}
      </D.Content>
    </D.Portal>
  );
}

interface ConfirmProps {
  trigger: ReactNode;
  title: string;
  /** Conséquence de l’action, en une phrase. */
  consequence: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => Promise<unknown>;
  children?: ReactNode;
}

/** Modale de confirmation du projet (jamais window.confirm). */
export function ConfirmDialog({ trigger, title, consequence, confirmLabel, destructive, onConfirm, children }: ConfirmProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <D.Root open={open} onOpenChange={(o) => !busy && setOpen(o)}>
      <D.Trigger asChild>{trigger}</D.Trigger>
      <DialogContent title={title} description={consequence}>
        {children}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
            Annuler
          </Button>
          <Button
            variant={destructive ? "danger" : "primary"}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                setOpen(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </D.Root>
  );
}
