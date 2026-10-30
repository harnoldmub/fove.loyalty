/**
 * Segmentation RFM (Récence, Fréquence, Montant) inspirée de Sidely (SFA / Force de Vente Retail).
 *
 * Transforme les données d'achat et de visites en statuts relationnels immédiatement
 * compréhensibles et exploitables par le commerçant et les vendeurs en caisse.
 */

export type CustomerSegment = "NEW" | "VIP" | "REGULAR" | "AT_RISK" | "DORMANT";

export interface CustomerSegmentResult {
  segment: CustomerSegment;
  label: string;
  badgeVariant: "mint" | "cobalt" | "amber" | "coral" | "gray";
  daysSinceLastVisit: number | null;
  description: string;
  suggestedAction: string;
}

export function computeCustomerSegment(params: {
  totalVisits: number;
  totalSpend?: number | string | null;
  lastVisitAt?: Date | string | null;
  createdAt: Date | string;
  now?: Date;
}): CustomerSegmentResult {
  const now = params.now ?? new Date();
  const createdAt = new Date(params.createdAt);
  const lastVisit = params.lastVisitAt ? new Date(params.lastVisitAt) : null;
  const daysSinceCreation = Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / 86_400_000));
  const daysSinceLastVisit = lastVisit ? Math.max(0, Math.floor((now.getTime() - lastVisit.getTime()) / 86_400_000)) : null;
  const visits = params.totalVisits || 0;
  const spend = typeof params.totalSpend === "string" ? parseFloat(params.totalSpend) || 0 : params.totalSpend || 0;

  // 1. Client VIP : fréquence très élevée (>= 8 visites) ou dépenses importantes (>= 500 unités)
  // avec une activité pas trop ancienne (< 60 jours)
  if ((visits >= 8 || spend >= 500) && (daysSinceLastVisit === null || daysSinceLastVisit <= 60)) {
    return {
      segment: "VIP",
      label: "Habitué VIP",
      badgeVariant: "cobalt",
      daysSinceLastVisit,
      description: "Client fidèle à très forte valeur pour votre enseigne.",
      suggestedAction: "Accueillir chaleureusement par son prénom avec une attention VIP, faire découvrir les nouveautés en avant-première.",
    };
  }

  // 2. Nouveau client : inscrit récemment (< 21 jours) avec 0 ou 1 seule visite
  if (visits <= 1 && daysSinceCreation <= 21) {
    return {
      segment: "NEW",
      label: "Nouveau membre",
      badgeVariant: "mint",
      daysSinceLastVisit,
      description: "Adhésion récente. Découvre votre univers et vos avantages.",
      suggestedAction: "Expliquer les règles du programme et l'inviter à revenir valider son prochain passage.",
    };
  }

  // 3. Client dormant / perdu : aucune visite depuis plus de 75 jours, ou inscrit depuis longtemps sans visite
  if ((daysSinceLastVisit !== null && daysSinceLastVisit > 75) || (daysSinceLastVisit === null && daysSinceCreation > 60)) {
    return {
      segment: "DORMANT",
      label: "Dormant",
      badgeVariant: "gray",
      daysSinceLastVisit,
      description: "Inactif depuis longtemps. Risque élevé de perte définitive.",
      suggestedAction: "Envoyer un message WhatsApp de reconquête avec une offre spéciale de bienvenue.",
    };
  }

  // 4. Client en risque d'attrition : avait des habitudes mais n'est pas venu depuis 35 à 75 jours
  if (daysSinceLastVisit !== null && daysSinceLastVisit >= 35 && daysSinceLastVisit <= 75) {
    return {
      segment: "AT_RISK",
      label: "En risque",
      badgeVariant: "coral",
      daysSinceLastVisit,
      description: "Espace inhabituellement long depuis sa dernière venue.",
      suggestedAction: "Relancer proactivement sur WhatsApp avec son solde de points/tampons actuel.",
    };
  }

  // 5. Client régulier actif : visite récente (< 35 jours) avec au moins 2 visites
  return {
    segment: "REGULAR",
    label: "Actif régulier",
    badgeVariant: "mint",
    daysSinceLastVisit,
    description: "Visites régulières et comportement fidèle.",
    suggestedAction: "Consolider la relation et rappeler le solde avant la prochaine récompense.",
  };
}
