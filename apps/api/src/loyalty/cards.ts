import type { Prisma } from "@fove/database";
import { tenantInitials } from "@fove/shared";
import { loadConfig } from "../config";
import { cardNumber, decrypt, encrypt, randomToken, sha256 } from "../common/crypto";

export interface NewCard {
  accountId: string;
  /** Jeton secret du lien de la carte. */
  accessToken: string;
}

/**
 * Jeton du lien de carte : l'empreinte sert à la recherche, la version chiffrée
 * permet de renvoyer le même lien (WhatsApp, « Retrouver ma carte ») sans le
 * renouveler — une demande malveillante ne peut donc pas couper la carte d'un client.
 */
export function newAccessToken(): { accessToken: string; accessTokenHash: string; accessTokenEncrypted: string } {
  const accessToken = randomToken("fvc_", 32);
  return { accessToken, accessTokenHash: sha256(accessToken), accessTokenEncrypted: encrypt(accessToken, loadConfig().APP_ENCRYPTION_KEY) };
}

export function readAccessToken(encrypted: string | null): string | null {
  if (!encrypted) return null;
  try {
    return decrypt(encrypted, loadConfig().APP_ENCRYPTION_KEY);
  } catch {
    return null;
  }
}

/**
 * Crée un compte de fidélité avec numéro lisible personnalisé aux 2 initiales du restaurant/commerce,
 * QR personnel et lien de carte.
 */
export async function createCard(
  tx: Prisma.TransactionClient,
  data: { tenantId: string; programId: string; customerId: string; status: "ACTIVE" | "PENDING_VERIFICATION" },
  tenantNameOrPrefix?: string,
): Promise<NewCard> {
  let initials = tenantNameOrPrefix ? tenantInitials(tenantNameOrPrefix) : null;
  if (!initials) {
    const tenant = await tx.tenant.findUnique({
      where: { id: data.tenantId },
      select: { name: true },
    });
    initials = tenantInitials(tenant?.name);
  }

  const { accessToken, accessTokenHash, accessTokenEncrypted } = newAccessToken();
  const account = await tx.loyaltyAccount.create({
    data: { ...data, cardNumber: cardNumber(initials), qrToken: randomToken("fvq_", 18), accessTokenHash, accessTokenEncrypted },
  });
  return { accountId: account.id, accessToken };
}
