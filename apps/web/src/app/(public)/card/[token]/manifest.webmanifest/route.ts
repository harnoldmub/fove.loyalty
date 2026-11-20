import { getTranslations } from "next-intl/server";
import { serverGet } from "@/lib/server-api";

/** Manifeste PWA propre à chaque carte : l’icône d’écran d’accueil rouvre directement cette carte. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data } = await serverGet<{ tenant: { name: string; primaryColor: string } }>(`/public/cards/${token}`);
  const t = await getTranslations("public.meta");
  const name = data ? t("manifestName", { tenant: data.tenant.name }) : t("cardTitle");
  return Response.json(
    {
      name,
      short_name: data?.tenant.name.slice(0, 12) ?? t("cardShortTitle"),
      start_url: `/card/${token}`,
      scope: `/card/${token}`,
      display: "standalone",
      background_color: "#f6f7fb",
      theme_color: data?.tenant.primaryColor ?? "#2c55f5",
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-store" } },
  );
}
