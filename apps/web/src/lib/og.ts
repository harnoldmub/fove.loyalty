import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://fove.digital").replace(/\/$/, "");


const shareIcon = {
  url: `${siteUrl}/share-icon.png`,
  secureUrl: `${siteUrl}/share-icon.png`,
  type: "image/png",
  width: 256,
  height: 256,
  alt: "FOVE",
};

export const defaultKeywords = [
  "carte de fidélité numérique",
  "programme de fidélité commerçant",
  "fidélisation client retail",
  "QR code fidélité caisse",
  "carte à tampons digitale",
  "Apple Wallet fidélité",
  "Google Wallet fidélité",
  "CRM commerçant",
  "relance client WhatsApp",
  "segmentation RFM retail",
  "logiciel fidélité boutique",
  "fidélité Kinshasa RDC",
  "FOVE",
  "Dizayna",
];

/** Métadonnées enrichies d’une page publique (SEO, OpenGraph 1200×630 + vignette carrée WhatsApp, Twitter/X). */
export function pageMeta(
  title: string,
  description: string,
  path: string,
  extraKeywords: string[] = [],
  options: { ogLocale?: string; imageAlt?: string; keywords?: string[] } = {},
): Metadata {
  const canonicalUrl = path === "/" ? siteUrl : `${siteUrl}${path}`;
  // Un titre qui nomme déjà la marque ne reçoit pas le suffixe « · FOVE ».
  const branded = /\bFOVE\b/.test(title);
  const fullTitle = branded ? title : `${title} · FOVE`;

  return {
    title: branded ? { absolute: title } : title,
    description,
    keywords: [...(options.keywords ?? defaultKeywords), ...extraKeywords],
    alternates: {
      canonical: canonicalUrl,
      languages: {
        "fr-FR": canonicalUrl,
        "fr-CD": canonicalUrl,
        "fr-BE": canonicalUrl,
        "x-default": canonicalUrl,
      },
    },
    openGraph: {
      type: "website",
      siteName: "FOVE",
      locale: options.ogLocale ?? "fr_FR",
      title: fullTitle,
      description,
      url: canonicalUrl,
      // Icône carrée seule : WhatsApp l'affiche en petite vignette (règle du workspace).
      images: [options.imageAlt ? { ...shareIcon, alt: options.imageAlt } : shareIcon],
    },
    twitter: {
      card: "summary",
      title: fullTitle,
      description,
      images: [shareIcon.url],
    },
  };
}

/**
 * Lit un tableau de messages (`t.raw`). La fusion avec le français de repli
 * (src/i18n/request.ts) transforme les tableaux en objets indexés : on les remet en liste.
 */
export function asList<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  return raw && typeof raw === "object" ? (Object.values(raw) as T[]) : [];
}

/** Métadonnées d’une page de la vitrine, lues dans `marketing.meta.<page>` selon la langue de la requête. */
export async function localizedPageMeta(page: string, path: string, values?: Record<string, string | number>): Promise<Metadata> {
  const t = await getTranslations("marketing.meta");
  const extra = t.has(`${page}.keywords`) ? asList<string>(t.raw(`${page}.keywords`)) : [];
  return pageMeta(t(`${page}.title`), t(`${page}.description`, values), path, extra, {
    ogLocale: t("ogLocale"),
    imageAlt: t("imageAlt"),
    keywords: asList<string>(t.raw("keywords")),
  });
}

/** Variante pour une page dont le titre et la description vivent dans un autre espace (`<ns>.title`, `<ns>.description`). */
export async function namespacedPageMeta(namespace: string, path: string): Promise<Metadata> {
  const [t, tm] = await Promise.all([getTranslations(namespace), getTranslations("marketing.meta")]);
  return pageMeta(t("title"), t("description"), path, [], {
    ogLocale: tm("ogLocale"),
    imageAlt: tm("imageAlt"),
    keywords: asList<string>(tm.raw("keywords")),
  });
}
