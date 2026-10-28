import { Suspense } from "react";
import type { Metadata } from "next";
import { VerifyEmail } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Vérification de l’email", robots: { index: false } };

export default function Page() {
  return (
    <Suspense>
      <VerifyEmail />
    </Suspense>
  );
}
