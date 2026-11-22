import Script from "next/script";
import { CookieConsent } from "@/components/cookie-consent";

const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID ?? "GTM-53DS2L3S";
const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_ID ?? "z8rrk6rpqy";
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

/**
 * Consentement par défaut puis chargement de gtm.js (extrait officiel GTM).
 * Le choix enregistré par la bannière (`fove:cookie_consent`) est relu avant le chargement.
 */
function gtmBootstrap(gtmId: string, gaId?: string) {
  return `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
var c = 'denied';
try { if (localStorage.getItem('fove:cookie_consent') === 'granted') c = 'granted'; } catch (e) {}
gtag('consent', 'default', { analytics_storage: c, ad_storage: c, ad_user_data: c, ad_personalization: c, wait_for_update: 500 });
${gaId ? `gtag('js', new Date()); gtag('config', '${gaId}');` : ""}
(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtmId}');
`;
}

/**
 * Mesure d'audience des pages publiques (vitrine, connexion, inscription) :
 * Google Tag Manager en mode Consentement v2, Clarity après accord, bannière cookies.
 * Jamais dans l'espace commerçant (/app), l'administration ni les cartes des clients finaux.
 */
export function PublicAnalytics() {
  return (
    <>
      <Script id="gtm-init" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: gtmBootstrap(GTM_ID, GA_ID) }} />
      {GA_ID && <Script id="ga-script" src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />}
      <noscript>
        <iframe
          title="Google Tag Manager"
          src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
          height="0"
          width="0"
          style={{ display: "none", visibility: "hidden" }}
        />
      </noscript>
      <CookieConsent clarityId={CLARITY_ID} />
    </>
  );
}
