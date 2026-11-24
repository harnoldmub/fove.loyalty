import { getTranslations } from "next-intl/server";

/** Manifeste PWA de « Mes cartes » : l'icône d'écran d'accueil ouvre toutes les cartes du client. */
export async function GET() {
  const t = await getTranslations("client.meta");
  return Response.json(
    {
      id: "/mes-cartes",
      name: t("manifestName"),
      short_name: t("manifestShort"),
      start_url: "/mes-cartes",
      // Portée large : les cartes ouvertes depuis « Mes cartes » restent dans l'application installée.
      scope: "/",
      display: "standalone",
      background_color: "#f6f7fb",
      theme_color: "#2c55f5",
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-store" } },
  );
}
