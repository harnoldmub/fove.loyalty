import Link from "next/link";
import { Logo } from "@/components/brand";
import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("auth.layout");
  return (
    <div className="grid min-h-dvh grid-rows-[auto_1fr] px-4">
      <header className="relative mx-auto flex h-16 w-full max-w-md items-center justify-center">
        <Link href="/" aria-label={t("homeLabel")} className="inline-flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cobalt rounded-md">
          <Logo />
        </Link>
        <LocaleSwitcher className="absolute end-0" />
      </header>
      <main id="contenu" className="mx-auto w-full max-w-md pb-16 pt-6 sm:pt-12">
        {children}
      </main>
    </div>
  );
}
