/**
 * Textes et explications de la carte de fidélité dans Apple Wallet et Google Wallet.
 * Inspiré du modèle Match Kwata : quelqu'un qui ouvre le verso de sa carte
 * ou consulte les détails Google Wallet doit comprendre tout de suite son fonctionnement.
 */

export const MORE_INFO_LABEL = "+ D'INFOS ICI";
export const MORE_INFO_ICON = "(•••)⤴";

const plural = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`;

/** Calcule les passages/tampons restants sans descendre sous zéro. */
export const visitsLeft = (balance: number, target: number) => Math.max(0, target - Math.max(0, balance));

/** Texte du prochain avantage (« 7 passages », « 1 passage », ou « Disponible »). */
export function nextRewardValue(balance: number, target: number, isStamps = true): string {
  if (!isStamps) return `${Math.max(0, balance)} pts`;
  const left = visitsLeft(balance, target);
  return left > 0 ? plural(left, "passage", "passages") : "Disponible";
}

export interface CardSection {
  key: string;
  title: string;
  body: string;
}

/** Rubriques d'explications générales de la carte pour le commerce. */
export function getClubExplanations(tenantName: string, isStamps: boolean, target: number, rewardSummary?: string): CardSection[] {
  const clubName = tenantName.toLowerCase().includes("club") ? tenantName : `Club ${tenantName}`;

  return [
    {
      key: "welcome",
      title: `BIENVENUE AU ${clubName.toUpperCase()}`,
      body: `Votre carte de fidélité ${tenantName} : chaque passage en boutique ou commande vous rapproche d'une récompense exclusive.`,
    },
    {
      key: "how",
      title: "COMMENT FONCTIONNE MA CARTE ?",
      body: isStamps
        ? [
            "• À chaque passage en boutique, présentez votre carte et faites scanner le QR code.",
            "• Le passage s'ajoute automatiquement à votre carte (un par jour).",
            "• Les commandes payées en ligne sont également comptabilisées.",
            `• Après ${plural(target, "passage", "passages")}, votre récompense est disponible en caisse.`,
          ].join("\n")
        : [
            "• À chaque achat en boutique ou commande en ligne, présentez votre QR code.",
            "• Vos points s'accumulent automatiquement selon le montant dépensé.",
            "• Débloquez et utilisez vos récompenses en caisse quand vous le souhaitez.",
          ].join("\n"),
    },
    {
      key: "perks",
      title: "MES PRIVILÈGES",
      body: rewardSummary
        ? [
            rewardSummary,
            "• Les alertes et offres privées arrivent directement sur l'écran de votre téléphone.",
            "• Votre solde se met à jour en direct : aucun papier à garder, aucun oubli.",
          ].join("\n")
        : [
            "• Des cadeaux, réductions et privilèges réservés aux membres.",
            "• Les alertes et offres privées arrivent directement sur votre écran de téléphone.",
            "• Votre solde se met à jour en direct : aucun papier à garder, aucun oubli.",
          ].join("\n"),
    },
  ];
}

/** Récapitulatif personnel du membre sur le verso de la carte. */
export function getClubMemberSummary(params: {
  tenantName: string;
  holder: string;
  balance: number;
  isStamps: boolean;
  target: number;
  since: string;
}): CardSection {
  const clubName = params.tenantName.toLowerCase().includes("club") ? params.tenantName : `Club ${params.tenantName}`;
  const left = visitsLeft(params.balance, params.target);

  return {
    key: "member",
    title: `MA CARTE ${clubName.toUpperCase()}`,
    body: [
      `• Titulaire : ${params.holder}`,
      `• Solde : ${Math.max(0, params.balance)}${params.isStamps ? `/${params.target} passages` : " points"}`,
      `• Membre depuis ${params.since}`,
      params.isStamps
        ? left > 0
          ? `• Plus que ${plural(left, "passage", "passages")} pour obtenir votre récompense.`
          : `• Votre récompense est disponible : demandez-la à la caisse !`
        : `• Cumulez des points pour débloquer vos prochaines récompenses.`,
    ].join("\n"),
  };
}

