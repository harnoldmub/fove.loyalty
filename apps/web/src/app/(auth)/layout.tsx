import Link from "next/link";
import { Logo } from "@/components/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh grid-rows-[auto_1fr] px-4">
      <header className="mx-auto flex h-16 w-full max-w-md items-center">
        <Link href="/" aria-label="FOVE, accueil">
          <Logo />
        </Link>
      </header>
      <main id="contenu" className="mx-auto w-full max-w-md pb-16 pt-6 sm:pt-12">
        {children}
      </main>
    </div>
  );
}
