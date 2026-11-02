// Montage des vidéos : liste ordonnée de scènes (voir scenes.js).
// Fichier lu à la fois par le navigateur et par scripts/render.mjs.
export default {
  // Le film complet, environ 28 s : présentation produit, LinkedIn, site.
  explainer: { title: "FOVE en 30 secondes", scenes: ["hook", "qr", "wallet", "scan", "reward", "outro"] },
  // Côté client : QR en caisse puis carte dans le Wallet, environ 14 s.
  inscription: { title: "Une carte en 30 secondes", scenes: ["qr", "wallet", "outro"], hideSteps: true },
  // Côté commerçant : scan en caisse et récompense, environ 14 s.
  caisse: { title: "Le scan en caisse", scenes: ["scan", "reward", "outro"], hideSteps: true },
  // Anti-papier : la fin des cartes oubliées ou perdues, environ 13 s.
  fidelite: { title: "Fini les cartes papier", scenes: ["hook", "wallet", "outro"], hideSteps: true },
  // Rétention & fidélisation : la récompense qui fait revenir le client, environ 13 s.
  retention: { title: "Faites revenir vos clients", scenes: ["hook", "reward", "outro"], hideSteps: true },
  // Immersion comptoir : du scan au tampon sans friction, environ 19 s.
  comptoir: { title: "L'expérience au comptoir", scenes: ["qr", "scan", "reward", "outro"], hideSteps: true },
};
