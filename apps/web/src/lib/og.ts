import type { Metadata } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://fove.digital";

/** Métadonnées d’une page avec l’icône de partage carrée (vignette WhatsApp). */
export function pageMeta(title: string, description: string, path: string): Metadata {
  const image = { url: `${siteUrl}/share-icon.png`, secureUrl: `${siteUrl}/share-icon.png`, type: "image/png", width: 256, height: 256, alt: "FOVE" };
  return {
    // La page d'accueil porte déjà la marque dans son titre : pas de suffixe « · FOVE ».
    title: title.startsWith("FOVE") ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, images: [image] },
    twitter: { card: "summary", title, description, images: [image.url] },
  };
}
