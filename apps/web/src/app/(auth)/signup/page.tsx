import { Suspense } from "react";
import type { Metadata } from "next";
import { SignupForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Créer un compte", robots: { index: false } };

export default function Page() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
