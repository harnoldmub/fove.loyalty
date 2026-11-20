import Link from "next/link";
import { Building2, Clock, MessageSquare, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTranslations } from "next-intl/server";
import { localizedPageMeta } from "@/lib/og";
import { ContactForm } from "./contact-form";

export async function generateMetadata() {
  return localizedPageMeta("contact", "/contact");
}

const highlights = [
  { icon: Clock, key: "setup" },
  { icon: Building2, key: "business" },
  { icon: ShieldCheck, key: "support" },
] as const;

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ offre?: string }> }) {
  const [{ offre }, t] = await Promise.all([searchParams, getTranslations("marketing.contact")]);
  return (
    <div className="mx-auto max-w-6xl px-4 pt-14 sm:px-6">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.25fr] lg:items-start">
        <div className="grid content-start gap-8">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-cobalt-soft px-3 py-1 text-xs font-semibold text-cobalt">
              <MessageSquare className="size-3.5" aria-hidden /> {t("badge")}
            </span>
            <h1 className="mt-4 font-display text-4xl font-bold sm:text-5xl">
              {t("title")}
            </h1>
            <p className="mt-4 text-lg text-ink-2">
              {t("intro")}
            </p>
          </div>

          <dl className="grid gap-6">
            {highlights.map((h) => (
              <div key={h.key} className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <dt className="contents">
                  <span className="grid size-10 place-items-center rounded-md bg-surface text-cobalt shadow-1">
                    <h.icon className="size-5" aria-hidden />
                  </span>
                  <span className="self-center font-display text-lg font-semibold">{t(`highlights.${h.key}.title`)}</span>
                </dt>
                <dd className="col-start-2 text-sm text-ink-2 leading-relaxed">{t(`highlights.${h.key}.text`)}</dd>
              </div>
            ))}
          </dl>

          <div className="rounded-[var(--radius-lg)] border border-line bg-surface p-5">
            <h2 className="font-display text-lg font-semibold">{t("selfServe.title")}</h2>
            <p className="mt-1 text-sm text-ink-2">
              {t("selfServe.text")}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button asChild size="sm">
                <Link href="/signup">{t("selfServe.start")}</Link>
              </Button>
              <Button asChild variant="secondary" size="sm">
                <Link href="/#tarifs">{t("selfServe.plans")}</Link>
              </Button>
            </div>
          </div>
        </div>

        <ContactForm customPlan={offre === "sur-mesure"} />
      </div>
    </div>
  );
}

