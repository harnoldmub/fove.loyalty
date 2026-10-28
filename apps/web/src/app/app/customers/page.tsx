import { Suspense } from "react";
import { CustomersView } from "./view";

export const metadata = { title: "Clients" };

export default function CustomersPage() {
  return (
    <Suspense>
      <CustomersView />
    </Suspense>
  );
}
