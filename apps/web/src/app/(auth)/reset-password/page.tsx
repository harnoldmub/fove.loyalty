import { Suspense } from "react";
import type { Metadata } from "next";
import { ResetForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Nouveau mot de passe", robots: { index: false } };

export default function Page() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
