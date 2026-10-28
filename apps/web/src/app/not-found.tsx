import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="contenu" className="mx-auto grid min-h-dvh max-w-md content-center justify-items-start gap-4 px-4">
      <h1 className="font-display text-4xl font-semibold">Page introuvable</h1>
      <p className="text-ink-2">Le lien est peut-être incomplet ou a été remplacé. Si c’est une carte de fidélité, demandez un nouveau lien au commerçant.</p>
      <Button asChild><Link href="/">Retour à l’accueil</Link></Button>
    </main>
  );
}
