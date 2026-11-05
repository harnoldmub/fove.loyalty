import { redirect } from "next/navigation";

export default function AdminCustomersRedirect() {
  // Respect RGPD & Sécurité : la plateforme n'accède pas aux données personnelles des clients finaux de chaque commerce.
  redirect("/admin");
}
