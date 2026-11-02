// Moteur de timeline déterministe : render(t) recalcule tout l'écran pour
// l'instant t, sans dépendre de l'image précédente. C'est ce qui permet à
// Chrome de capturer chaque image à 30 i/s exactement, et à l'aperçu de
// sauter n'importe où avec la barre de lecture.
//
// Chaque scène a sa fenêtre de temps. Hors de la fenêtre de ses animations,
// un élément [data-actor] est masqué : une scène n'hérite jamais de l'état
// d'une autre, on peut donc monter les scènes dans n'importe quel ordre.

export const ease = {
  linear: (p) => p,
  out: (p) => 1 - (1 - p) ** 3,
  in: (p) => p ** 3,
  inOut: (p) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2),
  // Léger dépassement, pour les éléments qui « se posent ».
  back: (p) => 1 + 2.2 * (p - 1) ** 3 + 1.2 * (p - 1) ** 2,
  // Ressort amorti, pour les validations (tampon, coche).
  spring: (p) => 1 - Math.cos(p * Math.PI * 2.6) * Math.exp(-6 * p),
};

const DEFAULTS = { x: 0, y: 0, scale: 1, rotate: 0, blur: 0, opacity: 1 };
const lerp = (a, b, p) => a + (b - a) * p;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

export class Timeline {
  constructor(root) {
    this.root = root;
    this.tweens = [];
    this.texts = [];
    this.classes = [];
    // Tous les acteurs, y compris ceux des scènes absentes du montage : ils restent masqués.
    this.elements = new Set(root.querySelectorAll("[data-actor]"));
    this.duration = 0;
    this.win = [0, Infinity];
  }

  $(sel) {
    const els = [...this.root.querySelectorAll(sel)];
    if (!els.length) throw new Error(`Aucun élément pour « ${sel} »`);
    els.forEach((el) => this.elements.add(el));
    return els;
  }

  /**
   * Monte une scène de durée `len` à partir de t0. Les temps passés à `build`
   * sont relatifs à t0 et multipliés par `k` (ralenti pour caler la voix off).
   */
  scene(t0, len, build, k = 1) {
    this.win = [t0, t0 + len];
    build(this.#api(t0, k));
    this.duration = Math.max(this.duration, t0 + len);
    return t0 + len;
  }

  #api(t0, k) {
    const win = this.win;
    const api = {
      // props : { y: [40, 0], opacity: [0, 1] }
      to: (sel, at, dur, props, easing = "out") => {
        for (const el of this.$(sel)) for (const [prop, [from, to]] of Object.entries(props)) {
          this.tweens.push({ el, prop, start: t0 + at * k, dur: Math.max(dur * k, 1e-6), from, to, ease: ease[easing] ?? easing, win });
        }
        return api;
      },
      set: (sel, at, props) => api.to(sel, at, 0, Object.fromEntries(Object.entries(props).map(([k, v]) => [k, [v, v]]))),
      // Apparition standard : fondu + petit glissement vertical.
      in: (sel, at, { dur = 0.6, y = 28, x, scale, easing = "out" } = {}) =>
        api.to(sel, at, dur, { opacity: [0, 1], y: [y, 0], ...(x !== undefined && { x: [x, 0] }), ...(scale !== undefined && { scale: [scale, 1] }) }, easing),
      out: (sel, at, { dur = 0.4, y = -18, x, scale } = {}) =>
        api.to(sel, at, dur, { opacity: [1, 0], y: [0, y], ...(x !== undefined && { x: [0, x] }), ...(scale !== undefined && { scale: [1, scale] }) }, "in"),
      // Texte qui se tape caractère par caractère.
      type: (sel, at, dur, text) => {
        for (const el of this.$(sel)) this.texts.push({ el, start: t0 + at * k, dur: dur * k, text, win });
        return api;
      },
      // Classe CSS présente entre `at` et `until` (fin de scène par défaut).
      cls: (sel, at, name, until = Infinity) => {
        for (const el of this.$(sel)) this.classes.push({ el, name, start: t0 + at * k, end: t0 + until * k, win });
        return api;
      },
    };
    return api;
  }

  render(t) {
    const inWin = (w) => t >= w[0] && t < w[1];
    const state = new Map();
    for (const el of this.elements) state.set(el, { ...DEFAULTS, opacity: el.hasAttribute("data-actor") ? 0 : 1 });

    // Pour chaque propriété : l'animation commencée la plus récente gagne ;
    // si aucune n'a commencé, on prend le point de départ de la première à venir.
    const best = new Map();
    for (const tw of this.tweens) {
      if (!inWin(tw.win)) continue;
      const key = tw.el;
      if (!best.has(key)) best.set(key, {});
      const slot = best.get(key);
      const cur = slot[tw.prop];
      const started = tw.start <= t;
      if (!cur) slot[tw.prop] = tw;
      else if (started && (cur.start > t || tw.start >= cur.start)) slot[tw.prop] = tw;
      else if (!started && cur.start > t && tw.start < cur.start) slot[tw.prop] = tw;
    }
    for (const [el, slot] of best) {
      const s = state.get(el);
      for (const [prop, tw] of Object.entries(slot)) {
        const p = clamp01((t - tw.start) / tw.dur);
        s[prop] = tw.start > t ? tw.from : lerp(tw.from, tw.to, tw.ease(p));
      }
    }

    for (const [el, s] of state) {
      el.style.opacity = String(clamp01(s.opacity));
      el.style.transform = `translate(${s.x}px, ${s.y}px) scale(${s.scale}) rotate(${s.rotate}deg)`;
      el.style.filter = s.blur > 0.01 ? `blur(${s.blur}px)` : "";
      el.style.visibility = s.opacity <= 0.001 ? "hidden" : "";
    }

    const textNow = new Map();
    for (const tx of this.texts) {
      if (!textNow.has(tx.el)) textNow.set(tx.el, "");
      if (inWin(tx.win) && t >= tx.start) textNow.set(tx.el, tx.text.slice(0, Math.round(clamp01((t - tx.start) / tx.dur) * tx.text.length)));
    }
    for (const [el, value] of textNow) if (el.textContent !== value) el.textContent = value;

    const clsNow = new Map();
    for (const c of this.classes) {
      const k = `${c.name}`;
      if (!clsNow.has(c.el)) clsNow.set(c.el, new Map());
      const m = clsNow.get(c.el);
      m.set(k, m.get(k) || (inWin(c.win) && t >= c.start && t < c.end));
    }
    for (const [el, m] of clsNow) for (const [name, on] of m) el.classList.toggle(name, on);
  }
}
