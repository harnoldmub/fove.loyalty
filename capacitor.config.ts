import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "digital.fove.app",
  appName: "FOVE",
  webDir: process.env.CAP_WEB_DIR ?? "apps/web/mobile-shell",
  // Repéré par apps/web/src/proxy.ts : l'app n'affiche que l'espace connecté.
  appendUserAgent: "FoveApp",
  server: {
    androidScheme: "https",
    cleartext: true,
    // Permet de pointer vers l'instance de production ou un serveur de dév local (ex: CAP_SERVER_URL=http://192.168.1.XX:5290)
    url: `${process.env.CAP_SERVER_URL ?? "https://app.fove.digital"}/app`,
  },
  ios: {
    preferredContentMode: "mobile",
    contentInset: "automatic",
  },
  plugins: {
    Keyboard: {
      resize: "none",
      style: "LIGHT",
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#14204A",
    },
  },
};

export default config;

