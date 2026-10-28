import { config } from "dotenv";
// .env.local (dev) d'abord : dotenv ne remplace jamais une variable déjà définie.
config({ path: "../../.env.local", quiet: true });
config({ path: "../../.env", quiet: true });
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx --env-file-if-exists=../../.env --env-file-if-exists=../../.env.local prisma/seed.ts" },
  datasource: { url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? "" },
});
