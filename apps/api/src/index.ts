import { app } from "./app.js";
import type { Env } from "./env.js";
import { computeGlobalRankings } from "./ranking.js";

export default {
  fetch: (request, env, ctx) => app.fetch(request, env, ctx),
  /**
   * Cron Triggers(DECISIONS.md D-010)。1 日 1 回、全体ランキングを計算して保存する。
   * 全ユーザーの集計はリクエストのたびにやると D1 の読み取り行数を使いすぎるため。
   */
  scheduled: async (_event, env, ctx) => {
    // 成功時はログを出さない(COST.md: Workers Logs はエラー時のみ)。
    // 実行結果は Cloudflare のダッシュボードの Cron Triggers で確認できる
    ctx.waitUntil(
      computeGlobalRankings(env).catch((err: unknown) => {
        console.error("ranking computation failed", err);
      }),
    );
  },
} satisfies ExportedHandler<Env>;
