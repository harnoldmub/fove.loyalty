import type { MetadataRoute } from "next";

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://fove.digital").replace(/\/$/, "");

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date("2026-10-30T00:00:00.000Z");

  const routes: {
    path: string;
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
    priority: number;
  }[] = [
    { path: "", changeFrequency: "weekly", priority: 1.0 },
    { path: "/fonctionnalites", changeFrequency: "monthly", priority: 0.9 },
    { path: "/tarifs", changeFrequency: "weekly", priority: 0.9 },
    { path: "/contact", changeFrequency: "monthly", priority: 0.8 },
    { path: "/developpeurs", changeFrequency: "monthly", priority: 0.7 },
    { path: "/confidentialite", changeFrequency: "yearly", priority: 0.4 },
    { path: "/cgu", changeFrequency: "yearly", priority: 0.4 },
  ];

  return routes.map((route) => ({
    url: `${siteUrl}${route.path || "/"}`,
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}

