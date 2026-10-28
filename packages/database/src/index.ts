import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/client/client";

export * from "../generated/client/client";

export function createPrismaClient(url: string = process.env.DATABASE_URL ?? ""): PrismaClient {
  if (!url) throw new Error("DATABASE_URL manquante");
  const adapter = new PrismaPg({ connectionString: url });
  return new PrismaClient({ adapter });
}
