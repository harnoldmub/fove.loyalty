import { CheckoutView } from "./view";

export const metadata = { title: "Caisse fidélité" };

export default async function Page({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  return <CheckoutView accountId={accountId} />;
}
