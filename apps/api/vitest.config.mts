import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    pool: "forks",
    fileParallelism: false,
    testTimeout: 30_000,
    // Double authentification des admins coupée par défaut dans les tests ; test/admin-mfa.test.ts la réactive.
    env: { ADMIN_MFA: "off" },
    hookTimeout: 60_000,
  },
});
