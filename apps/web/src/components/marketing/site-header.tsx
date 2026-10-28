import Link from "next/link";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";

const links = [
  { href: "/fonctionnalites", label: "Fonctionnalités" },
  { href: "/tarifs", label: "Tarifs" },
  { href: "/developpeurs", label: "Développeurs" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" aria-label="FOVE, accueil">
          <Logo />
        </Link>
        <nav aria-label="Navigation principale" className="hidden gap-1 md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-sm px-3 py-2 text-[0.95rem] text-ink-2 hover:text-ink">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href="/login">Se connecter</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/signup">Essai gratuit</Link>
          </Button>
        </div>
      </div>
      <nav aria-label="Navigation mobile" className="flex gap-1 overflow-x-auto px-3 pb-2 md:hidden">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="shrink-0 rounded-full bg-surface px-3 py-1.5 text-sm text-ink-2 shadow-1">
            {l.label}
          </Link>
        ))}
        <Link href="/login" className="shrink-0 rounded-full px-3 py-1.5 text-sm text-ink-2 sm:hidden">
          Se connecter
        </Link>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr]">
        <div className="grid content-start gap-3">
          <Logo />
          <p className="max-w-xs text-sm text-ink-2">FOVE, pour FOrce de VEnte. Un produit Dizayna.</p>
        </div>
        <nav aria-label="Produit" className="grid content-start gap-2 text-sm">
          <p className="font-medium">Produit</p>
          <Link className="text-ink-2 hover:text-ink" href="/fonctionnalites">Fonctionnalités</Link>
          <Link className="text-ink-2 hover:text-ink" href="/tarifs">Tarifs</Link>
          <Link className="text-ink-2 hover:text-ink" href="/developpeurs">Documentation API</Link>
        </nav>
        <nav aria-label="Informations" className="grid content-start gap-2 text-sm">
          <p className="font-medium">Informations</p>
          <Link className="text-ink-2 hover:text-ink" href="/confidentialite">Données personnelles</Link>
          <Link className="text-ink-2 hover:text-ink" href="/login">Espace commerçant</Link>
        </nav>
      </div>
      <p className="mx-auto max-w-6xl px-4 pb-10 text-xs text-ink-3 sm:px-6">© {new Date().getFullYear()} Dizayna. Tous droits réservés.</p>
    </footer>
  );
}
