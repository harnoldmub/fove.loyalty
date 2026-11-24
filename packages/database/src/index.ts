import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/client/client";

export * from "../generated/client/client";

export function createPrismaClient(url: string = process.env.DATABASE_URL ?? ""): PrismaClient {
  if (!url) throw new Error("DATABASE_URL manquante");
  const adapter = new PrismaPg({ connectionString: url });
  // Le lien d'une fiche vers le compte client FOVE n'est jamais renvoyé par défaut : le commerçant
  // ne doit rien voir du compte (ni pouvoir reconnaître un client d'un commerce à l'autre).
  // Le module compte client le demande explicitement (`select`) quand il en a besoin.
  return new PrismaClient({ adapter, omit: { customer: { clientAccountId: true } } }) as unknown as PrismaClient;
}
