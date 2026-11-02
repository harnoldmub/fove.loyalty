// Les scènes du récit FOVE. Chaque scène place elle-même tout ce qu'elle
// montre (positions, écrans, tampons) : on peut donc les monter dans
// n'importe quel ordre dans videos.js.
//
// Repère : la boîte visuelle fait 900 × 1100, les positions de téléphones
// ci-dessous sont en pixels dans cette boîte.

const A_CENTER = { x: 250, y: 140 };
const A_RIGHT = { x: 480, y: 170 };
const A_LEFT = { x: 20, y: 170 };
const B_RIGHT = { x: 480, y: 170 };

const stamp = (n) => `#stamps span:nth-child(${n})`;
const stampsUpTo = (n) => Array.from({ length: n }, (_, i) => stamp(i + 1)).join(", ");

// Logo d'angle présent pendant toutes les scènes sauf le carton de fin.
const corner = (s, first) => (first ? s.in("#cornerLogo", 0, { dur: 0.5, y: -10 }) : s.set("#cornerLogo", 0, { opacity: 1 }));

export const scenes = {
  // Accroche : la carte papier tombe, la carte FOVE apparaît dans le téléphone.
  hook: {
    dur: 4.2,
    build(s, { first }) {
      corner(s, first);
      s.in("#c-hook1", 0.15, { dur: 0.7, y: 40 }).out("#c-hook1", 1.85);
      s.to("#paper", 0.1, 0.7, { opacity: [0, 1], y: [80, 0], rotate: [-12, -5] }, "back");
      s.to("#paper", 1.55, 0.8, { y: [0, 760], rotate: [-5, -28], opacity: [1, 0] }, "in");

      s.in("#c-hook2", 2.15, { dur: 0.7, y: 40 }).out("#c-hook2", 3.85);
      s.set("#poseA", 0, A_CENTER);
      s.to("#phoneA", 1.95, 0.9, { opacity: [0, 1], y: [300, 0] }, "back");
      s.set("#scrPass, #passCount1", 0, { opacity: 1 });
      s.cls(stamp(1), 0, "on");
      s.out("#phoneA", 3.8, { y: 30 });
    },
  },

  // Étape 1 : le client scanne le présentoir et remplit le formulaire.
  qr: {
    dur: 5.4,
    build(s, { first }) {
      corner(s, first);
      s.in("#c-qr", 0.15).out("#c-qr", 5.0);
      s.to("#standee", 0.2, 0.7, { opacity: [0, 1], x: [-80, 0] }, "out");
      s.set("#poseA", 0, A_RIGHT);
      s.to("#phoneA", 0.45, 0.8, { opacity: [0, 1], y: [220, 0] }, "back");

      s.set("#scrCamera", 0, { opacity: 1 });
      s.to("#camQr", 0.6, 1.0, { x: [70, 0], y: [-50, 0], scale: [0.78, 1], rotate: [8, 0] }, "inOut");
      s.to("#finderA", 1.55, 0.6, { scale: [1.14, 1] }, "spring");
      s.in("#camChip", 1.85, { y: 24, dur: 0.45 });
      s.out("#scrCamera", 2.5, { dur: 0.25, y: 0 });

      s.in("#scrForm", 2.55, { y: 40, dur: 0.45 });
      s.set("#caretName", 2.85, { opacity: 1 }).set("#caretName", 3.6, { opacity: 0 });
      s.type("#typeName", 2.95, 0.5, "Grâce");
      s.set("#caretPhone", 3.6, { opacity: 1 }).set("#caretPhone", 4.5, { opacity: 0 });
      s.type("#typePhone", 3.65, 0.8, "081 234 56 78");
      s.to("#tapCreate", 4.55, 0.25, { opacity: [0, 1], scale: [0.4, 1] }).to("#tapCreate", 4.8, 0.2, { opacity: [1, 0] });
      s.cls("#btnCreate", 4.55, "pressed", 4.85);
      s.out("#scrForm", 5.15, { dur: 0.25, y: 0 });

      s.to("#standee", 4.9, 0.4, { opacity: [1, 0], x: [0, -90] }, "in");
      s.to("#poseA", 4.9, 0.5, { x: [A_RIGHT.x, A_CENTER.x], y: [A_RIGHT.y, A_CENTER.y] }, "inOut");
    },
  },

  // Étape 2 : la carte s'affiche puis part dans le Wallet.
  wallet: {
    dur: 4.6,
    build(s, { first }) {
      corner(s, first);
      s.in("#c-wallet", 0.1).out("#c-wallet", 4.2);
      s.set("#poseA", 0, A_CENTER);
      if (first) s.in("#phoneA", 0, { y: 200, dur: 0.7 });
      else s.set("#phoneA", 0, { opacity: 1 });
      s.to("#scrPass", 0, 0.2, { opacity: [0, 1] });
      s.to("#pass", 0.1, 0.8, { opacity: [0, 1], y: [140, 0], scale: [0.9, 1] }, "back");
      s.cls(stamp(1), 0.65, "on").to(stamp(1), 0.65, 0.6, { scale: [1.5, 1] }, "spring");
      s.set("#passCount1", 0, { opacity: 1 });

      s.in("#badges", 0.9, { y: 30, dur: 0.5 });
      s.to("#badgeApple", 1.9, 0.3, { scale: [1, 0.95] }, "out").to("#badgeApple", 2.2, 0.2, { scale: [0.95, 1] });
      s.to("#tapWallet", 1.9, 0.25, { opacity: [0, 1], scale: [0.4, 1] }).to("#tapWallet", 2.15, 0.2, { opacity: [1, 0] });
      s.out("#badges", 2.3, { y: 10, dur: 0.25 });
      s.to("#added", 2.45, 0.6, { opacity: [0, 1], scale: [0.85, 1] }, "back");
      s.out("#added", 4.0, { y: 0, dur: 0.3 });

      s.to("#poseA", 4.1, 0.5, { x: [A_CENTER.x, A_LEFT.x], y: [A_CENTER.y, A_LEFT.y] }, "inOut");
    },
  },

  // Étape 3 : la caisse scanne la carte, le dixième tampon tombe.
  scan: {
    dur: 5.4,
    build(s, { first }) {
      corner(s, first);
      s.in("#c-scan", 0.1).out("#c-scan", 5.0);
      s.set("#poseA", 0, A_LEFT);
      if (first) s.in("#phoneA", 0, { y: 200, dur: 0.7 });
      else s.set("#phoneA", 0, { opacity: 1 });
      s.set("#scrPass", 0, { opacity: 1 });
      s.cls(stampsUpTo(9), 0, "on");
      s.set("#passCount9", 0, { opacity: 1 }).to("#passCount9", 2.4, 0.15, { opacity: [1, 0] });
      s.to("#passCount10", 2.45, 0.4, { opacity: [0, 1], y: [10, 0] });

      s.set("#poseB", 0, B_RIGHT);
      s.to("#phoneB", 0.2, 0.8, { opacity: [0, 1], x: [140, 0] }, "out");
      s.set("#scrScanner", 0, { opacity: 1 }).set("#flash, #scanline", 0, { opacity: 0 });
      s.to("#scanline", 0.8, 0.6, { opacity: [1, 1], y: [0, 250] }, "inOut").to("#scanline", 1.4, 0.6, { opacity: [1, 1], y: [250, 0] }, "inOut");
      s.set("#scanline", 2.0, { opacity: 0 });
      s.to("#finderB", 1.9, 0.6, { scale: [1.12, 1] }, "spring");
      s.to("#flash", 2.05, 0.35, { opacity: [0.85, 0] }, "out");
      s.out("#scrScanner", 2.2, { dur: 0.2, y: 0 });

      s.to("#scrOk", 2.2, 0.2, { opacity: [0, 1] });
      s.to("#okBadge", 2.3, 0.9, { opacity: [0, 1], scale: [0.4, 1] }, "spring");
      s.in("#okTitle", 2.5, { y: 20 }).in("#okWho", 2.65, { y: 20 });
      s.to("#okReward", 3.0, 0.6, { opacity: [0, 1], y: [24, 0], scale: [0.92, 1] }, "back");

      s.cls(stamp(10), 2.4, "on").to(stamp(10), 2.4, 0.7, { scale: [1.7, 1] }, "spring");
      s.to("#chipStamp", 2.4, 0.6, { opacity: [0, 1], y: [30, 0], scale: [0.6, 1] }, "back");
      s.out("#chipStamp", 3.9, { y: -20 });

      s.to("#phoneB", 4.6, 0.45, { opacity: [1, 0], x: [0, 140] }, "in");
      s.to("#poseA", 4.8, 0.6, { x: [A_LEFT.x, A_CENTER.x], y: [A_LEFT.y, A_CENTER.y] }, "inOut");
      s.out("#scrPass", 5.15, { dur: 0.25, y: 0 });
    },
  },

  // La récompense arrive en notification sur l'écran verrouillé.
  reward: {
    dur: 4.4,
    build(s, { first }) {
      corner(s, first);
      s.in("#c-reward", 0.1).out("#c-reward", 4.1);
      s.set("#poseA", 0, A_CENTER);
      if (first) s.in("#phoneA", 0, { y: 200, dur: 0.7 });
      else s.set("#phoneA", 0, { opacity: 1 });
      s.to("#scrLock", 0, 0.2, { opacity: [0, 1] });
      s.to("#notif", 0.7, 0.7, { opacity: [0, 1], y: [-70, 0], scale: [0.94, 1] }, "back");
      s.to("#burst1", 0.75, 1.4, { opacity: [0.9, 0], scale: [0.5, 1.5] }, "out");
      s.to("#burst2", 1.1, 1.4, { opacity: [0.7, 0], scale: [0.5, 1.6] }, "out");
      s.out("#phoneA", 3.95, { y: 30, dur: 0.45 });
    },
  },

  // Carton de fin : logo, promesse, appel à l'action.
  outro: {
    dur: 4.0,
    build(s) {
      s.to("#outro", 0, 0.45, { opacity: [0, 1] });
      s.to("#outroLogo", 0.25, 0.8, { opacity: [0, 1], y: [24, 0], scale: [0.92, 1] }, "back");
      s.in("#outroTitle", 0.7, { y: 30 });
      s.in("#outroSub", 0.95, { y: 24 });
      s.to("#outroCta", 1.3, 0.7, { opacity: [0, 1], y: [20, 0], scale: [0.9, 1] }, "back");
    },
  },
};
