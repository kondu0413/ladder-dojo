import { coreVersion } from "@ladder-dojo/core";
import { Hono } from "hono";
import { getAuth, isE2EAuthBypass } from "./auth.js";
import type { MeDto } from "./dto.js";
import type { AppBindings } from "./env.js";
import { optionalUser } from "./middleware/auth.js";
import { progressRoutes } from "./routes/progress.js";
import { sandboxRoutes } from "./routes/sandbox.js";
import { submissionRoutes } from "./routes/submissions.js";

/**
 * Hono アプリ本体。`/api/*` のみ Worker が処理する(wrangler.jsonc の run_worker_first)。
 * ルート定義の型 `AppType` を apps/web が Hono RPC(hc)で参照する(D-016)。
 *
 * データアクセスはすべてこの API を通る。ブラウザから D1 に触る経路は無い(D-017 方針 1)。
 */
export const app = new Hono<AppBindings>()
  .basePath("/api")
  .get("/health", (c) =>
    c.json({
      ok: true as const,
      env: c.env.APP_ENV,
      core: coreVersion(),
      // E2E 専用ログインが本番で無効であることを外から確認できるようにする(D-014)
      e2eAuthBypass: isE2EAuthBypass(c.env),
    }),
  )
  // Better Auth のハンドラ(Google ログイン開始・コールバック・セッション取得・ログアウト)
  .on(["GET", "POST"], "/auth/*", (c) => getAuth(c.env).handler(c.req.raw))
  /** ログイン中のユーザー。未ログインでも 200 で `user: null` を返す(§3.5) */
  .get("/me", optionalUser, (c) => c.json<MeDto>({ user: c.get("user") ?? null }))
  .route("/progress", progressRoutes)
  .route("/sandbox", sandboxRoutes)
  .route("/submissions", submissionRoutes)
  .notFound((c) => c.json({ error: "not_found" } as const, 404))
  .onError((err, c) => {
    console.error("unhandled error", err);
    return c.json({ error: "internal_error" } as const, 500);
  });

export type AppType = typeof app;
