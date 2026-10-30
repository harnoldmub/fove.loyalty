import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FOVE — Fidélisation & Force de Vente",
    short_name: "FOVE",
    description:
      "Cartes de fidélité numériques, QR codes en caisse, Apple/Google Wallet et CRM commerçant. Sans application à installer.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f7fb",
    theme_color: "#2c55f5",
    lang: "fr",
    categories: ["business", "productivity", "shopping", "finance"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}

