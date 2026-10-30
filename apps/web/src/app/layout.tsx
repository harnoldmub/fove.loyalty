import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import { Providers } from "@/components/providers";
import { defaultKeywords, siteUrl } from "@/lib/og";
import "./globals.css";

const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap" });
const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree", display: "swap" });

const ogBanner = {
  url: `${siteUrl}/opengraph-image`,
  secureUrl: `${siteUrl}/opengraph-image`,
  type: "image/png",
  width: 1200,
  height: 630,
  alt: "FOVE — Plateforme de fidélisation et force de vente retail",
};

const shareImage = {
  url: `${siteUrl}/share-icon.png`,
  secureUrl: `${siteUrl}/share-icon.png`,
  type: "image/png",
  width: 256,
  height: 256,
  alt: "FOVE",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "FOVE — Transformez vos clients en habitués | Carte de fidélité numérique & CRM", template: "%s · FOVE" },
  description:
    "Plateforme de fidélisation et force de vente retail : cartes de fidélité numériques (Apple & Google Wallet), QR codes en caisse, points ou tampons, CRM RFM et relances WhatsApp. Sans application à installer.",
  applicationName: "FOVE",
  authors: [{ name: "Dizayna", url: siteUrl }],
  creator: "Dizayna",
  publisher: "Dizayna",
  category: "business",
  keywords: defaultKeywords,
  manifest: "/manifest.webmanifest",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    siteName: "FOVE",
    locale: "fr_FR",
    url: siteUrl,
    images: [ogBanner, shareImage],
  },
  twitter: {
    card: "summary_large_image",
    images: [ogBanner.url],
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1430" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning className={`${bricolage.variable} ${figtree.variable}`}>
      <body>
        <a href="#contenu" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:shadow-2">
          Aller au contenu
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
