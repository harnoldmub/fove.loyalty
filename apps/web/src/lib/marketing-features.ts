/**
 * Fonctionnalités présentées sur la vitrine (/fonctionnalites) : groupes, ancres et offres.
 * Les textes sont dans `marketing.features.groups` ; la grille des tarifs pointe vers les ancres.
 */
export const FEATURE_GROUPS = [
  {
    key: "program",
    items: [
      { key: "points", anchor: "points-tampons" },
      { key: "rules", anchor: "regles" },
      { key: "rewards", anchor: "recompenses" },
    ],
  },
  {
    key: "customers",
    items: [
      { key: "qr", anchor: "inscription-qr" },
      { key: "wallet", anchor: "wallet" },
      { key: "push", anchor: "notifications", paid: true },
      { key: "geo", anchor: "proximite" },
      { key: "crm", anchor: "fichier-clients" },
    ],
  },
  {
    key: "grow",
    items: [
      { key: "automations", anchor: "relances", paid: true },
      { key: "birthday", anchor: "anniversaire", paid: true },
      { key: "customerReferral", anchor: "parrainage-clients", paid: true },
      { key: "merchantReferral", anchor: "parrainage-commercants", paid: true },
    ],
  },
  {
    key: "team",
    items: [
      { key: "roles", anchor: "roles" },
      { key: "stores", anchor: "etablissements" },
      { key: "audit", anchor: "tracabilite" },
    ],
  },
  {
    key: "tools",
    items: [
      { key: "stats", anchor: "statistiques" },
      { key: "shop", anchor: "boutique-en-ligne" },
      { key: "widget", anchor: "widget" },
    ],
  },
] as const satisfies readonly { key: string; items: readonly { key: string; anchor: string; paid?: boolean }[] }[];


/** Lien vers l'explication d'une fonctionnalité sur la vitrine. */
export const featureHref = (anchor: string) => `/fonctionnalites#${anchor}`;
