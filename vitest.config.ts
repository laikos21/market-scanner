import path from "node:path";

import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(
            path.join(import.meta.dirname, "migrations"),
          ),
          ALPACA_KEY_ID: "test-key",
          ALPACA_SECRET_KEY: "test-secret",
          TELEGRAM_BOT_TOKEN: "123456:test-token",
          TELEGRAM_CHAT_ID: "123456789",
          API_TOKEN: "test-api-token-123456",
          WEB_PASSWORD: "test-web-password-123456",
        },
      },
    })),
  ],
  test: {
    setupFiles: ["./test/apply-migrations.ts"],
  },
});

