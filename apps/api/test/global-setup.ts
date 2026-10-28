import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { config } from "dotenv";

/** Base de test dédiée, migrée avant la suite. Jamais la base de .env. */
export default function setup() {
  config({ path: resolve(__dirname, "../../../.env"), quiet: true });
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !/fove_test|_test\b|test/.test(url)) throw new Error("TEST_DATABASE_URL doit pointer vers une base de test");
  execSync("npx prisma migrate deploy", {
    cwd: resolve(__dirname, "../../../packages/database"),
    env: { ...process.env, DATABASE_URL: url, DIRECT_DATABASE_URL: url },
    stdio: "pipe",
  });
}
