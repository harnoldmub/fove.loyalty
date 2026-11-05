import { serverGet } from "@/lib/server-api";
import { PricingTable, type Plan } from "./pricing-table";

/** Offres lues depuis l’API : les prix se modifient dans l’administration FOVE, jamais dans le code. */
export async function Pricing() {
  const { data: plans } = await serverGet<Plan[]>("/plans");
  if (!plans?.length) {
    return <p className="rounded-md bg-surface px-4 py-3 text-ink-2 shadow-1">Les tarifs sont momentanément indisponibles. Réessayez dans un instant.</p>;
  }

  return <PricingTable plans={plans} />;
}
