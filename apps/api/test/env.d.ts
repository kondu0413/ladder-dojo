import type { D1Migration } from "@cloudflare/vitest-pool-workers";
import type { Env as WorkerEnv } from "../src/env.js";

// `import { env } from "cloudflare:test"` の型は Cloudflare.Env。
// wrangler.jsonc のバインディング + テスト用 TEST_MIGRATIONS を宣言する。
declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
