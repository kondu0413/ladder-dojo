import { coreVersion } from "@ladder-dojo/core";
import { Hono } from "hono";
import { getAuth, isE2EAuthBypass } from "./auth.js";
import type { MeDto } from "./dto.js";
import type { AppBindings } from "./env.js";
import { optionalUser } from "./middleware/auth.js";
import { mistakeRoutes } from "./routes/mistakes.js";
import { orgRoutes } from "./routes/orgs.js";
import { problemRoutes } from "./routes/problems.js";
import { progressRoutes } from "./routes/progress.js";
import { pushRoutes } from "./routes/push.js";
import { rankingRoutes } from "./routes/rankings.js";
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
  .route("/mistakes", mistakeRoutes)
  .route("/problems", problemRoutes)
  .route("/orgs", orgRoutes)
  .route("/push", pushRoutes)
  .route("/rankings", rankingRoutes)
  .route("/sandbox", sandboxRoutes)
  .route("/submissions", submissionRoutes)
  .notFound((c) => c.json({ error: "not_found" } as const, 404))
  .onError((err, c) => {
    // クライアントが画面遷移や入力の切り替えでリクエストを中断した場合、
    // 途中の D1 クエリも一緒に中断される。レスポンスは誰も受け取らないので、
    // 障害としては扱わない(ログを汚さない)
    if (!c.req.raw.signal.aborted) {
      // Drizzle のエラーメッセージには SQL とバインド値(利用者の入力)が入るので、
      // ログには原因だけを出す(Workers Logs にユーザーの検索語を残さない)
      const cause = err instanceof Error && err.cause instanceof Error ? err.cause.message : "";
      console.error(
        `unhandled error on ${c.req.method} ${new URL(c.req.url).pathname}: ${cause || (err instanceof Error ? err.name : "unknown")}`,
      );
    }
    return c.json({ error: "internal_error" } as const, 500);
  });

export type AppType = typeof app;
