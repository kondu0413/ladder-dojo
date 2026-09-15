import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

/**
 * API テスト(D-011): workerd 上でローカル D1 を使い、Hono アプリを直接呼ぶ。
 * migrations/*.sql はテスト開始前に test/setup.ts が適用する。
 */
export default defineConfig(async () => {
  const migrations = await readD1Migrations("./migrations");
  return {
    plugins: [
      cloudflareTest({
        // env.e2e を使う。メール/パスワードが有効になり、テストからログインできる(D-014)。
        // 本番設定(E2E_AUTH_BYPASS 無し)の検証は、テスト側で env を差し替えて行う
        wrangler: { configPath: "./wrangler.jsonc", environment: "e2e" },
        miniflare: {
          bindings: { TEST_MIGRATIONS: migrations },
        },
      }),
    ],
    test: {
      include: ["test/**/*.test.ts"],
      setupFiles: ["./test/setup.ts"],
    },
  };
});
