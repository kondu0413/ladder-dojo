import { applyD1Migrations, env } from "cloudflare:test";

// 各テストファイルの実行前にローカル D1 へマイグレーションを適用する(D-011 / D-012 安全策 (2))
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
