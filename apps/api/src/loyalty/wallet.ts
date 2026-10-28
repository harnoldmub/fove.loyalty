/**
 * Point d'extension pour Apple Wallet et Google Wallet (non implémentés en V1).
 * Un fournisseur reçoit l'état public d'une carte et renvoie un lien ou un
 * fichier .pkpass ; il est appelé après chaque opération qui modifie le solde.
 */
export interface WalletCardState {
  accountId: string;
  tenantName: string;
  programName: string;
  cardNumber: string;
  qrPayload: string;
  balance: number;
  unit: "points" | "tampons";
  primaryColor: string;
  logoUrl: string | null;
}

export interface WalletProvider {
  readonly id: "apple" | "google";
  isConfigured(): boolean;
  /** Lien d'ajout au portefeuille (Google) ou URL de téléchargement du pass (Apple). */
  createPass(card: WalletCardState): Promise<{ url: string }>;
  /** Mise à jour du pass existant après une opération. */
  updatePass(card: WalletCardState): Promise<void>;
}

/** Registre vide en V1 : la carte web reste la seule carte. */
export const walletProviders: WalletProvider[] = [];
