import { fetchConfig, render, type WidgetOptions } from "./widget";

declare global {
  interface Window {
    FoveWidget?: { open: () => void; close: () => void };
  }
}

/**
 * <script src="https://app.fove.digital/widget/fove-widget.js" data-key="fove_pk_live_…" defer></script>
 * Options : data-position="left|right", data-label="Ma fidélité".
 */
(function boot() {
  const script = document.currentScript as HTMLScriptElement | null;
  if (!script || window.FoveWidget) return;
  const key = script.dataset.key;
  if (!key || !key.startsWith("fove_pk_")) {
    console.warn("FOVE widget : attribut data-key manquant ou invalide (clé publique fove_pk_ attendue).");
    return;
  }
  const options: WidgetOptions = {
    key,
    apiOrigin: script.dataset.api ?? new URL(script.src).origin,
    position: script.dataset.position === "left" ? "left" : "right",
    label: script.dataset.label ?? "Ma fidélité",
  };
  const start = () => {
    fetchConfig(options)
      .then((config) => {
        const host = document.createElement("div");
        host.id = "fove-widget";
        document.body.appendChild(host);
        window.FoveWidget = render(host, config, options);
      })
      .catch((error: unknown) => console.warn(String(error)));
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
