import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import { CookieConsent } from "@/components/cookie-consent";
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

const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID ?? "GTM-53DS2L3S";
const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_ID ?? "z8rrk6rpqy";
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning className={`${bricolage.variable} ${figtree.variable}`}>
      <head>
        {/* Microsoft Clarity */}
        <script
          type="text/javascript"
          dangerouslySetInnerHTML={{
            __html: `
              (function(c,l,a,r,i,t,y){
                  c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
                  t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
                  y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
              })(window, document, "clarity", "script", "${CLARITY_ID}");
            `,
          }}
        />
      </head>
      <body>
        {/* Google Tag Manager & Consent Mode v2 */}
        <Script
          id="gtm-init"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}

              var consentStatus = 'denied';
              try {
                if (localStorage.getItem('fove:cookie_consent') === 'granted') {
                  consentStatus = 'granted';
                }
              } catch (e) {}

              gtag('consent', 'default', {
                'analytics_storage': consentStatus,
                'ad_storage': consentStatus,
                'ad_user_data': consentStatus,
                'ad_personalization': consentStatus
              });

              gtag('js', new Date());
              ${GA_ID ? `gtag('config', '${GA_ID}');` : ""}
            `,
          }}
        />
        <Script
          id="gtm-script"
          src={`https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`}
          strategy="afterInteractive"
        />
        {GA_ID && (
          <Script
            id="ga-script"
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
            strategy="afterInteractive"
          />
        )}
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
        <a href="#contenu" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:shadow-2">
          Aller au contenu
        </a>
        <Providers>{children}</Providers>
        <CookieConsent />
      </body>
    </html>
  );
}
