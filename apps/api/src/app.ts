import { coreVersion } from "@ladder-dojo/core";
import { Hono } from "hono";
import type { AppBindings } from "./env.js";

/**
 * Hono アプリ本体。`/api/*` のみ Worker が処理する(wrangler.jsonc の run_worker_first)。
 * ルート定義の型 `AppType` を apps/web が Hono RPC(hc)で参照する(D-016)。
 */
export const app = new Hono<AppBindings>()
  .basePath("/api")
  .get("/health", (c) =>
    c.json({
      ok: true as const,
      env: c.env.APP_ENV,
      core: coreVersion(),
    }),
  )
  .notFound((c) => c.json({ error: "not_found" }, 404));

export type AppType = typeof app;
