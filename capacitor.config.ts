import type { CapacitorConfig } from "@capacitor/cli";

const origin = process.env.CAP_SERVER_URL ?? "https://fove.digital";

const config: CapacitorConfig = {
  appId: "digital.fove.app",
  appName: "FOVE",
  webDir: process.env.CAP_WEB_DIR ?? "apps/web/mobile-shell",
  // Repéré par apps/web/src/proxy.ts : l'app n'affiche que l'espace connecté.
  appendUserAgent: "FoveApp",
  server: {
    androidScheme: "https",
    // HTTP non chiffré seulement pour un serveur de dév local (ex: CAP_SERVER_URL=http://192.168.1.XX:5290).
    cleartext: origin.startsWith("http://"),
    url: `${origin}/app`,
    // Sans réseau au lancement : page locale qui se reconnecte (mobile-shell/index.html).
    errorPath: "index.html",
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

