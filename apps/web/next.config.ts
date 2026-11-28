import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const apiUrl = process.env.API_URL ?? "http://localhost:5291";

const nextConfig: NextConfig = {
  output: "standalone",
  // Racine du monorepo : le build autonome embarque aussi les paquets partagés.
  outputFileTracingRoot: path.join(__dirname, "../.."),
  poweredByHeader: false,
  transpilePackages: ["@fove/shared"],
  // L'API est servie sous le même domaine que l'application : les cookies de
  // session restent first-party et aucune requête cross-site n'est nécessaire.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUrl}/api/:path*` }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
          // Politique de contenu minimale, sans risque de casser l'affichage : pas d'intégration dans un
          // cadre, pas de <base> détourné, pas de plugins. Une politique complète (scripts) viendra ensuite.
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
          // HTTPS imposé par le navigateur (ignoré en local, servi en http).
          ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : []),
        ],
      },
      { source: "/card/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex" }, { key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default withNextIntl(nextConfig);
