import type { MetadataRoute } from "next";

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://fove.digital").replace(/\/$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/fonctionnalites",
          "/tarifs",
          "/developpeurs",
          "/partenaires",
          "/contact",
          "/confidentialite",
          "/cgu",
        ],
        disallow: [
          "/app/",
          "/admin/",
          "/onboarding/",
          "/card/",
          "/join/",
          "/affiche/",
          "/api/",
          "/login",
          "/signup",
          "/invite",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}

