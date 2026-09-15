import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * apps/web のユニットテスト(React Testing Library を使う部品単位のテスト、D-011)。
 * Playwright の E2E(`e2e/*.spec.ts`)は vitest の対象外にする。
 */
export default defineConfig({
  plugins: [react()],
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
  },
});
