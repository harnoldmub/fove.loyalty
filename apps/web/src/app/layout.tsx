import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Bricolage_Grotesque, Figtree, IBM_Plex_Sans_Arabic } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { CookieConsent } from "@/components/cookie-consent";
import { Providers } from "@/components/providers";
import { isRtl } from "@/i18n/config";
import { resolveLocale } from "@/i18n/request";
import { asList, defaultKeywords, siteUrl } from "@/lib/og";
import "./globals.css";

const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap" });
const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree", display: "swap" });
// Bricolage et Figtree n'ont pas de glyphes arabes : relais pour la version arabe.
const arabic = IBM_Plex_Sans_Arabic({ subsets: ["arabic"], weight: ["400", "500", "600", "700"], variable: "--font-arabic", display: "swap" });


const shareImage = {
  url: `${siteUrl}/share-icon.png`,
  secureUrl: `${siteUrl}/share-icon.png`,
  type: "image/png",
  width: 256,
  height: 256,
  alt: "FOVE",
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing.meta");
  return {
    metadataBase: new URL(siteUrl),
    title: { default: t("root.title"), template: "%s · FOVE" },
    description: t("root.description"),
    applicationName: "FOVE",
    authors: [{ name: "Dizayna", url: siteUrl }],
    creator: "Dizayna",
    publisher: "Dizayna",
    category: "business",
    keywords: asList<string>(t.raw("keywords")).length ? asList<string>(t.raw("keywords")) : defaultKeywords,
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
      locale: t("ogLocale"),
      url: siteUrl,
      // Icône carrée seule : WhatsApp l'affiche en petite vignette (règle du workspace).
      images: [{ ...shareImage, alt: t("imageAlt") }],
    },
    twitter: {
      card: "summary",
      images: [shareImage.url],
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
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1430" },
  ],
};

const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID ?? "GTM-53DS2L3S";
const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_ID ?? "z8rrk6rpqy";
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await resolveLocale();
  const [messages, t] = await Promise.all([getMessages(), getTranslations("common")]);
  return (
    <html lang={locale} dir={isRtl(locale) ? "rtl" : "ltr"} suppressHydrationWarning className={`${bricolage.variable} ${figtree.variable} ${arabic.variable}`}>
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
        <a href="#contenu" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:shadow-2">
          {t("skipToContent")}
        </a>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
          <CookieConsent />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
