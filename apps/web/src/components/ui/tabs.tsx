"use client";

import * as T from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

export const Tabs = T.Root;
export function TabsList({ className, ...props }: ComponentProps<typeof T.List>) {
  return <T.List className={cn("inline-flex gap-1 rounded-md bg-surface-2 p-1", className)} {...props} />;
}
export function TabsTrigger({ className, ...props }: ComponentProps<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn("rounded-sm px-3 py-1.5 text-sm font-medium text-ink-2 transition-colors data-[state=active]:bg-surface data-[state=active]:text-ink data-[state=active]:shadow-1", className)}
      {...props}
    />
  );
}
export const TabsContent = T.Content;
