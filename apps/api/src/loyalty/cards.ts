import type { Prisma } from "@fove/database";
import { cardNumber, randomToken, sha256 } from "../common/crypto";

export interface NewCard {
  accountId: string;
  /** Jeton secret du lien de la carte, renvoyé une seule fois. */
  accessToken: string;
}

/**
 * Crée un compte de fidélité avec numéro lisible, QR personnel et jeton
 * d'accès. Seule l'empreinte du jeton d'accès est stockée. Le numéro de carte
 * tire 40 bits d'aléa : une collision ferait échouer la transaction, qu'il
 * suffit de rejouer.
 */
export async function createCard(
  tx: Prisma.TransactionClient,
  data: { tenantId: string; programId: string; customerId: string; status: "ACTIVE" | "PENDING_VERIFICATION" },
): Promise<NewCard> {
  const accessToken = randomToken("fvc_", 32);
  const account = await tx.loyaltyAccount.create({
    data: { ...data, cardNumber: cardNumber(), qrToken: randomToken("fvq_", 18), accessTokenHash: sha256(accessToken) },
  });
  return { accountId: account.id, accessToken };
}

/** Nouveau jeton d'accès : l'ancien lien de carte cesse de fonctionner. */
export function rotateAccessToken(): { accessToken: string; accessTokenHash: string } {
  const accessToken = randomToken("fvc_", 32);
  return { accessToken, accessTokenHash: sha256(accessToken) };
}
