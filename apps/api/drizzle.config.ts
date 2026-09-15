import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit は SQL の生成のみに使う(DECISIONS.md D-018)。
 * 適用は `wrangler d1 migrations apply`(ローカル `--local` / 本番 `--remote`)が行う。
 */
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./migrations",
});
