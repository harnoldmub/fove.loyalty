import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap" });
const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree", display: "swap" });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://fove.digital";
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
  title: { default: "FOVE — Transformez vos clients en habitués", template: "%s · FOVE" },
  description: "Cartes de fidélité numériques, QR codes et points pour les commerçants. Sans application à installer.",
  applicationName: "FOVE",
  openGraph: { type: "website", siteName: "FOVE", locale: "fr_FR", images: [shareImage] },
  twitter: { card: "summary", images: [shareImage.url] },
  icons: { apple: "/apple-touch-icon.png" },
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
