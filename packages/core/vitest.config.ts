import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
      reporter: ["text-summary"],
      // DECISIONS.md D-011:「カバレッジは core で 90% 以上を目標」を CI で強制する
      thresholds: { statements: 95, branches: 88, functions: 95, lines: 95 },
    },
  },
});
