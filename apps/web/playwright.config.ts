import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/**
 * E2E(D-011 / D-014): ビルド済み SPA を配信する `wrangler dev --env e2e`(ローカル D1)に接続する。
 * E2E_BASE_URL が設定されていればそのサーバーを使い、無ければ wrangler dev を自動起動する。
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:8787";

// この開発環境には Playwright が期待する版と異なる Chromium しか無いことがある。
// PLAYWRIGHT_CHROMIUM_PATH が指すバイナリがあればそれを使う(CI では未設定 = Playwright 標準の Chromium)。
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const launchOptions =
  chromiumPath && existsSync(chromiumPath) ? { executablePath: chromiumPath } : {};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  ...(process.env.CI ? { workers: 2 } : {}),
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    launchOptions,
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  // E2E_BASE_URL 指定時は既存サーバーに接続し、wrangler dev を起動しない
  ...(process.env.E2E_BASE_URL
    ? {}
    : {
        webServer: {
          command: "pnpm --filter @ladder-dojo/api e2e:serve",
          url: `${baseURL}/api/health`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          stdout: "pipe" as const,
          stderr: "pipe" as const,
        },
      }),
});
