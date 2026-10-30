/**
 * Générateur de messages et liens WhatsApp pour commerçants et caissiers.
 *
 * Combine les forces du partage instantané Matchkwata (lien stable de carte 9:16)
 * et de la force de vente proactive Sidely (relance ciblée des clients dormants ou proches d'une récompense).
 */

export type WhatsAppActionKind = "CARD_SHARE" | "REENGAGEMENT" | "NEAR_REWARD" | "VIP_THANK_YOU";

export interface WhatsAppMessageOptions {
  kind: WhatsAppActionKind;
  customerFirstName: string;
  businessName: string;
  balance?: number;
  unitLabel?: string; // "tampons" ou "points"
  target?: number; // ex: 10 tampons
  rewardName?: string;
  cardUrl?: string;
  phone?: string | null;
}

export function buildWhatsAppMessage(options: WhatsAppMessageOptions): string {
  const name = options.customerFirstName?.trim() || "Cher client";
  const store = options.businessName?.trim() || "notre boutique";
  const balance = options.balance ?? 0;
  const unit = options.unitLabel || "tampons";
  const cardUrl = options.cardUrl?.trim();
  const cardLine = cardUrl ? `\n\n📱 Retrouvez votre carte en ligne : ${cardUrl}` : "";

  switch (options.kind) {
    case "CARD_SHARE":
      return (
        `Bonjour ${name} !\n\n` +
        `Voici votre carte de fidélité chez ${store}.\n` +
        `Votre solde actuel : *${balance} ${unit}*.` +
        cardLine +
        `\n\nÀ très bientôt !`
      );

    case "REENGAGEMENT":
      return (
        `Bonjour ${name} !\n\n` +
        `Vous nous manquez chez ${store} ! 😊\n` +
        `Votre carte de fidélité contient actuellement *${balance} ${unit}* qui n'attendent que vous.` +
        cardLine +
        `\n\nPassez nous voir cette semaine pour votre prochain passage !`
      );

    case "NEAR_REWARD": {
      const remaining = Math.max(1, (options.target ?? 10) - balance);
      const rewardText = options.rewardName ? `votre ${options.rewardName}` : "votre récompense";
      return (
        `Bonjour ${name} !\n\n` +
        `Bonne nouvelle : il ne vous manque que *${remaining} ${unit === "tampons" ? "passage" : "point"}${remaining > 1 ? "s" : ""}* ` +
        `pour débloquer ${rewardText} chez ${store} ! 🎉` +
        cardLine +
        `\n\nÀ très vite en magasin !`
      );
    }

    case "VIP_THANK_YOU":
      return (
        `Bonjour ${name} !\n\n` +
        `Toute l'équipe de ${store} tenait à vous remercier chaleureusement pour votre fidélité exemplaire ! 🌟\n` +
        `Vous faites partie de nos membres privilégiés avec *${balance} ${unit}* cumulés.` +
        cardLine +
        `\n\nNous avons hâte de vous accueillir à nouveau.`
      );
  }
}

/**
 * Nettoie le numéro de téléphone au format chiffres stricts pour wa.me (sans +, tirets, espaces).
 */
export function sanitizePhoneForWhatsApp(phone: string): string {
  return phone.replace(/\D/g, "");
}

/**
 * Produit l'URL universelle `https://wa.me/<phone>?text=...` pour ouvrir WhatsApp Web ou Mobile.
 */
export function buildWhatsAppLink(phone: string | null | undefined, message: string): string | null {
  const text = encodeURIComponent(message);
  if (!phone) {
    // Si pas de téléphone prérempli, lien WhatsApp générique permettant de choisir le contact
    return `https://wa.me/?text=${text}`;
  }
  const cleanPhone = sanitizePhoneForWhatsApp(phone);
  if (!cleanPhone) return null;
  return `https://wa.me/${cleanPhone}?text=${text}`;
}
