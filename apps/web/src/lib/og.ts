import type { Metadata } from "next";

export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://fove.digital").replace(/\/$/, "");

const ogBanner = {
  url: `${siteUrl}/opengraph-image`,
  secureUrl: `${siteUrl}/opengraph-image`,
  type: "image/png",
  width: 1200,
  height: 630,
  alt: "FOVE — Plateforme de fidélisation et force de vente retail",
};

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
export function pageMeta(title: string, description: string, path: string, extraKeywords: string[] = []): Metadata {
  const canonicalUrl = path === "/" ? siteUrl : `${siteUrl}${path}`;
  const fullTitle = title.startsWith("FOVE") ? title : `${title} · FOVE`;

  return {
    // La page d'accueil porte déjà la marque dans son titre : pas de suffixe « · FOVE ».
    title: title.startsWith("FOVE") ? { absolute: title } : title,
    description,
    keywords: [...defaultKeywords, ...extraKeywords],
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
      locale: "fr_FR",
      title: fullTitle,
      description,
      url: canonicalUrl,
      images: [ogBanner, shareIcon],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: [ogBanner.url],
    },
  };
}
