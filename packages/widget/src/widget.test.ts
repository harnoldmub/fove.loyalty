// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { fetchConfig, render, type WidgetConfig } from "./widget";

const config: WidgetConfig = {
  tenant: { name: "Match Kwata", logoUrl: null, primaryColor: "#0e7c66" },
  programs: [{ name: "Club", mode: "POINTS", joinUrl: "https://app.fove.digital/join/abc123def456" }],
};
const options = { key: "fove_pk_test_x", apiOrigin: "https://app.fove.digital", position: "right" as const, label: "Ma fidélité" };

describe("widget", () => {
  it("affiche un bouton aux couleurs du commerçant et ouvre le panneau", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const api = render(host, config, options);
    const shadow = host.shadowRoot!;
    const launcher = shadow.querySelector<HTMLButtonElement>(".launcher")!;
    expect(launcher.textContent).toContain("Ma fidélité");
    expect(shadow.querySelector<HTMLElement>(".panel")!.hidden).toBe(true);
    api.open();
    expect(shadow.querySelector<HTMLElement>(".panel")!.hidden).toBe(false);
    expect(launcher.getAttribute("aria-expanded")).toBe("true");
    const link = shadow.querySelector<HTMLAnchorElement>("a.primary")!;
    expect(link.href).toBe("https://app.fove.digital/join/abc123def456");
  });

  it("ignore les liens dangereux et les couleurs invalides", () => {
    const host = document.createElement("div");
    render(host, { tenant: { name: "X", logoUrl: "javascript:alert(1)", primaryColor: "red;background:url(x)" }, programs: [{ name: "P", mode: "STAMPS", joinUrl: "javascript:alert(1)" }] }, options);
    const shadow = host.shadowRoot!;
    expect(shadow.querySelector("a.primary")).toBeNull();
    expect(shadow.querySelector("img")).toBeNull();
    expect(shadow.querySelector<HTMLElement>(".launcher")!.style.background).not.toContain("url");
  });

  it("n'envoie jamais de cookie et transmet la clé publique", async () => {
    let seen: { url: string; init?: RequestInit } | null = null;
    const fake = (async (url: string, init?: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify(config), { status: 200 });
    }) as unknown as typeof fetch;
    await fetchConfig(options, fake);
    expect(seen!.url).toBe("https://app.fove.digital/api/widget/config?key=fove_pk_test_x");
    expect(seen!.init?.credentials).toBe("omit");
  });
});
