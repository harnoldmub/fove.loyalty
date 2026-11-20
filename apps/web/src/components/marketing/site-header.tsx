import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand";
import { CookieSettingsButton } from "@/components/cookie-consent";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

const links = [
  { href: "/fonctionnalites", key: "features" },
  { href: "/#tarifs", key: "pricing" },
  { href: "/partenaires", key: "partners" },
  { href: "/developpeurs", key: "developers" },
  { href: "/contact", key: "contact" },
] as const;

export async function SiteHeader() {
  const t = await getTranslations("marketing.header");
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" aria-label={t("homeLabel")}>
          <Logo />
        </Link>
        <nav aria-label={t("mainNav")} className="hidden gap-1 md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-sm px-3 py-2 text-[0.95rem] text-ink-2 hover:text-ink">
              {t(`links.${l.key}`)}
            </Link>
          ))}
        </nav>
        <div className="ms-auto flex items-center gap-2">
          <LocaleSwitcher className="hidden sm:inline-flex" />
          <ThemeToggle />
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href="/login">{t("login")}</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/signup">{t("signup")}</Link>
          </Button>
        </div>
      </div>
      <nav aria-label={t("mobileNav")} className="flex gap-1 overflow-x-auto px-3 pb-2 md:hidden">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="shrink-0 rounded-full bg-surface px-3 py-1.5 text-sm text-ink-2 shadow-1">
            {t(`links.${l.key}`)}
          </Link>
        ))}
        <Link href="/login" className="shrink-0 rounded-full px-3 py-1.5 text-sm text-ink-2 sm:hidden">
          {t("login")}
        </Link>
      </nav>
    </header>
  );
}

export async function SiteFooter() {
  const t = await getTranslations("marketing.footer");
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr]">
        <div className="grid content-start gap-3">
          <Logo />
          <p className="max-w-sm text-sm text-ink-2 leading-relaxed">
            {t.rich("tagline", { strong: (chunks) => <strong className="font-semibold text-ink">{chunks}</strong> })}
            <br />
            {t("description")}
          </p>
        </div>
        <nav aria-label={t("product")} className="grid content-start gap-2 text-sm">
          <p className="font-medium text-ink">{t("product")}</p>
          <Link className="text-ink-2 hover:text-ink transition-colors" href="/fonctionnalites">{t("links.features")}</Link>
          <Link className="text-ink-2 hover:text-ink transition-colors" href="/#tarifs">{t("links.pricing")}</Link>
          <Link className="text-ink-2 hover:text-ink transition-colors" href="/developpeurs">{t("links.api")}</Link>
          <Link className="text-ink-2 hover:text-ink transition-colors" href="/contact">{t("links.contact")}</Link>
        </nav>
        <nav aria-label={t("info")} className="grid content-start gap-2 text-sm">
          <p className="font-medium text-ink">{t("info")}</p>
          <Link className="text-ink-2 hover:text-ink transition-colors" href="/partenaires">{t("links.partners")}</Link>
          <Link className="text-ink-2 hover:text-ink transition-colors" href="/cgu">{t("links.terms")}</Link>
          <Link className="text-ink-2 hover:text-ink transition-colors" href="/confidentialite">{t("links.privacy")}</Link>
          <CookieSettingsButton />
          <Link className="text-ink-2 hover:text-ink transition-colors" href="/login">{t("links.merchantArea")}</Link>
          <Link className="text-ink-2 hover:text-ink transition-colors" href="/sitemap.xml">{t("links.sitemap")}</Link>
        </nav>
      </div>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 pb-10 sm:px-6">
        <p className="text-xs text-ink-3">{t("rights", { year: new Date().getFullYear() })}</p>
        <LocaleSwitcher />
      </div>
    </footer>
  );
}
