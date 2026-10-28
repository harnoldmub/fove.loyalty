import path from "node:path";
import type { NextConfig } from "next";

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
        ],
      },
      { source: "/card/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex" }, { key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;
