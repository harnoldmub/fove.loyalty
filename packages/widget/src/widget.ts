/**
 * Widget FOVE. Il lit uniquement la configuration publique du commerçant
 * (clé fove_pk_…, limitée aux domaines déclarés) et ouvre les pages hébergées
 * par FOVE. Aucun secret, aucune opération sur les points.
 */
export interface WidgetConfig {
  tenant: { name: string; logoUrl: string | null; primaryColor: string };
  programs: { name: string; mode: "POINTS" | "STAMPS"; joinUrl: string }[];
}

export interface WidgetOptions {
  key: string;
  apiOrigin: string;
  position: "left" | "right";
  label: string;
}

const STYLE = `
:host { all: initial; }
.root { position: fixed; bottom: 20px; z-index: 2147483000; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
.root.right { right: 20px; } .root.left { left: 20px; }
.launcher { display: inline-flex; align-items: center; gap: 8px; border: 0; border-radius: 999px; padding: 12px 18px; font: 600 15px/1 inherit; color: #fff; cursor: pointer; box-shadow: 0 10px 30px -10px rgba(13,20,48,.45); }
.launcher:focus-visible, .panel a:focus-visible, .close:focus-visible { outline: 2px solid #2c55f5; outline-offset: 2px; }
.dot { width: 18px; height: 18px; border-radius: 999px; border: 3px solid #f5b82e; box-sizing: border-box; }
.panel { position: absolute; bottom: 60px; width: min(320px, calc(100vw - 40px)); background: #fff; color: #14204a; border-radius: 18px; padding: 18px; box-shadow: 0 20px 50px -15px rgba(13,20,48,.45); box-sizing: border-box; }
.root.right .panel { right: 0; } .root.left .panel { left: 0; }
.head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.head img, .badge { width: 36px; height: 36px; border-radius: 999px; object-fit: cover; }
.badge { display: grid; place-items: center; color: #fff; font-weight: 700; }
.title { font-weight: 700; font-size: 16px; margin: 0; }
.sub { margin: 0; font-size: 13px; color: #4a5579; }
.panel a { display: block; text-decoration: none; text-align: center; border-radius: 10px; padding: 11px 12px; font-weight: 600; font-size: 14px; margin-top: 8px; }
.primary { color: #fff; }
.secondary { background: #eef1f8; color: #14204a; }
.close { position: absolute; top: 10px; right: 10px; border: 0; background: transparent; font-size: 20px; line-height: 1; color: #6f7896; cursor: pointer; padding: 4px; }
.foot { margin: 12px 0 0; font-size: 11px; color: #6f7896; text-align: center; }
@media (prefers-reduced-motion: no-preference) { .panel { animation: in .18s ease-out; } @keyframes in { from { opacity: 0; transform: translateY(6px); } } }
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text) node.textContent = text;
  return node;
}

/** N'accepte que des liens http(s) renvoyés par FOVE, jamais javascript: ou data:. */
function safeUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function safeColor(color: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#2c55f5";
}

export async function fetchConfig(options: WidgetOptions, fetchImpl: typeof fetch = fetch): Promise<WidgetConfig> {
  const res = await fetchImpl(`${options.apiOrigin}/api/widget/config?key=${encodeURIComponent(options.key)}`, { credentials: "omit" });
  if (!res.ok) throw new Error(`FOVE widget : configuration indisponible (${res.status})`);
  return (await res.json()) as WidgetConfig;
}

export function render(host: HTMLElement, config: WidgetConfig, options: WidgetOptions): { open: () => void; close: () => void } {
  const shadow = host.attachShadow({ mode: "open" });
  shadow.appendChild(el("style", {}, STYLE));
  const color = safeColor(config.tenant.primaryColor);
  const root = el("div", { class: `root ${options.position}` });
  const launcher = el("button", { class: "launcher", type: "button", "aria-expanded": "false", "aria-haspopup": "dialog" });
  launcher.style.background = color;
  launcher.append(el("span", { class: "dot", "aria-hidden": "true" }), document.createTextNode(options.label));

  const panel = el("div", { class: "panel", role: "dialog", "aria-label": `Fidélité ${config.tenant.name}` });
  panel.hidden = true;
  const head = el("div", { class: "head" });
  const logo = config.tenant.logoUrl ? safeUrl(config.tenant.logoUrl) : null;
  if (logo) head.appendChild(el("img", { src: logo, alt: "" }));
  else {
    const badge = el("span", { class: "badge", "aria-hidden": "true" }, config.tenant.name.slice(0, 1));
    badge.style.background = color;
    head.appendChild(badge);
  }
  const titles = el("div");
  titles.append(el("p", { class: "title" }, config.tenant.name), el("p", { class: "sub" }, "Programme de fidélité"));
  head.appendChild(titles);
  const close = el("button", { class: "close", type: "button", "aria-label": "Fermer" }, "×");
  panel.append(close, head);

  for (const program of config.programs) {
    const url = safeUrl(program.joinUrl);
    if (!url) continue;
    const join = el("a", { class: "primary", href: url, target: "_blank", rel: "noopener" }, config.programs.length > 1 ? `Rejoindre : ${program.name}` : "Créer ma carte de fidélité");
    join.style.background = color;
    const recover = el("a", { class: "secondary", href: `${url}#retrouver`, target: "_blank", rel: "noopener" }, "J’ai déjà une carte");
    panel.append(join, recover);
  }
  if (config.programs.length === 0) panel.appendChild(el("p", { class: "sub" }, "Le programme n’est pas encore ouvert."));
  panel.appendChild(el("p", { class: "foot" }, "Carte gratuite, sans application à installer."));

  const setOpen = (open: boolean) => {
    panel.hidden = !open;
    launcher.setAttribute("aria-expanded", String(open));
    if (open) (panel.querySelector("a") as HTMLElement | null)?.focus();
    else launcher.focus();
  };
  launcher.addEventListener("click", () => setOpen(panel.hidden));
  close.addEventListener("click", () => setOpen(false));
  root.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Escape" && !panel.hidden) setOpen(false);
  });
  root.append(panel, launcher);
  shadow.appendChild(root);
  return { open: () => setOpen(true), close: () => setOpen(false) };
}
