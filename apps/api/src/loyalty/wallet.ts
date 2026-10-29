/**
 * Portefeuilles mobiles. Google Wallet est implémenté (`cards/google-wallet.ts`),
 * activé seulement si ses identifiants sont configurés. Apple Wallet reste à
 * venir derrière la même interface (certificat Pass Type ID requis).
 */
export interface WalletCardState {
  accountId: string;
  programId: string;
  tenantName: string;
  programName: string;
  holder: string;
  cardNumber: string;
  /** Contenu du QR personnel, lu par le scanner. */
  qrPayload: string;
  cardUrl: string;
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
