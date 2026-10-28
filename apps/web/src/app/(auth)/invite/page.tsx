import { Suspense } from "react";
import type { Metadata } from "next";
import { AcceptInvite } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Invitation", robots: { index: false } };

export default function Page() {
  return (
    <Suspense>
      <AcceptInvite />
    </Suspense>
  );
}
