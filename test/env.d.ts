import type { Env as MarketScannerEnv } from "../src/types";

declare global {
  namespace Cloudflare {
    interface Env extends MarketScannerEnv {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}

