import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { CustomersView } from "./view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.meta");
  return { title: t("customers") };
}

export default function CustomersPage() {
  return (
    <Suspense>
      <CustomersView />
    </Suspense>
  );
}
